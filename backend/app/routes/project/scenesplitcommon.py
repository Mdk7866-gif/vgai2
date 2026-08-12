"""Shared scene-split types and persistence logic used by both the paid
(LLM-driven, paidscripttoscenesplitter.py) and free (paste-from-gemini.com,
freescripttoscenesplitter.py) "Generate Scenes" flows. The two differ only in
how a SceneSplitDraft gets produced — one calls an LLM, the other parses a
JSON blob the user pasted back — everything after that (replacing the
project's scene batch, writing video metadata) is identical.
"""

from typing import Any, cast

from pydantic import BaseModel

from app.cloudinary import delete_media
from app.supabase import supabase

# 1 credit per 10 words of script for the automatic (LLM) splitter; the manual
# splitter (paste-from-gemini.com) is 1 credit per 100 words — no provider is
# billed on that path, so it's priced 10x cheaper.
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


def format_style_brief(project: dict) -> str:
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


def format_characters(characters: list[dict]) -> str:
    if not characters:
        return "None available."
    return "\n".join(f"- {c['snapshot_name']}: {c['snapshot_description']}" for c in characters)


async def persist_scene_split(
    project: dict, characters: list[dict], draft: SceneSplitDraft
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Replaces the project's scene batch outright with `draft`'s scenes + video
    metadata. Returns (inserted_scenes, scene_characters_rows) for the caller to
    shape into a response."""

    # Regenerating replaces the previous batch outright — clean up its Cloudinary
    # assets first so re-splitting doesn't leave orphaned scene images/animations.
    # A re-split can come from an edited script or just a different roll of the
    # dice from the same script, so every existing scene image/animation is now
    # stale — there's no reliable way to match old scenes to new ones and decide
    # which assets are still "the same", so all of them go.
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

    # The thumbnail was generated from the previous batch's thumbnail_prompt (see
    # projects.thumbnail_prompt / imagegeneration.py's generate_thumbnail), which
    # this call is about to overwrite — the image itself is now just as stale as
    # the scene assets above, so it's discarded the same way rather than left
    # dangling in Cloudinary and displayed as if it still matched.
    old_thumbnail_url = project.get("thumbnail_image_url")
    if old_thumbnail_url:
        await delete_media(old_thumbnail_url, resource_type="image")

    compact_image_prompt = draft.compact_image_prompt.strip()
    compact_animation_prompt = draft.compact_animation_prompt.strip()

    character_by_name = {c["snapshot_name"].strip().lower(): c["id"] for c in characters}

    scene_rows = [
        {
            "project_id": project["id"],
            "scene_number": i,
            "scene_text": scene_draft.scene_text,
            "scene_image_prompt": f"{compact_image_prompt}. {scene_draft.scene_image_prompt.strip()}",
            "scene_animation_prompt": f"{compact_animation_prompt}. {scene_draft.scene_animation_prompt.strip()}",
        }
        # Scene numbers are re-sequenced 1..N here regardless of what the draft
        # contained, so the (project_id, scene_number) unique constraint can't fail.
        for i, scene_draft in enumerate(draft.scenes, start=1)
    ]
    inserted_scenes = cast(list[dict[str, Any]], supabase.table("scenes").insert(scene_rows).execute().data)

    scene_characters_rows: list[dict[str, Any]] = []
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
            # Cleared alongside the deleted asset above — a stale thumbnail_image_url
            # would otherwise keep pointing at an image that no longer exists.
            "thumbnail_image_url": None,
            "thumbnail_generation_token": None,
        }
    ).eq("id", project["id"]).execute()

    return inserted_scenes, scene_characters_rows
