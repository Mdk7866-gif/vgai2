from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_image, upload_video
from app.routes.project.projectcrud import _get_owned_project
from app.schemas.scene import (
    CancelGenerationRequest,
    GenerationKind,
    InsertSceneRequest,
    Scene,
    SceneCreate,
    SceneUpdate,
)
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


def _start_generation(scene_id: str, kind: GenerationKind) -> str:
    """Marks a scene's image/animation as generating and stamps a fresh token
    identifying this attempt. Every write-back is guarded on that token, so a
    generation the user cancelled — or one they superseded by editing the prompt
    and clicking Generate again — can't land its stale result on the scene."""
    token = str(uuid4())
    supabase.table("scenes").update(
        {f"{kind}_status": "generating", f"{kind}_generation_token": token}
    ).eq("id", scene_id).execute()
    return token


def _finish_generation(scene_id: str, kind: GenerationKind, token: str, fields: dict) -> dict | None:
    """Applies fields to the scene only if `token` is still the current generation
    for this kind, clearing the token either way. Returns the updated row, or None
    when this attempt was cancelled or superseded — in which case the caller must
    throw its result away rather than saving it."""
    result = (
        supabase.table("scenes")
        .update({**fields, f"{kind}_generation_token": None})
        .eq("id", scene_id)
        .eq(f"{kind}_generation_token", token)
        .execute()
    )
    return result.data[0] if result.data else None


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


@router.post("/insert", response_model=list[Scene])
async def insert_scene(payload: InsertSceneRequest, current_user: SupabaseUser = Depends(get_current_user)):
    """Adds a blank scene card directly above/below a reference scene. No AI
    call, no credit cost. Renumbers every scene from the insertion point
    onward, shifting highest-numbered first so the (project_id, scene_number)
    unique constraint never collides mid-update."""
    _get_owned_project(payload.project_id, current_user.id)
    reference = _get_owned_scene(payload.reference_scene_id, current_user.id)
    if reference["project_id"] != payload.project_id:
        raise HTTPException(status_code=404, detail="Scene not found in this project")

    target_number = reference["scene_number"] if payload.direction == "above" else reference["scene_number"] + 1

    to_shift = (
        supabase.table("scenes")
        .select("id, scene_number")
        .eq("project_id", payload.project_id)
        .gte("scene_number", target_number)
        .order("scene_number", desc=True)
        .execute()
        .data
    )
    for row in to_shift:
        supabase.table("scenes").update({"scene_number": row["scene_number"] + 1}).eq("id", row["id"]).execute()

    supabase.table("scenes").insert(
        {
            "project_id": payload.project_id,
            "scene_number": target_number,
            "scene_text": "New scene — edit this text.",
        }
    ).execute()

    result = (
        supabase.table("scenes")
        .select("*")
        .eq("project_id", payload.project_id)
        .order("scene_number")
        .execute()
    )
    return _attach_involved_characters(result.data)


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


@router.post("/cancel_generation", response_model=Scene)
async def cancel_generation(
    payload: CancelGenerationRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Abandons an in-flight image/animation generation for a scene.

    Credits are NOT refunded — they were reserved before the provider call started
    and the provider bills us whether or not we wait for the result. What this does
    buy the user is that the abandoned result is discarded: clearing the generation
    token makes the in-flight request's guarded write-back match zero rows, so it
    can't overwrite whatever the user does next (typically: edit the prompt and
    regenerate). Cancelling something already finished is a no-op.
    """
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    kind = payload.kind

    if scene[f"{kind}_status"] == "generating":
        updated = (
            supabase.table("scenes")
            .update({f"{kind}_status": "pending", f"{kind}_generation_token": None})
            .eq("id", scene["id"])
            .execute()
            .data[0]
        )
    else:
        updated = scene

    return _attach_involved_characters([updated])[0]


@router.post("/{scene_id}/upload_image", response_model=Scene)
async def upload_scene_image(
    scene_id: str,
    image: UploadFile = File(...),
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Attaches an image the user generated outside vgAI (e.g. pasted into
    meta.ai via the manual image-generation flow) straight onto a scene, so a
    manual workflow ends up just as organized in the project as the automatic
    one. No AI call, no credit cost — same free-CRUD shape as the rest of this
    file, not the reserve/refund shape imagegeneration.py uses for a real
    provider call.
    """
    scene = _get_owned_scene(scene_id, current_user.id)
    if scene["image_status"] == "generating":
        raise HTTPException(status_code=409, detail="An image generation is already in progress for this scene.")
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    previous_url = scene.get("generated_image_url")
    image_url = await upload_image(
        image,
        folder=f"{current_user.id}/{scene['project_id']}/scene_images",
        public_id_prefix=f"scene_{scene['scene_number']}",
    )

    updated = (
        supabase.table("scenes")
        .update({"generated_image_url": image_url, "image_status": "completed", "image_generation_token": None})
        .eq("id", scene_id)
        .execute()
        .data[0]
    )

    # Scene images always live under this project's own scene_images/ folder —
    # unlike a character sheet, never a shared asset another row also points
    # at — so the previous one is always safe to delete, same as every
    # generation path's own replace-and-clean-up.
    if previous_url and previous_url != image_url:
        await delete_media(previous_url, resource_type="image")

    return _attach_involved_characters([updated])[0]


@router.post("/{scene_id}/upload_animation", response_model=Scene)
async def upload_scene_animation(
    scene_id: str,
    animation: UploadFile = File(...),
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Same idea as upload_scene_image above, for a scene's animation clip.
    Deliberately does not require scene.generated_image_url to already be
    set — unlike the automatic Generate button, a manually-produced clip may
    not have gone through vgAI's own image-to-video step at all."""
    scene = _get_owned_scene(scene_id, current_user.id)
    if scene["animation_status"] == "generating":
        raise HTTPException(
            status_code=409, detail="An animation generation is already in progress for this scene."
        )
    if not (animation.content_type or "").startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video.")

    previous_url = scene.get("generated_animation_url")
    video_url = await upload_video(
        animation,
        folder=f"{current_user.id}/{scene['project_id']}/scene_animation",
        public_id_prefix=f"scene_{scene['scene_number']}",
    )

    updated = (
        supabase.table("scenes")
        .update(
            {
                "generated_animation_url": video_url,
                "animation_status": "completed",
                "animation_generation_token": None,
            }
        )
        .eq("id", scene_id)
        .execute()
        .data[0]
    )

    if previous_url and previous_url != video_url:
        await delete_media(previous_url, resource_type="video")

    return _attach_involved_characters([updated])[0]


@router.delete("/{scene_id}/image", response_model=Scene)
async def delete_scene_image(scene_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    """Clears a scene's image (generated or manually uploaded) and deletes the
    Cloudinary asset behind it — there's no reason to keep an asset around on
    Cloudinary once nothing in the app points at it. Back to "pending" rather
    than the row's original unset state, same as a cancelled generation."""
    scene = _get_owned_scene(scene_id, current_user.id)
    if scene["image_status"] == "generating":
        raise HTTPException(status_code=409, detail="An image generation is already in progress for this scene.")

    url = scene.get("generated_image_url")
    updated = (
        supabase.table("scenes")
        .update({"generated_image_url": None, "image_status": "pending"})
        .eq("id", scene_id)
        .execute()
        .data[0]
    )
    if url:
        await delete_media(url, resource_type="image")

    return _attach_involved_characters([updated])[0]


@router.delete("/{scene_id}/animation", response_model=Scene)
async def delete_scene_animation(scene_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    """Same as delete_scene_image above, for the animation clip."""
    scene = _get_owned_scene(scene_id, current_user.id)
    if scene["animation_status"] == "generating":
        raise HTTPException(
            status_code=409, detail="An animation generation is already in progress for this scene."
        )

    url = scene.get("generated_animation_url")
    updated = (
        supabase.table("scenes")
        .update({"generated_animation_url": None, "animation_status": "pending"})
        .eq("id", scene_id)
        .execute()
        .data[0]
    )
    if url:
        await delete_media(url, resource_type="video")

    return _attach_involved_characters([updated])[0]


@router.delete("/delete/{scene_id}")
async def delete_scene(scene_id: str, current_user: SupabaseUser = Depends(get_current_user)):
    scene = _get_owned_scene(scene_id, current_user.id)
    await delete_media(scene.get("generated_image_url"), resource_type="image")
    await delete_media(scene.get("generated_animation_url"), resource_type="video")
    supabase.table("scenes").delete().eq("id", scene_id).execute()
    return {"success": True}
