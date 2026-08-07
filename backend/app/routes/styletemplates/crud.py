from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.schemas.styletemplate import StyleTemplate, StyleTemplateCreate, StyleTemplateUpdate
from app.supabase import supabase

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])


def _get_owned_template(template_id: str, user_id: str) -> dict:
    result = supabase.table("style_templates").select("*").eq("id", template_id).execute()
    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Style template not found")
    return result.data[0]


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


@router.put("/update/{styletemplate_id}", response_model=StyleTemplate)
async def update_style_template(
    styletemplate_id: str,
    payload: StyleTemplateUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_template(styletemplate_id, current_user.id)
    if payload.is_default:
        _clear_existing_default(current_user.id, exclude_id=styletemplate_id)
    updated = (
        supabase.table("style_templates")
        .update(payload.model_dump())
        .eq("id", styletemplate_id)
        .execute()
    )
    return updated.data[0]


@router.delete("/delete/{styletemplate_id}")
async def delete_style_template(
    styletemplate_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_template(styletemplate_id, current_user.id)
    supabase.table("style_templates").delete().eq("id", styletemplate_id).execute()
    return {"success": True}
