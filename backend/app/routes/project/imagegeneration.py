import base64
import math
from typing import Any, cast
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_image_bytes
from app.credits import refund_project_credits, reserve_project_credits
from app.openai_client import openai_client
from app.routes.project.generatedscenecard import _finish_generation, _get_owned_scene, _start_generation
from app.routes.project.projectcrud import _get_owned_project
from app.schemas.scene import (
    GenerateImagesManualRequest,
    GenerateImagesManualResponse,
    GenerateSceneImageRequest,
    GenerateSceneImageResponse,
    GenerateThumbnailRequest,
    GenerateThumbnailResponse,
    InvolvedCharacterRef,
    Scene,
)
from app.supabase import supabase

router = APIRouter(prefix="/projects/image", tags=["projects-image"])

# "base" -> gpt-image-2 quality="low", "pro" -> quality="high" — same pattern as
# characters/generatecharacter.py's GENERATE_CREDIT_COST/GENERATE_PRO_CREDIT_COST.
IMAGE_BASE_CREDIT_COST = 4
IMAGE_PRO_CREDIT_COST = 20

# Manual image generation (ManualImageGenerationPromptCopyPopUp.tsx) never calls
# an image provider — the user copies batched prompts + character sheets and
# generates on meta.ai themselves — so it's priced flat per scene rather than
# per-tier like IMAGE_BASE/PRO_CREDIT_COST above. Mirrors WORDS_PER_CREDIT_MANUAL's
# reasoning in scenesplitcommon.py: no provider is billed, but credits are still
# reserved since this still tracks as real project-scoped usage.
SCENES_PER_CREDIT_MANUAL = 5

# gpt-image-2 requires both edges to be multiples of 16 — same reasoning as
# characters/generatecharacter.py's SHEET_IMAGE_SIZE.
IMAGE_SIZE_BY_ASPECT_RATIO = {"16:9": "1792x1008", "9:16": "1008x1792"}
DEFAULT_IMAGE_SIZE = "1792x1008"

# Raised as an HTTP status when a generation's result is thrown away because the
# user cancelled it or superseded it — a nginx-ism, but the closest thing to "the
# client gave up on this request" and already what animationgeneration.py returns.
CANCELLED_STATUS = 499


def _image_size_for(aspect_ratio: str | None) -> str:
    return IMAGE_SIZE_BY_ASPECT_RATIO.get(aspect_ratio or "", DEFAULT_IMAGE_SIZE)


def _quality_and_cost(image_model_id: str) -> tuple[str, int]:
    if image_model_id == "pro":
        return "high", IMAGE_PRO_CREDIT_COST
    return "low", IMAGE_BASE_CREDIT_COST


async def _download(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


async def _generate_image_bytes(prompt: str, reference_urls: list[str], size: str, quality: str) -> bytes:
    """Generates one image, referencing character sheets via a multi-image edit
    call when any are given, or a plain generate call otherwise."""
    if openai_client is None:
        raise HTTPException(status_code=500, detail="OpenAI is not configured on the backend.")

    try:
        if reference_urls:
            references = [
                (f"ref_{i}.png", await _download(url), "image/png") for i, url in enumerate(reference_urls)
            ]
            result = await openai_client.images.edit(
                model="gpt-image-2", image=references, prompt=prompt, size=size, quality=quality
            )
        else:
            result = await openai_client.images.generate(
                model="gpt-image-2", prompt=prompt, size=size, quality=quality
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate image: {e}")

    if not result.data or not result.data[0].b64_json:
        raise HTTPException(status_code=502, detail="Image generation returned no image.")

    return base64.b64decode(result.data[0].b64_json)


@router.post("/generate_and_save", response_model=GenerateSceneImageResponse)
async def generate_scene_image(
    payload: GenerateSceneImageRequest,
    request: Request,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates a scene's image.

    Credits are reserved before the OpenAI call and refunded only if that call
    fails — cancelling stays charged, because OpenAI bills us either way (see
    app/credits.py). Cancelling does mean the image is discarded rather than saved:
    unlike animation there's no way to abandon a single blocking provider call
    mid-flight, so this request runs to completion and then throws the result away
    if its generation token is no longer the scene's current one.
    """
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("scene_image_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no image prompt yet.")

    quality, cost = _quality_and_cost(project["image_model_id"])

    links = (
        supabase.table("scene_characters")
        .select("project_character_id")
        .eq("scene_id", scene["id"])
        .execute()
        .data
    )
    reference_urls: list[str] = []
    involved: list[InvolvedCharacterRef] = []
    if links:
        character_ids = [link["project_character_id"] for link in links]
        characters = (
            supabase.table("project_characters")
            .select("id, snapshot_name, snapshot_character_sheet_url")
            .in_("id", character_ids)
            .execute()
            .data
        )
        reference_urls = [c["snapshot_character_sheet_url"] for c in characters]
        involved = [InvolvedCharacterRef(id=c["id"], name=c["snapshot_name"]) for c in characters]

    size = _image_size_for(project.get("snapshot_styletemplate_image_aspect_ratio"))
    previous_image_url = scene.get("generated_image_url")

    new_balance = reserve_project_credits(
        current_user.id, project["id"], project["name"], "image", cost, "generating a scene image"
    )
    token = _start_generation(scene["id"], "image")

    try:
        image_bytes = await _generate_image_bytes(scene["scene_image_prompt"], reference_urls, size, quality)
    except HTTPException:
        _finish_generation(scene["id"], "image", token, {"image_status": "failed"})
        new_balance = refund_project_credits(current_user.id, project["id"], project["name"], "image", cost)
        raise

    # Skip the upload entirely when we already know the result is unwanted; the
    # token check below is the authoritative one, this just avoids a pointless
    # Cloudinary round trip in the common cancel case.
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
        # Cancelled or superseded while we were generating — bin the image we just
        # uploaded rather than leaving it orphaned in Cloudinary.
        await delete_media(image_url, resource_type="image")
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Image generation cancelled.")

    if previous_image_url and previous_image_url != image_url:
        await delete_media(previous_image_url, resource_type="image")

    return GenerateSceneImageResponse(
        scene=Scene(**cast(dict[str, Any], updated), involved_characters=involved),
        credits_spent=cost,
        credits_remaining=new_balance,
    )


@router.post("/generate_thumbnail_and_save", response_model=GenerateThumbnailResponse)
async def generate_thumbnail(
    payload: GenerateThumbnailRequest,
    request: Request,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates the project's YouTube thumbnail. Same reserve-first / discard-on-
    cancel handling as generate_scene_image above, with the generation token kept
    on the projects row instead of a scene."""
    project = _get_owned_project(payload.project_id, current_user.id)
    if not project.get("thumbnail_prompt"):
        raise HTTPException(status_code=400, detail="Generate scenes first so a thumbnail prompt exists.")

    quality, cost = _quality_and_cost(project["image_model_id"])

    characters = (
        supabase.table("project_characters")
        .select("snapshot_character_sheet_url")
        .eq("project_id", project["id"])
        .execute()
        .data
    )
    reference_urls = [c["snapshot_character_sheet_url"] for c in characters]
    size = _image_size_for(project.get("snapshot_styletemplate_image_aspect_ratio"))
    previous_thumbnail_url = project.get("thumbnail_image_url")

    new_balance = reserve_project_credits(
        current_user.id, project["id"], project["name"], "image", cost, "generating a thumbnail"
    )
    token = str(uuid4())
    supabase.table("projects").update({"thumbnail_generation_token": token}).eq("id", project["id"]).execute()

    try:
        image_bytes = await _generate_image_bytes(project["thumbnail_prompt"], reference_urls, size, quality)
    except HTTPException:
        new_balance = refund_project_credits(current_user.id, project["id"], project["name"], "image", cost)
        raise

    if await request.is_disconnected():
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Thumbnail generation cancelled.")

    image_url = upload_image_bytes(
        image_bytes,
        folder=f"{current_user.id}/{project['id']}/thumbnail_image",
        public_id_prefix="thumbnail",
    )

    saved = (
        supabase.table("projects")
        .update({"thumbnail_image_url": image_url, "thumbnail_generation_token": None})
        .eq("id", project["id"])
        .eq("thumbnail_generation_token", token)
        .execute()
    )
    if not saved.data:
        await delete_media(image_url, resource_type="image")
        raise HTTPException(status_code=CANCELLED_STATUS, detail="Thumbnail generation cancelled.")

    if previous_thumbnail_url and previous_thumbnail_url != image_url:
        await delete_media(previous_thumbnail_url, resource_type="image")

    return GenerateThumbnailResponse(
        thumbnail_image_url=image_url, credits_spent=cost, credits_remaining=new_balance
    )


@router.post("/generate_manual", response_model=GenerateImagesManualResponse)
async def generate_images_manual(
    payload: GenerateImagesManualRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Charges for the manual/paste-into-meta.ai image generation flow. No
    provider call happens here — ManualImageGenerationPromptCopyPopUp.tsx builds
    the batched prompts and character-sheet copy buttons entirely client-side,
    the user pastes them into meta.ai themselves, and there's no structured
    response to parse back (unlike freescripttoscenesplitter.py's manual scene
    split), so this endpoint's only job is the credit charge. Scene count is
    read from the DB rather than trusted from the client, same reasoning as the
    /generate_script flow re-reading its own fields."""
    project = _get_owned_project(payload.project_id, current_user.id)

    scenes = supabase.table("scenes").select("id").eq("project_id", project["id"]).execute().data
    if not scenes:
        raise HTTPException(status_code=400, detail="Generate scenes before using manual image generation.")

    cost = math.ceil(len(scenes) / SCENES_PER_CREDIT_MANUAL)

    new_balance = reserve_project_credits(
        current_user.id, project["id"], project["name"], "image", cost, "manual image generation (meta.ai)"
    )

    return GenerateImagesManualResponse(credits_spent=cost, credits_remaining=new_balance)
