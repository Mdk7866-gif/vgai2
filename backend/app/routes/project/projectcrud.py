from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import copy_image_from_url, delete_media, delete_project_media, upload_image
from app.schemas.project import (
    CharacterImportRequest,
    Project,
    ProjectBatchDeleteRequest,
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


def _owns_project_character_image(url: str | None, user_id: str, project_id: str) -> bool:
    """True when `url` lives under this project's own
    <user_id>/<project_id>/project_characters/ folder -- i.e. a real
    per-project asset, either from import (see import_project_characters/
    create_project below, which now copy the character-sheet image into this
    folder via copy_image_from_url() rather than reusing the library URL) or
    from a later project-local edit replacing it.

    Kept as a guard (rather than assuming every snapshot now owns its image)
    because a row created before this fix could still hold a *copy of the
    URL string* pointing at the live characters/ library asset --
    delete_media() on one of those would delete the still-live
    character-library image out from under the original character. Every row
    in the DB was confirmed on this fix's rollout to already own its image
    copy (a one-time backfill migrated the single pre-fix row that existed),
    so this guard isn't load-bearing today -- it's cheap insurance against a
    restored backup or another environment reintroducing an old-style row.
    Only ever delete an asset actually stored under this project's own
    folder.
    """
    return bool(url) and f"/{user_id}/{project_id}/project_characters/" in url


def _copy_character_sheet_for_project(character_sheet_url: str, user_id: str, project_id: str) -> str:
    """Gives a newly-imported project_characters row its own copy of the
    character-sheet image under this project's own project_characters/
    folder, rather than reusing the library character's characters/ URL --
    see _owns_project_character_image above. Falls back to the shared URL on
    a Cloudinary failure (network blip, quota) so an import still succeeds
    with a working image; that row is then indistinguishable from a pre-fix
    row and _owns_project_character_image still guards it correctly.
    """
    try:
        return copy_image_from_url(
            character_sheet_url,
            folder=f"{user_id}/{project_id}/project_characters",
            public_id_prefix="character",
        )
    except HTTPException:
        return character_sheet_url


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
        rows_to_insert = [
            {
                "project_id": project_id,
                "snapshot_name": c["name"],
                "snapshot_description": c["description"],
                "snapshot_character_sheet_url": _copy_character_sheet_for_project(
                    c["character_sheet_url"], current_user.id, project_id
                ),
            }
            for c in default_characters.data
        ]
        supabase.table("project_characters").insert(rows_to_insert).execute()

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
    _get_owned_project(project_id, current_user.id)

    # Best-effort cleanup of every asset (and now-empty folder) this project owns
    # in Cloudinary, by prefix under <user_id>/<project_id>/. A row's
    # snapshot_character_sheet_url now normally lives under that project's own
    # project_characters/ folder (see _copy_character_sheet_for_project) so this
    # correctly cleans it up too. A pre-fix row that still points at the shared
    # characters/ library asset falls outside this prefix and is left alone —
    # deleting it would break the original character (see
    # _owns_project_character_image).
    delete_project_media(current_user.id, project_id)

    supabase.table("projects").delete().eq("id", project_id).execute()
    return {"success": True}


@router.post("/delete/batch")
async def delete_projects_batch(
    payload: ProjectBatchDeleteRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Delete a user's selected projects as one sidebar action.

    Ownership of every id is verified before any Cloudinary or database work
    starts, so a stale or tampered selection can never partly delete another
    user's project. The per-project media teardown intentionally remains the
    same as the single-delete path: Cloudinary assets have one folder per
    project and must be removed before the cascading database delete.
    """
    project_ids = payload.project_ids
    owned = (
        supabase.table("projects")
        .select("id")
        .eq("user_id", current_user.id)
        .in_("id", project_ids)
        .execute()
    )
    owned_ids = {row["id"] for row in owned.data}
    if len(owned_ids) != len(project_ids):
        raise HTTPException(status_code=404, detail="One or more projects were not found")

    for project_id in project_ids:
        delete_project_media(current_user.id, project_id)

    (
        supabase.table("projects")
        .delete()
        .eq("user_id", current_user.id)
        .in_("id", project_ids)
        .execute()
    )
    return {"success": True, "deleted_project_ids": project_ids}


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
                "snapshot_character_sheet_url": _copy_character_sheet_for_project(
                    c["character_sheet_url"], current_user.id, project_id
                ),
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


@router.put("/{project_id}/characters/{project_character_id}", response_model=ProjectCharacter)
async def update_project_character(
    project_id: str,
    project_character_id: str,
    name: str = Form(...),
    description: str = Form(...),
    character_sheet: UploadFile | None = File(None),
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Edits this project's own snapshot of an imported character -- name,
    description, and optionally a replacement sheet image -- without touching
    the original characters row or any other project that imported the same
    character. This is the entire point of snapshotting (see CLAUDE.md's
    snapshotting-pattern note): a user who realizes mid-project that a
    character needs a project-specific tweak (a detail changed for this
    story, a different reference image) can edit it here freely.

    A replacement image uploads to this project's own project_characters/
    folder rather than overwriting the shared characters/ asset the snapshot
    started out pointing at -- see _owns_project_character_image for why the
    old value is only delete_media()'d when it was itself a previous
    project-local upload.
    """
    _get_owned_project(project_id, current_user.id)
    existing = (
        supabase.table("project_characters")
        .select("*")
        .eq("id", project_character_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Imported character not found")
    existing_row = existing.data[0]

    update_data: dict = {
        "snapshot_name": name,
        "snapshot_description": description,
    }
    if character_sheet is not None and character_sheet.filename:
        update_data["snapshot_character_sheet_url"] = await upload_image(
            character_sheet,
            folder=f"{current_user.id}/{project_id}/project_characters",
            public_id_prefix="character",
        )
        previous_url = existing_row.get("snapshot_character_sheet_url")
        if _owns_project_character_image(previous_url, current_user.id, project_id):
            await delete_media(previous_url, resource_type="image")

    updated = (
        supabase.table("project_characters")
        .update(update_data)
        .eq("id", project_character_id)
        .execute()
    )
    return updated.data[0]


@router.delete("/{project_id}/characters/{project_character_id}")
async def remove_project_character(
    project_id: str,
    project_character_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_project(project_id, current_user.id)
    existing = supabase.table("project_characters").select("*").eq("id", project_character_id).eq(
        "project_id", project_id
    ).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Imported character not found")

    supabase.table("project_characters").delete().eq("id", project_character_id).execute()
    # Only cleans up an image this project uploaded itself (see
    # _owns_project_character_image) -- a never-edited snapshot still points
    # at the shared characters/ library asset, which must survive this delete.
    snapshot_url = existing.data[0].get("snapshot_character_sheet_url")
    if _owns_project_character_image(snapshot_url, current_user.id, project_id):
        await delete_media(snapshot_url, resource_type="image")
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
