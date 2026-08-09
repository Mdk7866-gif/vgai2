from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media
from app.routes.project.projectcrud import _get_owned_project
from app.schemas.scene import Scene, SceneCreate, SceneUpdate
from app.supabase import supabase

router = APIRouter(prefix="/projects/scenes", tags=["scenes"])


def _get_owned_scene(scene_id: str, user_id: str) -> dict:
    """Fetches a scene and verifies its parent project belongs to user_id (scenes
    have no user_id column of their own), or raises 404."""
    result = supabase.table("scenes").select("*").eq("id", scene_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Scene not found")
    scene = result.data[0]
    _get_owned_project(scene["project_id"], user_id)
    return scene


def _attach_involved_characters(scenes: list[dict]) -> list[dict]:
    if not scenes:
        return scenes
    scene_ids = [s["id"] for s in scenes]
    links = (
        supabase.table("scene_characters")
        .select("scene_id, project_character_id")
        .in_("scene_id", scene_ids)
        .execute()
        .data
    )
    if not links:
        for scene in scenes:
            scene["involved_characters"] = []
        return scenes

    character_ids = list({link["project_character_id"] for link in links})
    characters = (
        supabase.table("project_characters").select("id, snapshot_name").in_("id", character_ids).execute().data
    )
    id_to_name = {c["id"]: c["snapshot_name"] for c in characters}

    by_scene: dict[str, list[dict]] = {}
    for link in links:
        by_scene.setdefault(link["scene_id"], []).append(
            {"id": link["project_character_id"], "name": id_to_name.get(link["project_character_id"], "")}
        )
    for scene in scenes:
        scene["involved_characters"] = by_scene.get(scene["id"], [])
    return scenes


def _sync_involved_characters(scene_id: str, character_ids: list[str]) -> None:
    supabase.table("scene_characters").delete().eq("scene_id", scene_id).execute()
    if character_ids:
        supabase.table("scene_characters").insert(
            [{"scene_id": scene_id, "project_character_id": cid} for cid in character_ids]
        ).execute()


@router.get("/", response_model=list[Scene])
async def list_scenes(project_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    _get_owned_project(project_id, current_user.id)
    result = supabase.table("scenes").select("*").eq("project_id", project_id).order("scene_number").execute()
    return _attach_involved_characters(result.data)


@router.post("/create", response_model=Scene)
async def create_scene(payload: SceneCreate, current_user: SupabaseUser = Depends(get_current_user)):
    """Manually adds a blank/custom scene card. No AI call, no credit cost."""
    _get_owned_project(payload.project_id, current_user.id)

    existing = (
        supabase.table("scenes")
        .select("scene_number")
        .eq("project_id", payload.project_id)
        .order("scene_number", desc=True)
        .limit(1)
        .execute()
    )
    next_number = (existing.data[0]["scene_number"] + 1) if existing.data else 1

    inserted = (
        supabase.table("scenes")
        .insert(
            {
                "project_id": payload.project_id,
                "scene_number": next_number,
                "scene_text": payload.scene_text,
                "scene_image_prompt": payload.scene_image_prompt,
                "scene_animation_prompt": payload.scene_animation_prompt,
            }
        )
        .execute()
        .data[0]
    )
    _sync_involved_characters(inserted["id"], payload.involved_character_ids)
    return _attach_involved_characters([inserted])[0]


@router.put("/update/{scene_id}", response_model=Scene)
async def update_scene(
    scene_id: str,
    payload: SceneUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Edits a scene's text/prompts/involved characters. No AI call, no credit
    cost. Reordering (scene_number) is out of scope for now."""
    _get_owned_scene(scene_id, current_user.id)
    updated = (
        supabase.table("scenes")
        .update(
            {
                "scene_text": payload.scene_text,
                "scene_image_prompt": payload.scene_image_prompt,
                "scene_animation_prompt": payload.scene_animation_prompt,
            }
        )
        .eq("id", scene_id)
        .execute()
        .data[0]
    )
    _sync_involved_characters(scene_id, payload.involved_character_ids)
    return _attach_involved_characters([updated])[0]


@router.delete("/delete/{scene_id}")
async def delete_scene(scene_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    scene = _get_owned_scene(scene_id, current_user.id)
    await delete_media(scene.get("generated_image_url"), resource_type="image")
    await delete_media(scene.get("generated_animation_url"), resource_type="video")
    supabase.table("scenes").delete().eq("id", scene_id).execute()
    return {"success": True}
