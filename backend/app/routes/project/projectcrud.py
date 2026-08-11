from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media
from app.schemas.project import (
    CharacterImportRequest,
    Project,
    ProjectCharacter,
    ProjectCreate,
    ProjectUpdate,
    StyleTemplateImportRequest,
    VoiceoverSettingsUpdate,
)
from app.supabase import supabase

router = APIRouter(prefix="/projects", tags=["projects"])

# Fields snapshotted from a style_templates row onto a projects row on import —
# shared by both the create-time default-import and the explicit import endpoint
# below, so the two stay in sync if a style-template field is ever added/removed.
_STYLETEMPLATE_SNAPSHOT_FIELD_MAP = {
    "snapshot_styletemplate_name": "name",
    "snapshot_styletemplate_image_prompt": "image_prompt",
    "snapshot_styletemplate_animation_prompt": "animation_prompt",
    "snapshot_styletemplate_youtube_title_description_tags_prompt": "youtube_title_description_tags_prompt",
    "snapshot_styletemplate_youtube_thumbnail_image_prompt": "youtube_thumbnail_image_prompt",
    "snapshot_styletemplate_description": "description",
    "snapshot_styletemplate_image_aspect_ratio": "image_aspect_ratio",
    "snapshot_styletemplate_video_aspect_ratio": "video_aspect_ratio",
    "snapshot_styletemplate_scene_density": "scene_density",
}


def _style_template_snapshot(style_template: dict) -> dict:
    return {
        snapshot_field: style_template.get(source_field)
        for snapshot_field, source_field in _STYLETEMPLATE_SNAPSHOT_FIELD_MAP.items()
    }


def _get_owned_project(project_id: str, user_id: str) -> dict:
    """Fetches a project and verifies it belongs to user_id, or raises 404."""
    result = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data[0]


# Credit reservation/refund used to live here as _check_project_balance /
# _deduct_project_credits. It now lives in app/credits.py, shared with the
# miscellaneous-spend flows and backed by atomic SQL functions.


@router.get("/", response_model=list[Project])
async def list_projects(current_user: SupabaseUser = Depends(get_current_user)):
    result = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", current_user.id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/create", response_model=Project)
async def create_project(
    payload: ProjectCreate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Creates a project, auto-snapshotting the user's default character(s) (a
    user can have several — characters has no uniqueness constraint on is_default,
    unlike style_templates) and default style template, if either exists."""
    new_project = {
        "user_id": current_user.id,
        "name": payload.name,
        "script": payload.script,
        "llm_model_id": "base",
        "image_model_id": "base",
        "animation_model_id": "base",
    }
    created = supabase.table("projects").insert(new_project).execute()
    project_row = created.data[0]
    project_id = project_row["id"]

    default_characters = (
        supabase.table("characters").select("*").eq("user_id", current_user.id).eq("is_default", True).execute()
    )
    if default_characters.data:
        supabase.table("project_characters").insert(
            [
                {
                    "project_id": project_id,
                    "snapshot_name": c["name"],
                    "snapshot_description": c["description"],
                    "snapshot_character_sheet_url": c["character_sheet_url"],
                }
                for c in default_characters.data
            ]
        ).execute()

    default_style = (
        supabase.table("style_templates")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("is_default", True)
        .execute()
    )
    if default_style.data:
        updated = (
            supabase.table("projects")
            .update(_style_template_snapshot(default_style.data[0]))
            .eq("id", project_id)
            .execute()
        )
        project_row = updated.data[0]

    return project_row


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    return _get_owned_project(project_id, current_user.id)


@router.put("/update/{project_id}", response_model=Project)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    existing = _get_owned_project(project_id, current_user.id)
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return existing
    updated = supabase.table("projects").update(update_data).eq("id", project_id).execute()
    return updated.data[0]


@router.delete("/delete/{project_id}")
async def delete_project(project_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    existing = _get_owned_project(project_id, current_user.id)

    # Best-effort cleanup of genuinely-uploaded assets. project_characters'
    # snapshot_character_sheet_url is deliberately NOT cleaned up here — it's a
    # copied URL pointing at the still-live character-library asset, not a
    # separate upload, so deleting it would break the original character.
    scenes = (
        supabase.table("scenes")
        .select("generated_image_url, generated_animation_url")
        .eq("project_id", project_id)
        .execute()
    )
    for scene in scenes.data:
        await delete_media(scene.get("generated_image_url"), resource_type="image")
        await delete_media(scene.get("generated_animation_url"), resource_type="video")
    await delete_media(existing.get("thumbnail_image_url"), resource_type="image")

    supabase.table("projects").delete().eq("id", project_id).execute()
    return {"success": True}


@router.get("/{project_id}/characters", response_model=list[ProjectCharacter])
async def list_project_characters(project_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    _get_owned_project(project_id, current_user.id)
    result = (
        supabase.table("project_characters")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("/{project_id}/characters/import", response_model=list[ProjectCharacter])
async def import_project_characters(
    project_id: str,
    payload: CharacterImportRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_project(project_id, current_user.id)

    rows_to_insert = []
    for character_id in payload.character_ids:
        char_result = supabase.table("characters").select("*").eq("id", character_id).execute()
        if not char_result.data or char_result.data[0]["user_id"] != current_user.id:
            continue
        c = char_result.data[0]
        rows_to_insert.append(
            {
                "project_id": project_id,
                "snapshot_name": c["name"],
                "snapshot_description": c["description"],
                "snapshot_character_sheet_url": c["character_sheet_url"],
            }
        )
    if rows_to_insert:
        supabase.table("project_characters").insert(rows_to_insert).execute()

    result = (
        supabase.table("project_characters")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.delete("/{project_id}/characters/{project_character_id}")
async def remove_project_character(
    project_id: str,
    project_character_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_project(project_id, current_user.id)
    existing = supabase.table("project_characters").select("id").eq("id", project_character_id).eq(
        "project_id", project_id
    ).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Imported character not found")

    supabase.table("project_characters").delete().eq("id", project_character_id).execute()
    return {"success": True}


@router.post("/{project_id}/styletemplate/import", response_model=Project)
async def import_style_template(
    project_id: str,
    payload: StyleTemplateImportRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_project(project_id, current_user.id)

    style_result = supabase.table("style_templates").select("*").eq("id", payload.style_template_id).execute()
    if not style_result.data or style_result.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Style template not found")

    updated = (
        supabase.table("projects")
        .update(_style_template_snapshot(style_result.data[0]))
        .eq("id", project_id)
        .execute()
    )
    return updated.data[0]


@router.put("/{project_id}/voiceoversettings", response_model=Project)
async def update_voiceover_settings(
    project_id: str,
    payload: VoiceoverSettingsUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_project(project_id, current_user.id)
    updated = supabase.table("projects").update(payload.model_dump()).eq("id", project_id).execute()
    return updated.data[0]
