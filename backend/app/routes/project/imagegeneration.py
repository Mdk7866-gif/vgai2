import base64
from typing import Any, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import upload_image_bytes
from app.openai_client import openai_client
from app.routes.project.generatedscenecard import _get_owned_scene
from app.routes.project.projectcrud import _check_project_balance, _deduct_project_credits, _get_owned_project
from app.schemas.scene import (
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

# gpt-image-2 requires both edges to be multiples of 16 — same reasoning as
# characters/generatecharacter.py's SHEET_IMAGE_SIZE.
IMAGE_SIZE_BY_ASPECT_RATIO = {"16:9": "1792x1008", "9:16": "1008x1792"}
DEFAULT_IMAGE_SIZE = "1792x1008"


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
    current_user: SupabaseUser = Depends(get_current_user),
):
    scene = _get_owned_scene(payload.scene_id, current_user.id)
    project = _get_owned_project(scene["project_id"], current_user.id)

    if not scene.get("scene_image_prompt"):
        raise HTTPException(status_code=400, detail="This scene has no image prompt yet.")

    quality, cost = _quality_and_cost(project["image_model_id"])
    current_balance = await _check_project_balance(current_user.id, cost, "generating a scene image")

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

    supabase.table("scenes").update({"image_status": "generating"}).eq("id", scene["id"]).execute()

    try:
        image_bytes = await _generate_image_bytes(scene["scene_image_prompt"], reference_urls, size, quality)
        image_url = upload_image_bytes(
            image_bytes,
            folder=f"{current_user.id}/{project['id']}/scene_images",
            public_id_prefix=f"scene_{scene['scene_number']}",
        )
    except HTTPException:
        supabase.table("scenes").update({"image_status": "failed"}).eq("id", scene["id"]).execute()
        raise

    updated = cast(
        dict[str, Any],
        supabase.table("scenes")
        .update({"generated_image_url": image_url, "image_status": "completed"})
        .eq("id", scene["id"])
        .execute()
        .data[0],
    )

    new_balance = _deduct_project_credits(
        current_user.id, project["id"], project["name"], "image_credit_spent", current_balance, cost
    )

    return GenerateSceneImageResponse(
        scene=Scene(**updated, involved_characters=involved),
        credits_spent=cost,
        credits_remaining=new_balance,
    )


@router.post("/generate_thumbnail_and_save", response_model=GenerateThumbnailResponse)
async def generate_thumbnail(
    payload: GenerateThumbnailRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    project = _get_owned_project(payload.project_id, current_user.id)
    if not project.get("thumbnail_prompt"):
        raise HTTPException(status_code=400, detail="Generate scenes first so a thumbnail prompt exists.")

    quality, cost = _quality_and_cost(project["image_model_id"])
    current_balance = await _check_project_balance(current_user.id, cost, "generating a thumbnail")

    characters = (
        supabase.table("project_characters")
        .select("snapshot_character_sheet_url")
        .eq("project_id", project["id"])
        .execute()
        .data
    )
    reference_urls = [c["snapshot_character_sheet_url"] for c in characters]
    size = _image_size_for(project.get("snapshot_styletemplate_image_aspect_ratio"))

    image_bytes = await _generate_image_bytes(project["thumbnail_prompt"], reference_urls, size, quality)
    image_url = upload_image_bytes(
        image_bytes,
        folder=f"{current_user.id}/{project['id']}/thumbnail_image",
        public_id_prefix="thumbnail",
    )

    supabase.table("projects").update({"thumbnail_image_url": image_url}).eq("id", project["id"]).execute()

    new_balance = _deduct_project_credits(
        current_user.id, project["id"], project["name"], "image_credit_spent", current_balance, cost
    )

    return GenerateThumbnailResponse(thumbnail_image_url=image_url, credits_spent=cost, credits_remaining=new_balance)
