from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_image
from app.schemas.styletemplate import StyleTemplate, StyleTemplateCreate, StyleTemplateUpdate
from app.supabase import supabase

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])

DEMO_IMAGE_FOLDER = "style_templates"


def _get_owned_template(template_id: str, user_id: str) -> dict:
    result = supabase.table("style_templates").select("*").eq("id", template_id).execute()
    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Style template not found")
    return result.data[0]


def _owns_demo_image(url: str | None, user_id: str) -> bool:
    """True only when `url` points at an asset this user uploaded themselves.

    A template imported from the starter catalog carries a demo_image_url
    pointing at a *shared* asset that every other importer's row also references
    -- same trap as project_characters.snapshot_character_sheet_url. Deleting or
    replacing such a template must never delete_media() that URL, or one user's
    edit blanks the preview for everyone. Only assets under this user's own
    upload folder are safe to remove.
    """
    return bool(url) and f"/{user_id}/{DEMO_IMAGE_FOLDER}/" in (url or "")


def _clear_existing_default(user_id: str, exclude_id: str | None = None) -> None:
    """Unsets is_default on the user's other templates so at most one stays
    default, matching the partial unique index (idx_user_default_style)."""
    query = (
        supabase.table("style_templates")
        .update({"is_default": False})
        .eq("user_id", user_id)
        .eq("is_default", True)
    )
    if exclude_id:
        query = query.neq("id", exclude_id)
    query.execute()


@router.get("/", response_model=list[StyleTemplate])
async def list_style_templates(current_user: SupabaseUser = Depends(get_current_user)):
    result = (
        supabase.table("style_templates")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/create", response_model=StyleTemplate)
async def create_style_template(
    payload: StyleTemplateCreate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    if payload.is_default:
        _clear_existing_default(current_user.id)
    new_template = {**payload.model_dump(), "user_id": current_user.id}
    created = supabase.table("style_templates").insert(new_template).execute()
    return created.data[0]


@router.post("/upload_demo_image")
async def upload_demo_image(
    demo_image: UploadFile = File(...),
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Uploads a demo/preview frame and returns its URL for the form to submit
    as `demo_image_url` on the normal JSON create/update call.

    Split out as its own endpoint rather than making create/update multipart
    (the way characters/crud.py does) because the template form is otherwise
    pure JSON, and the image is optional on both create and edit -- a multipart
    conversion would touch the generate flow and every caller for one nullable
    field. Orphan risk is accepted: uploading then abandoning the form leaves an
    unreferenced asset, which is cheap and invisible.
    """
    url = await upload_image(
        demo_image,
        folder=f"{current_user.id}/{DEMO_IMAGE_FOLDER}",
        public_id_prefix="demo",
    )
    return {"url": url}


@router.put("/update/{styletemplate_id}", response_model=StyleTemplate)
async def update_style_template(
    styletemplate_id: str,
    payload: StyleTemplateUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    existing = _get_owned_template(styletemplate_id, current_user.id)
    if payload.is_default:
        _clear_existing_default(current_user.id, exclude_id=styletemplate_id)
    updated = (
        supabase.table("style_templates")
        .update(payload.model_dump())
        .eq("id", styletemplate_id)
        .execute()
    )

    # Drop the superseded demo image only once the row already points at the new
    # one, so a failed update never leaves the row referencing a deleted asset.
    previous_demo_url = existing.get("demo_image_url")
    if previous_demo_url != payload.demo_image_url and _owns_demo_image(
        previous_demo_url, current_user.id
    ):
        await delete_media(previous_demo_url, resource_type="image")

    return updated.data[0]


@router.delete("/delete/{styletemplate_id}")
async def delete_style_template(
    styletemplate_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    existing = _get_owned_template(styletemplate_id, current_user.id)
    supabase.table("style_templates").delete().eq("id", styletemplate_id).execute()
    if _owns_demo_image(existing.get("demo_image_url"), current_user.id):
        await delete_media(existing["demo_image_url"], resource_type="image")
    return {"success": True}
