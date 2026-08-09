from fastapi import APIRouter, Depends, HTTPException, Request
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import upload_video_bytes
from app.gemini_client import VeoGenerationCancelled, generate_video_from_image
from app.routes.project.generatedscenecard import _attach_involved_characters, _get_owned_scene
from app.routes.project.imagegeneration import _download
from app.routes.project.projectcrud import _check_project_balance, _deduct_project_credits, _get_owned_project
from app.schemas.scene import GenerateSceneAnimationRequest, GenerateSceneAnimationResponse, Scene
from app.supabase import supabase

router = APIRouter(prefix="/projects/animation", tags=["projects-animation"])

# Flat cost regardless of tier — animation_model_id only has the one "base" tier
# (Veo 3 Fast) for now, see gemini_client.py's VEO_ANIMATION_MODEL.
ANIMATION_CREDIT_COST = 40
DEFAULT_VIDEO_ASPECT_RATIO = "16:9"


@router.post("/generate_and_save", response_model=GenerateSceneAnimationResponse)
async def generate_scene_animation(
    payload: GenerateSceneAnimationRequest,
    request: Request,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Image-to-video animation for a scene. Unlike image generation, this polls a
    long-running Veo operation, so it's the one generation path where a client
    disconnect (Cancel button) is checked mid-flight and genuinely stops the spend
    — see gemini_client.generate_video_from_image()."""
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("generated_image_url"):
        raise HTTPException(status_code=400, detail="Generate the scene's image first.")
    if not scene.get("scene_animation_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no animation prompt yet.")

    cost = ANIMATION_CREDIT_COST
    current_balance = await _check_project_balance(current_user.id, cost, "generating a scene animation")

    aspect_ratio = project.get("snapshot_styletemplate_video_aspect_ratio") or DEFAULT_VIDEO_ASPECT_RATIO

    supabase.table("scenes").update({"animation_status": "generating"}).eq("id", scene["id"]).execute()

    try:
        image_bytes = await _download(scene["generated_image_url"])
        video_bytes = await generate_video_from_image(
            request, image_bytes, "image/png", scene["scene_animation_prompt"], aspect_ratio
        )
    except VeoGenerationCancelled:
        # Reset to pending (not "failed") and skip charging/saving entirely — the
        # user cancelled, this isn't an error.
        supabase.table("scenes").update({"animation_status": "pending"}).eq("id", scene["id"]).execute()
        raise HTTPException(status_code=499, detail="Animation generation cancelled.")
    except HTTPException:
        supabase.table("scenes").update({"animation_status": "failed"}).eq("id", scene["id"]).execute()
        raise
    except Exception as e:
        supabase.table("scenes").update({"animation_status": "failed"}).eq("id", scene["id"]).execute()
        raise HTTPException(status_code=502, detail=f"Failed to generate animation: {e}")

    video_url = upload_video_bytes(
        video_bytes,
        folder=f"{current_user.id}/{project['id']}/scene_animation",
        public_id_prefix=f"scene_{scene['scene_number']}",
    )

    updated = (
        supabase.table("scenes")
        .update({"generated_animation_url": video_url, "animation_status": "completed"})
        .eq("id", scene["id"])
        .execute()
        .data[0]
    )

    new_balance = _deduct_project_credits(
        current_user.id, project["id"], project["name"], "animation_credit_spent", current_balance, cost
    )

    scene_with_characters = _attach_involved_characters([updated])[0]

    return GenerateSceneAnimationResponse(
        scene=Scene(**scene_with_characters),
        credits_spent=cost,
        credits_remaining=new_balance,
    )
