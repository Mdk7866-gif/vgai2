from fastapi import APIRouter, Depends, HTTPException, Request
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_video_bytes
from app.credits import refund_project_credits, reserve_project_credits
from app.openrouter_video import (
    ANIMATION_BASE_DURATION_SECONDS,
    ANIMATION_BASE_MODEL,
    ANIMATION_PRO_DURATION_SECONDS,
    ANIMATION_PRO_MODEL,
    OpenRouterVideoGenerationCancelled,
    generate_video_from_image_url,
)
from app.routes.project.generatedscenecard import (
    _attach_involved_characters,
    _finish_generation,
    _get_owned_scene,
    _start_generation,
)
from app.routes.project.imagegeneration import CANCELLED_STATUS
from app.routes.project.projectcrud import _get_owned_project
from app.schemas.scene import GenerateSceneAnimationRequest, GenerateSceneAnimationResponse, Scene

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
    """Image-to-video animation for a scene via OpenRouter.

    Credits are reserved before the job is submitted and are NOT returned when the
    user cancels: OpenRouter starts (and bills for) the video the moment we submit
    it, so abandoning the poll saves us nothing. What cancelling does guarantee is
    that the clip never appears — this path stops polling mid-flight, and even a
    result that did arrive would be rejected by the generation-token guard on the
    write-back. A refund only happens when the job itself failed.
    """
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("generated_image_url"):
        raise HTTPException(status_code=400, detail="Generate the scene's image first.")
    if not scene.get("scene_animation_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no animation prompt yet.")

    model, duration, cost = _model_duration_and_cost(project["animation_model_id"])
    aspect_ratio = project.get("snapshot_styletemplate_video_aspect_ratio") or DEFAULT_VIDEO_ASPECT_RATIO
    previous_animation_url = scene.get("generated_animation_url")

    new_balance = reserve_project_credits(
        current_user.id, project["id"], project["name"], "animation", cost, "generating a scene animation"
    )
    token = _start_generation(scene["id"], "animation")

    def _fail(detail: str, status: int) -> HTTPException:
        _finish_generation(scene["id"], "animation", token, {"animation_status": "failed"})
        refund_project_credits(current_user.id, project["id"], project["name"], "animation", cost)
        return HTTPException(status_code=status, detail=detail)

    try:
        video_bytes = await generate_video_from_image_url(
            request, scene["generated_image_url"], scene["scene_animation_prompt"], model, duration, aspect_ratio
        )
    except OpenRouterVideoGenerationCancelled:
        # Back to "pending" rather than "failed" — the user cancelled, nothing broke.
        # No refund: the job was already submitted and billed.
        _finish_generation(scene["id"], "animation", token, {"animation_status": "pending"})
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Animation generation cancelled.")
    except HTTPException as e:
        raise _fail(e.detail, e.status_code)
    except Exception as e:
        raise _fail(f"Failed to generate animation: {e}", 502)

    video_url = upload_video_bytes(
        video_bytes,
        folder=f"{current_user.id}/{project['id']}/scene_animation",
        public_id_prefix=f"scene_{scene['scene_number']}",
    )

    updated = _finish_generation(
        scene["id"], "animation", token, {"generated_animation_url": video_url, "animation_status": "completed"}
    )
    if updated is None:
        # Cancelled or superseded while the job ran — discard rather than overwrite
        # whatever the user generated in the meantime.
        await delete_media(video_url, resource_type="video")
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Animation generation cancelled.")

    if previous_animation_url and previous_animation_url != video_url:
        await delete_media(previous_animation_url, resource_type="video")

    scene_with_characters = _attach_involved_characters([updated])[0]

    return GenerateSceneAnimationResponse(
        scene=Scene(**scene_with_characters),
        credits_spent=cost,
        credits_remaining=new_balance,
    )
