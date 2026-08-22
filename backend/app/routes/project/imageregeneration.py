from fastapi import APIRouter, Depends, HTTPException, Request
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_image_bytes
from app.config import settings
from app.credits import refund_project_credits, reserve_project_credits
from app.routes.project.generatedscenecard import (
    _attach_involved_characters,
    _finish_generation,
    _get_owned_scene,
    _start_generation,
)
from app.routes.project.imagegeneration import (
    CANCELLED_STATUS,
    _generate_image_bytes,
    _image_size_for,
    _quality_and_cost,
)
from app.routes.project.projectcrud import _get_owned_project
from app.routes.project.scenesplitcommon import format_style_brief
from app.schemas.scene import GenerateSceneImageRequest, GenerateSceneImageResponse, Scene
from app.supabase import supabase

router = APIRouter(prefix="/projects/image", tags=["projects-image"])

# Flat cost for either LLM prompt-rewrite step below, regardless of the
# project's llm_model_id tier -- this is a small, cheap text edit, not a full
# scene-splitting call, so it doesn't scale with tier the way that does.
REWRITE_CREDIT_COST = 1

SYNC_ANIMATION_SYSTEM_MESSAGE = (
    "You are a video-production assistant for an AI faceless-content creator. The "
    "user just edited this scene's image prompt by hand. Write a new animation "
    "prompt (camera movement / motion for animating the resulting image) that "
    "matches what the new image prompt now depicts.\n\n"
    "You MUST preserve the established motion/camera style exactly as given in the "
    "style brief below -- e.g. if it says no camera movement, no character "
    "animation, or 'documentary stillness', keep that rule; do not invent motion "
    "the style forbids. Return only the new animation_prompt, self-contained (it "
    "will be used directly as a final generation prompt, not edited further)."
)

REGENERATE_SYSTEM_MESSAGE = (
    "You are a video-production assistant for an AI faceless-content creator. The "
    "user disliked the image most recently generated from the given prompts and "
    "wants to try again. Write a NEW image prompt and a NEW animation prompt for "
    "the same scene: keep the same subject, setting, and story beat, but vary the "
    "specific composition, action, or framing so the next generation looks "
    "meaningfully different from before.\n\n"
    "You MUST preserve the established visual style exactly as given in the style "
    "brief below -- art style, rendering technique, color treatment, camera/motion "
    "constraints (e.g. if told 'no camera movement' or 'documentary stillness', "
    "keep that), and aspect ratio. Never switch styles (e.g. never turn a "
    "photoreal or documentary style into 3D/cartoon/anime or vice versa). Return "
    "image_prompt and animation_prompt only, each self-contained (they will be "
    "used directly as final generation prompts, not edited further)."
)


class _AnimationPromptRewrite(BaseModel):
    animation_prompt: str


class _ImageAnimationPromptRewrite(BaseModel):
    image_prompt: str
    animation_prompt: str


def _rewrite_llm() -> ChatOpenAI:
    return ChatOpenAI(model="gpt-4o-mini", api_key=settings.CHATGPT_PAID_API_KEY, temperature=0.8)


def _reference_urls_for_scene(scene_id: str) -> list[str]:
    links = (
        supabase.table("scene_characters").select("project_character_id").eq("scene_id", scene_id).execute().data
    )
    if not links:
        return []
    character_ids = [link["project_character_id"] for link in links]
    characters = (
        supabase.table("project_characters")
        .select("snapshot_character_sheet_url")
        .in_("id", character_ids)
        .execute()
        .data
    )
    return [c["snapshot_character_sheet_url"] for c in characters]


@router.post("/sync_animation_prompt", response_model=GenerateSceneImageResponse)
async def sync_animation_prompt(
    payload: GenerateSceneImageRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Rewrites a scene's animation prompt to match an image prompt the user just
    edited by hand. Triggered only after the user confirms via
    ConformationMessagePopUp on the frontend -- editing the image prompt alone
    never silently touches the animation prompt, since that costs a credit.
    """
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("scene_image_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no image prompt yet.")

    new_balance = reserve_project_credits(
        current_user.id,
        project["id"],
        project["name"],
        "llm",
        REWRITE_CREDIT_COST,
        "updating the animation prompt to match an edited image prompt",
    )

    human = (
        f"{format_style_brief(project)}\n\n"
        f"New image prompt: {scene['scene_image_prompt']}\n"
        f"Previous animation prompt (for continuity): {scene.get('scene_animation_prompt') or '(none set)'}\n"
        f"Scene narration text: {scene['scene_text']}"
    )
    try:
        structured_llm = _rewrite_llm().with_structured_output(_AnimationPromptRewrite)
        draft = await structured_llm.ainvoke(
            [SystemMessage(content=SYNC_ANIMATION_SYSTEM_MESSAGE), HumanMessage(content=human)]
        )
        if not isinstance(draft, _AnimationPromptRewrite):
            raise HTTPException(status_code=502, detail="Failed to rewrite the animation prompt.")
    except HTTPException:
        refund_project_credits(current_user.id, project["id"], project["name"], "llm", REWRITE_CREDIT_COST)
        raise
    except Exception as e:
        refund_project_credits(current_user.id, project["id"], project["name"], "llm", REWRITE_CREDIT_COST)
        raise HTTPException(status_code=502, detail=f"Failed to rewrite the animation prompt: {e}")

    updated = (
        supabase.table("scenes")
        .update({"scene_animation_prompt": draft.animation_prompt.strip()})
        .eq("id", scene["id"])
        .execute()
        .data[0]
    )
    scene_with_characters = _attach_involved_characters([updated])[0]

    return GenerateSceneImageResponse(
        scene=Scene(**scene_with_characters),
        credits_spent=REWRITE_CREDIT_COST,
        credits_remaining=new_balance,
    )


@router.post("/regenerate_and_save", response_model=GenerateSceneImageResponse)
async def regenerate_scene_image(
    payload: GenerateSceneImageRequest,
    request: Request,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Regenerate on a scene that already has an image -- unlike the plain
    Generate flow, resubmitting the exact same prompt that already produced a
    disliked result is pointless, so this rewrites the image AND animation
    prompts via an LLM first (a fresh variation that keeps the established
    style), saves them, and only then generates the new image from the
    rewritten prompt.

    Costs REWRITE_CREDIT_COST (1) for the rewrite step plus the normal
    image-generation cost for the project's image tier -- reserved as two
    separately-tracked project expenses (llm, then image) rather than one
    combined amount, so /profile's usage breakdown still attributes each
    correctly. If the image step can't be reserved (insufficient credits) or
    fails, its own refund logic mirrors imagegeneration.py's
    generate_scene_image; the rewrite credit is refunded too when the image
    step never gets a chance to run at all (no image ever results), but not
    when the rewrite succeeded and only the generation call itself failed --
    the rewritten prompts are real, saved, reusable work either way.
    """
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("generated_image_url"):
        raise HTTPException(status_code=400, detail="Generate an image for this scene first.")
    if not scene.get("scene_image_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no image prompt yet.")
    if scene["image_status"] == "generating":
        raise HTTPException(status_code=409, detail="An image generation is already in progress for this scene.")

    # Step 1: rewrite both prompts.
    new_balance = reserve_project_credits(
        current_user.id,
        project["id"],
        project["name"],
        "llm",
        REWRITE_CREDIT_COST,
        "rewriting the image/animation prompts before regenerating",
    )

    human = (
        f"{format_style_brief(project)}\n\n"
        f"Current image prompt (disliked): {scene['scene_image_prompt']}\n"
        f"Current animation prompt: {scene.get('scene_animation_prompt') or '(none set)'}\n"
        f"Scene narration text: {scene['scene_text']}"
    )
    try:
        structured_llm = _rewrite_llm().with_structured_output(_ImageAnimationPromptRewrite)
        draft = await structured_llm.ainvoke(
            [SystemMessage(content=REGENERATE_SYSTEM_MESSAGE), HumanMessage(content=human)]
        )
        if not isinstance(draft, _ImageAnimationPromptRewrite):
            raise HTTPException(status_code=502, detail="Failed to rewrite the scene prompts.")
    except HTTPException:
        refund_project_credits(current_user.id, project["id"], project["name"], "llm", REWRITE_CREDIT_COST)
        raise
    except Exception as e:
        refund_project_credits(current_user.id, project["id"], project["name"], "llm", REWRITE_CREDIT_COST)
        raise HTTPException(status_code=502, detail=f"Failed to rewrite the scene prompts: {e}")

    new_image_prompt = draft.image_prompt.strip()
    new_animation_prompt = draft.animation_prompt.strip()
    scene = (
        supabase.table("scenes")
        .update({"scene_image_prompt": new_image_prompt, "scene_animation_prompt": new_animation_prompt})
        .eq("id", scene["id"])
        .execute()
        .data[0]
    )

    # Step 2: generate the image from the rewritten prompt -- same
    # reserve/refund/generation-token/cleanup shape as generate_scene_image.
    quality, image_cost = _quality_and_cost(project["image_model_id"])
    reference_urls = _reference_urls_for_scene(scene["id"])
    size = _image_size_for(project.get("snapshot_styletemplate_image_aspect_ratio"))
    previous_image_url = scene.get("generated_image_url")

    try:
        new_balance = reserve_project_credits(
            current_user.id, project["id"], project["name"], "image", image_cost, "regenerating a scene image"
        )
    except HTTPException:
        # The rewrite already happened and was saved, but the promised
        # regenerate can't proceed -- refund that credit too rather than
        # charge for a prompt update the user didn't actually ask for on its
        # own (they clicked "Regenerate image", not "rewrite my prompts").
        refund_project_credits(current_user.id, project["id"], project["name"], "llm", REWRITE_CREDIT_COST)
        raise

    token = _start_generation(scene["id"], "image")

    try:
        image_bytes = await _generate_image_bytes(new_image_prompt, reference_urls, size, quality)
    except HTTPException:
        _finish_generation(scene["id"], "image", token, {"image_status": "failed"})
        new_balance = refund_project_credits(current_user.id, project["id"], project["name"], "image", image_cost)
        raise

    if await request.is_disconnected():
        _finish_generation(scene["id"], "image", token, {"image_status": "pending"})
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Image generation cancelled.")

    image_url = upload_image_bytes(
        image_bytes,
        folder=f"{current_user.id}/{project['id']}/scene_images",
        public_id_prefix=f"scene_{scene['scene_number']}",
    )

    updated = _finish_generation(
        scene["id"], "image", token, {"generated_image_url": image_url, "image_status": "completed"}
    )
    if updated is None:
        await delete_media(image_url, resource_type="image")
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Image generation cancelled.")

    if previous_image_url and previous_image_url != image_url:
        await delete_media(previous_image_url, resource_type="image")

    scene_with_characters = _attach_involved_characters([updated])[0]

    return GenerateSceneImageResponse(
        scene=Scene(**scene_with_characters),
        credits_spent=REWRITE_CREDIT_COST + image_cost,
        credits_remaining=new_balance,
    )
