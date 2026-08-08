from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.schemas.scripttemplate import (
    ScriptTemplate,
    ScriptTemplateCreate,
    ScriptTemplateUpdate,
    ViralTopic,
)
from app.supabase import supabase

router = APIRouter(prefix="/scripttemplates", tags=["scripttemplates"])


def _get_owned_script_template(template_id: str, user_id: str) -> dict:
    result = supabase.table("script_templates").select("*").eq("id", template_id).execute()
    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Script template not found")
    return result.data[0]


@router.get("/", response_model=list[ScriptTemplate])
async def list_script_templates(current_user: SupabaseUser = Depends(get_current_user)):
    # Only explicit "Save as Template" rows show up here — rows auto-created
    # behind a research/generate call (is_saved=false) stay out of this list.
    result = (
        supabase.table("script_templates")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("is_saved", True)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{scripttemplate_id}", response_model=ScriptTemplate)
async def get_script_template(
    scripttemplate_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    return _get_owned_script_template(scripttemplate_id, current_user.id)


@router.get("/{scripttemplate_id}/topics", response_model=list[ViralTopic])
async def list_researched_topics(
    scripttemplate_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Returns the up-to-10 researched topics currently saved for this script_template."""
    _get_owned_script_template(scripttemplate_id, current_user.id)
    result = (
        supabase.table("researched_topics")
        .select("*")
        .eq("script_template_id", scripttemplate_id)
        .order("topic_number")
        .execute()
    )
    return [ViralTopic(title=row["topic_name"], reason=row["brief_description"]) for row in result.data]


@router.post("/create", response_model=ScriptTemplate)
async def create_script_template(
    payload: ScriptTemplateCreate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    data = payload.model_dump(exclude={"script_template_id"})
    data["is_saved"] = True

    if payload.script_template_id:
        _get_owned_script_template(payload.script_template_id, current_user.id)
        updated = (
            supabase.table("script_templates")
            .update(data)
            .eq("id", payload.script_template_id)
            .execute()
        )
        return updated.data[0]

    data["user_id"] = current_user.id
    created = supabase.table("script_templates").insert(data).execute()
    return created.data[0]


@router.put("/update/{scripttemplate_id}", response_model=ScriptTemplate)
async def update_script_template(
    scripttemplate_id: str,
    payload: ScriptTemplateUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    _get_owned_script_template(scripttemplate_id, current_user.id)
    updated = (
        supabase.table("script_templates")
        .update(payload.model_dump())
        .eq("id", scripttemplate_id)
        .execute()
    )
    return updated.data[0]


@router.delete("/delete/{scripttemplate_id}")
async def delete_script_template(
    scripttemplate_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    # researched_topics and generated_scripts rows for this template are removed
    # automatically via ON DELETE CASCADE.
    _get_owned_script_template(scripttemplate_id, current_user.id)
    supabase.table("script_templates").delete().eq("id", scripttemplate_id).execute()
    return {"success": True}
