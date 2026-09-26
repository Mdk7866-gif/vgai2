from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.credits import refund_project_credits, reserve_project_credits
from app.openai_client import (
    OPENAI_BASE_SCENE_SPLIT_REASONING_EFFORT,
    OPENAI_PRO_SCENE_SPLIT_MODEL,
    OPENAI_PRO_SCENE_SPLIT_REASONING_EFFORT,
    OPENAI_TEXT_MODEL,
)
from app.routes.project.projectcrud import _get_owned_project
from app.routes.project.scenesplitcommon import (
    SceneSplitDraft,
    automatic_scene_split_cost,
    format_characters,
    format_style_brief,
    persist_scene_split,
)
from app.schemas.scene import GenerateScenesAutomaticRequest, GenerateScenesResponse, InvolvedCharacterRef, Scene
from app.supabase import supabase

router = APIRouter(prefix="/projects/scenes", tags=["scenes"])

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


async def _build_scene_split_draft(project: dict, characters: list[dict], script: str) -> SceneSplitDraft:
    if project["llm_model_id"] == "pro":
        llm = ChatOpenAI(
            model=OPENAI_PRO_SCENE_SPLIT_MODEL,
            api_key=settings.CHATGPT_PAID_API_KEY,
            reasoning_effort=OPENAI_PRO_SCENE_SPLIT_REASONING_EFFORT,
        )
    else:
        llm = ChatOpenAI(
            model=OPENAI_TEXT_MODEL,
            api_key=settings.CHATGPT_PAID_API_KEY,
            reasoning_effort=OPENAI_BASE_SCENE_SPLIT_REASONING_EFFORT,
        )

    structured_llm = llm.with_structured_output(SceneSplitDraft)

    human = (
        f"{format_style_brief(project)}\n\n"
        f"Characters available:\n{format_characters(characters)}\n\n"
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


@router.post("/generate_automatic", response_model=GenerateScenesResponse)
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
    cost = automatic_scene_split_cost(word_count, project.get("llm_model_id"))

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

    inserted_scenes, scene_characters_rows = await persist_scene_split(project, characters, draft)
    id_to_name = {c["id"]: c["snapshot_name"] for c in characters}

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

    return GenerateScenesResponse(
        scenes=response_scenes,
        title_of_video=draft.metadata.title,
        description_of_video=draft.metadata.description,
        tags_of_video=draft.metadata.tags,
        thumbnail_prompt=draft.metadata.thumbnail_prompt,
        thumbnail_image_url=None,
        credits_spent=cost,
        credits_remaining=new_balance,
    )
