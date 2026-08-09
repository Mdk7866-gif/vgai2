from fastapi import APIRouter, Depends, HTTPException, Request
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import upload_video_bytes
from app.openrouter_video import (
    ANIMATION_BASE_DURATION_SECONDS,
    ANIMATION_BASE_MODEL,
    ANIMATION_PRO_DURATION_SECONDS,
    ANIMATION_PRO_MODEL,
    OpenRouterVideoGenerationCancelled,
    generate_video_from_image_url,
)
from app.routes.project.generatedscenecard import _attach_involved_characters, _get_owned_scene
from app.routes.project.projectcrud import _check_project_balance, _deduct_project_credits, _get_owned_project
from app.schemas.scene import GenerateSceneAnimationRequest, GenerateSceneAnimationResponse, Scene
from app.supabase import supabase

router = APIRouter(prefix="/projects/animation", tags=["projects-animation"])

# "base" -> Wan 2.6, 5s clip; "pro" -> Veo 3.1 Lite, 6s clip — same base/pro
# tier shape as image_model_id, resolved via _model_and_cost() below.
ANIMATION_BASE_CREDIT_COST = 20
ANIMATION_PRO_CREDIT_COST = 40
DEFAULT_VIDEO_ASPECT_RATIO = "16:9"


def _model_duration_and_cost(animation_model_id: str) -> tuple[str, int, int]:
    if animation_model_id == "pro":
        return ANIMATION_PRO_MODEL, ANIMATION_PRO_DURATION_SECONDS, ANIMATION_PRO_CREDIT_COST
    return ANIMATION_BASE_MODEL, ANIMATION_BASE_DURATION_SECONDS, ANIMATION_BASE_CREDIT_COST


@router.post("/generate_and_save", response_model=GenerateSceneAnimationResponse)
async def generate_scene_animation(
    payload: GenerateSceneAnimationRequest,
    request: Request,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Image-to-video animation for a scene via OpenRouter. Unlike image generation,
    this polls a long-running video job, so it's the one generation path where a
    client disconnect (Cancel button) is checked mid-flight and genuinely stops the
    spend — see openrouter_video.generate_video_from_image_url()."""
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("generated_image_url"):
        raise HTTPException(status_code=400, detail="Generate the scene's image first.")
    if not scene.get("scene_animation_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no animation prompt yet.")

    model, duration, cost = _model_duration_and_cost(project["animation_model_id"])
    current_balance = await _check_project_balance(current_user.id, cost, "generating a scene animation")

    aspect_ratio = project.get("snapshot_styletemplate_video_aspect_ratio") or DEFAULT_VIDEO_ASPECT_RATIO

    supabase.table("scenes").update({"animation_status": "generating"}).eq("id", scene["id"]).execute()

    try:
        video_bytes = await generate_video_from_image_url(
            request, scene["generated_image_url"], scene["scene_animation_prompt"], model, duration, aspect_ratio
        )
    except OpenRouterVideoGenerationCancelled:
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
