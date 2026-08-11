import math
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media
from app.config import settings
from app.credits import refund_project_credits, reserve_project_credits
from app.gemini_client import GEMINI_PRO_TEXT_MODEL, get_gemini_chat_model
from app.routes.project.projectcrud import _get_owned_project
from app.schemas.scene import GenerateScenesAutomaticRequest, GenerateScenesAutomaticResponse, InvolvedCharacterRef, Scene
from app.supabase import supabase

router = APIRouter(prefix="/projects/scenes", tags=["scenes"])

# 1 credit per 10 words of script for the automatic (LLM) splitter; the manual
# splitter (paste-from-gemini.com, not built yet — see freescripttoscenesplitter.py)
# is 1 credit per 100 words. Defined here now so both constants live together.
WORDS_PER_CREDIT_AUTO = 10
WORDS_PER_CREDIT_MANUAL = 100


class SceneDraft(BaseModel):
    scene_number: int
    scene_text: str
    scene_image_prompt: str
    scene_animation_prompt: str
    involved_character_names: list[str] = []


class VideoMetadataDraft(BaseModel):
    title: str
    description: str
    tags: str
    thumbnail_prompt: str


class SceneSplitDraft(BaseModel):
    scenes: list[SceneDraft]
    metadata: VideoMetadataDraft
    compact_image_prompt: str
    compact_animation_prompt: str


SCENE_SPLIT_SYSTEM_MESSAGE = (
    "You are a video-production assistant for an AI faceless-content creator. Given a "
    "full narration script, the visual style template chosen for this video, and the "
    "list of characters available to appear in it, break the script down into a "
    "sequence of scenes ready for image/animation generation:\n\n"
    "- scenes: an ordered array covering the ENTIRE script with no gaps or overlaps. "
    "Each scene has: scene_number (sequential starting at 1), scene_text (the exact "
    "slice of narration this scene covers), scene_image_prompt (a prompt for "
    "generating this scene's specific visual — subject, action, setting, framing — "
    "WITHOUT restating the overall art style, since that's supplied separately), "
    "scene_animation_prompt (a prompt for animating this scene's image — camera "
    "movement, motion — also WITHOUT restating the art style), and "
    "involved_character_names (names of any of the given characters who appear in "
    "this scene, exactly matching the names given to you; empty list if none appear).\n"
    "- Target roughly the given scene-density word count per scene when deciding how "
    "often to break into a new scene.\n"
    "- metadata: title, description, and tags for the finished YouTube video (follow "
    "the given YouTube prompt for tone/format) and thumbnail_prompt (an image prompt "
    "for a thumbnail, following the given thumbnail prompt style).\n"
    "- compact_image_prompt: ONE short reusable style-prefix fragment (art style, "
    "rendering technique, color treatment, linework, aspect ratio) that will be "
    "prepended to every scene's scene_image_prompt — this is why individual scene "
    "prompts should NOT restate the style.\n"
    "- compact_animation_prompt: the same idea for scene_animation_prompt (motion/"
    "camera style, aspect ratio)."
)


def _format_style_brief(project: dict) -> str:
    return (
        f"Style template name: {project.get('snapshot_styletemplate_name')}\n"
        f"Image style prompt: {project.get('snapshot_styletemplate_image_prompt')}\n"
        f"Animation style prompt: {project.get('snapshot_styletemplate_animation_prompt')}\n"
        "YouTube title/description/tags prompt: "
        f"{project.get('snapshot_styletemplate_youtube_title_description_tags_prompt') or ''}\n"
        f"YouTube thumbnail prompt: {project.get('snapshot_styletemplate_youtube_thumbnail_image_prompt') or ''}\n"
        f"Style description: {project.get('snapshot_styletemplate_description')}\n"
        f"Scene density: {project.get('snapshot_styletemplate_scene_density')} "
        "(small = ~1-10 words of narration per scene, medium = ~10-15, high = ~15-25)\n"
        f"Image aspect ratio: {project.get('snapshot_styletemplate_image_aspect_ratio')}\n"
        f"Video aspect ratio: {project.get('snapshot_styletemplate_video_aspect_ratio')}"
    )


def _format_characters(characters: list[dict]) -> str:
    if not characters:
        return "None available."
    return "\n".join(f"- {c['snapshot_name']}: {c['snapshot_description']}" for c in characters)


async def _build_scene_split_draft(project: dict, characters: list[dict], script: str) -> SceneSplitDraft:
    if project["llm_model_id"] == "pro":
        llm = get_gemini_chat_model(GEMINI_PRO_TEXT_MODEL, temperature=0.6)
    else:
        llm = ChatOpenAI(model="gpt-4o", api_key=settings.CHATGPT_PAID_API_KEY, temperature=0.6)

    structured_llm = llm.with_structured_output(SceneSplitDraft)

    human = (
        f"{_format_style_brief(project)}\n\n"
        f"Characters available:\n{_format_characters(characters)}\n\n"
        f"Full script:\n{script}"
    )

    try:
        draft = await structured_llm.ainvoke(
            [SystemMessage(content=SCENE_SPLIT_SYSTEM_MESSAGE), HumanMessage(content=human)]
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to split script into scenes: {e}")

    if not isinstance(draft, SceneSplitDraft):
        raise HTTPException(status_code=502, detail="Scene splitting returned an unexpected format.")
    return draft


@router.post("/generate_automatic", response_model=GenerateScenesAutomaticResponse)
async def generate_scenes_automatic(
    payload: GenerateScenesAutomaticRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Splits the project's script into scene cards + video metadata via a single
    structured LLM call, replacing any previous scene batch outright."""
    project = _get_owned_project(payload.project_id, current_user.id)

    script = (project.get("script") or "").strip()
    if not script:
        raise HTTPException(status_code=400, detail="Paste a script before generating scenes.")
    if not project.get("snapshot_styletemplate_name"):
        raise HTTPException(status_code=400, detail="Import a style template before generating scenes.")

    word_count = len(script.split())
    cost = math.ceil(word_count / WORDS_PER_CREDIT_AUTO)

    characters = (
        supabase.table("project_characters")
        .select("id, snapshot_name, snapshot_description")
        .eq("project_id", project["id"])
        .execute()
    ).data

    # Reserved before the LLM call, not after it succeeds — see app/credits.py.
    new_balance = reserve_project_credits(
        current_user.id, project["id"], project["name"], "llm", cost, "splitting the script into scenes"
    )
    try:
        draft = await _build_scene_split_draft(project, characters, script)
    except HTTPException:
        new_balance = refund_project_credits(current_user.id, project["id"], project["name"], "llm", cost)
        raise

    # Regenerating replaces the previous batch outright — clean up its Cloudinary
    # assets first so re-splitting doesn't leave orphaned scene images/animations.
    old_scenes = (
        supabase.table("scenes")
        .select("generated_image_url, generated_animation_url")
        .eq("project_id", project["id"])
        .execute()
    ).data
    for old in old_scenes:
        await delete_media(old.get("generated_image_url"), resource_type="image")
        await delete_media(old.get("generated_animation_url"), resource_type="video")
    supabase.table("scenes").delete().eq("project_id", project["id"]).execute()

    compact_image_prompt = draft.compact_image_prompt.strip()
    compact_animation_prompt = draft.compact_animation_prompt.strip()

    character_by_name = {c["snapshot_name"].strip().lower(): c["id"] for c in characters}
    id_to_name = {c["id"]: c["snapshot_name"] for c in characters}

    scene_rows = [
        {
            "project_id": project["id"],
            "scene_number": i,
            "scene_text": scene_draft.scene_text,
            "scene_image_prompt": f"{compact_image_prompt}. {scene_draft.scene_image_prompt.strip()}",
            "scene_animation_prompt": f"{compact_animation_prompt}. {scene_draft.scene_animation_prompt.strip()}",
        }
        # Scene numbers are re-sequenced 1..N here regardless of what the LLM
        # returned, so the (project_id, scene_number) unique constraint can't fail.
        for i, scene_draft in enumerate(draft.scenes, start=1)
    ]
    inserted_scenes = cast(list[dict[str, Any]], supabase.table("scenes").insert(scene_rows).execute().data)

    scene_characters_rows = []
    for scene_draft, inserted in zip(draft.scenes, inserted_scenes):
        for name in scene_draft.involved_character_names:
            character_id = character_by_name.get(name.strip().lower())
            if character_id:
                scene_characters_rows.append({"scene_id": inserted["id"], "project_character_id": character_id})
    if scene_characters_rows:
        supabase.table("scene_characters").insert(scene_characters_rows).execute()

    supabase.table("projects").update(
        {
            "title_of_video": draft.metadata.title,
            "description_of_video": draft.metadata.description,
            "tags_of_video": draft.metadata.tags,
            "thumbnail_prompt": draft.metadata.thumbnail_prompt,
        }
    ).eq("id", project["id"]).execute()

    response_scenes = [
        Scene(
            **inserted,
            involved_characters=[
                InvolvedCharacterRef(id=row["project_character_id"], name=id_to_name[row["project_character_id"]])
                for row in scene_characters_rows
                if row["scene_id"] == inserted["id"] and row["project_character_id"] in id_to_name
            ],
        )
        for inserted in inserted_scenes
    ]

    return GenerateScenesAutomaticResponse(
        scenes=response_scenes,
        title_of_video=draft.metadata.title,
        description_of_video=draft.metadata.description,
        tags_of_video=draft.metadata.tags,
        thumbnail_prompt=draft.metadata.thumbnail_prompt,
        credits_spent=cost,
        credits_remaining=new_balance,
    )
