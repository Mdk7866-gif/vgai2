import base64

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_image, upload_image_bytes
from app.credits import refund_misc_credits, reserve_misc_credits
from app.openai_client import openai_client
from app.schemas.styletemplate import (
    GenerateDemoImageRequest,
    GenerateDemoImageResponse,
    StyleTemplate,
    StyleTemplateCreate,
    StyleTemplateUpdate,
)
from app.supabase import supabase

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])

DEMO_IMAGE_FOLDER = "style_templates"

# Flat cost of one "Generate" demo-image attempt from the Add/Edit Style
# Template popup's Demo Image section -- gpt-image-2 at quality="low", same
# tier/price point as characters/generatecharacter.py's base (non-pro)
# character sheet generation.
GENERATE_DEMO_IMAGE_CREDIT_COST = 4

# gpt-image-2 requires both edges to be multiples of 16 (see the same note on
# characters/generatecharacter.py's SHEET_IMAGE_SIZE). 1792x1008 reduces to
# exactly 16:9; its transpose, 1008x1792, is the 9:16 portrait counterpart.
DEMO_IMAGE_SIZES: dict[str, str] = {"16:9": "1792x1008", "9:16": "1008x1792"}


def _build_demo_image_prompt(image_prompt: str, best_for: str | None) -> str:
    """Builds the gpt-image-2 prompt directly from the form's own fields --
    no separate LLM call to rewrite it first. `image_prompt` already *is* the
    art-style description (it's the same fragment used to generate every
    scene image in this style); `best_for` names the content niches the style
    is aimed at, which nudges the image model toward a representative subject
    when the style itself doesn't imply one.

    The trailing safety clause is deliberate: a style whose own wording leans
    dark (horror, noir, true-crime, war) has a real chance of tripping
    gpt-image-2's output moderation on the literal generated image even
    though the *prompt itself* isn't rejected -- steering the model toward
    expressing mood through color/lighting/composition rather than graphic
    subject matter meaningfully cuts that down. _generate_demo_image_bytes()
    below still retries with an even more conservative prompt if this isn't
    enough.
    """
    prompt = f"Generate a demo image in this art style: {image_prompt.strip()}"
    if best_for and best_for.strip():
        prompt += f". Most used categories: {best_for.strip()}"
    prompt += (
        ". No text, lettering, numbers, watermarks, signage, or logos anywhere in the image. "
        "Keep the image tasteful and safe for a general audience: no graphic violence, gore, "
        "blood, weapons pointed at people, nudity, sexual content, or hate symbols -- express "
        "any dark or intense mood through color, lighting, and composition rather than "
        "graphic content."
    )
    return prompt


def _moderation_blocked(error: Exception) -> bool:
    """True if `error` is gpt-image-2 rejecting the *output* it generated on
    safety grounds (OpenAI's 400 `moderation_blocked` error) -- narrow string
    match rather than an SDK exception-class check, since it has to survive
    whichever concrete openai-python exception type raised it across SDK
    versions, and the code is always present verbatim in the error body.
    """
    return "moderation_blocked" in str(error)


async def _generate_demo_image_bytes(prompt: str, aspect_ratio: str) -> bytes:
    """Calls gpt-image-2, retrying once with a stricter, more conservative
    prompt if the first attempt is blocked by output moderation -- a style
    described with dark/intense language (horror, noir, war, true-crime)
    occasionally produces an image gpt-image-2 itself flags, even though the
    prompt is perfectly generatable in the abstract. Raises a clear 422 (not
    the raw OpenAI error) if even the safer retry is blocked, since at that
    point it's actionable feedback for the user, not a server-side failure.
    """

    async def _call(p: str) -> bytes:
        result = await openai_client.images.generate(  # type: ignore[union-attr]
            model="gpt-image-2",
            prompt=p,
            size=DEMO_IMAGE_SIZES[aspect_ratio],
            quality="low",
        )
        if not result.data or not result.data[0].b64_json:
            raise HTTPException(status_code=502, detail="Image generation returned no image.")
        return base64.b64decode(result.data[0].b64_json)

    try:
        return await _call(prompt)
    except HTTPException:
        raise
    except Exception as e:
        if not _moderation_blocked(e):
            raise HTTPException(status_code=502, detail=f"Failed to generate demo image: {e}")

        safer_prompt = (
            f"{prompt}\n\nThe previous attempt was blocked by an automatic image safety filter. "
            "Regenerate a strictly safe-for-work, non-graphic, non-violent, non-sexual version: "
            "keep only the abstract art style, color palette, and lighting, expressed through a "
            "simple, calm, inoffensive subject (e.g. a still-life object, an empty landscape, or "
            "a single calm figure seen from a distance) rather than anything intense or dramatic."
        )
        try:
            return await _call(safer_prompt)
        except HTTPException:
            raise
        except Exception as retry_error:
            if not _moderation_blocked(retry_error):
                raise HTTPException(status_code=502, detail=f"Failed to generate demo image: {retry_error}")
            raise HTTPException(
                status_code=422,
                detail=(
                    "This style's demo image was blocked by OpenAI's safety system, even after "
                    "a safer retry. Try softening graphic, violent, or disturbing language in "
                    "the Image Prompt or Best For fields, then generate again."
                ),
            )


def _get_owned_template(template_id: str, user_id: str) -> dict:
    result = supabase.table("style_templates").select("*").eq("id", template_id).execute()
    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Style template not found")
    return result.data[0]


def _owns_demo_image(url: str | None, user_id: str) -> bool:
    """True only when `url` points at an asset this user uploaded themselves.

    A template imported from the starter catalog carries a demo_image_url
    pointing at a *shared* asset that every other importer's row also references
    -- same trap as project_characters.snapshot_character_sheet_url. Deleting or
    replacing such a template must never delete_media() that URL, or one user's
    edit blanks the preview for everyone. Only assets under this user's own
    upload folder are safe to remove.
    """
    return bool(url) and f"/{user_id}/{DEMO_IMAGE_FOLDER}/" in (url or "")


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


@router.post("/upload_demo_image")
async def upload_demo_image(
    demo_image: UploadFile = File(...),
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Uploads a demo/preview frame and returns its URL for the form to submit
    as `demo_image_url` on the normal JSON create/update call.

    Split out as its own endpoint rather than making create/update multipart
    (the way characters/crud.py does) because the template form is otherwise
    pure JSON, and the image is optional on both create and edit -- a multipart
    conversion would touch the generate flow and every caller for one nullable
    field. Orphan risk is accepted: uploading then abandoning the form leaves an
    unreferenced asset, which is cheap and invisible.
    """
    url = await upload_image(
        demo_image,
        folder=f"{current_user.id}/{DEMO_IMAGE_FOLDER}",
        public_id_prefix="demo",
    )
    return {"url": url}


@router.post("/generate_demo_image", response_model=GenerateDemoImageResponse)
async def generate_demo_image(
    payload: GenerateDemoImageRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates and uploads a demo/preview image for the Demo Image field --
    an alternative to pasting/uploading one by hand, triggered from the same
    Add/Edit Style Template popup rather than the separate "Generate Style
    Template" AI-draft flow (generatetemplate.py), since it fills one field
    on the plain create/update form rather than drafting a whole template.

    Uploads straight to Cloudinary and returns a real URL, the same shape
    upload_demo_image above already returns -- there's no accept/reject step
    because the result only fills the form field a manual upload would, and
    the user still reviews (and can replace) it before saving the template.
    Orphan risk on an abandoned form is accepted, same as upload_demo_image.
    """
    if openai_client is None:
        raise HTTPException(status_code=500, detail="OpenAI is not configured on the backend.")

    if not payload.image_prompt.strip():
        raise HTTPException(status_code=422, detail="Image prompt is required to generate a demo image.")

    prompt = _build_demo_image_prompt(payload.image_prompt, payload.best_for)

    # Reserved before the OpenAI call, refunded only if it (or the upload)
    # fails — see app/credits.py for why spend happens up front.
    new_balance = reserve_misc_credits(
        current_user.id, GENERATE_DEMO_IMAGE_CREDIT_COST, "generating a style template demo image"
    )
    try:
        image_bytes = await _generate_demo_image_bytes(prompt, payload.aspect_ratio)
        url = upload_image_bytes(
            image_bytes,
            folder=f"{current_user.id}/{DEMO_IMAGE_FOLDER}",
            public_id_prefix="demo",
        )
    except HTTPException:
        new_balance = refund_misc_credits(current_user.id, GENERATE_DEMO_IMAGE_CREDIT_COST)
        raise
    except Exception as e:
        new_balance = refund_misc_credits(current_user.id, GENERATE_DEMO_IMAGE_CREDIT_COST)
        raise HTTPException(status_code=502, detail=f"Failed to generate demo image: {e}")

    return GenerateDemoImageResponse(
        demo_image_url=url,
        credits_spent=GENERATE_DEMO_IMAGE_CREDIT_COST,
        credits_remaining=new_balance,
    )


@router.put("/update/{styletemplate_id}", response_model=StyleTemplate)
async def update_style_template(
    styletemplate_id: str,
    payload: StyleTemplateUpdate,
    current_user: SupabaseUser = Depends(get_current_user),
):
    existing = _get_owned_template(styletemplate_id, current_user.id)
    if payload.is_default:
        _clear_existing_default(current_user.id, exclude_id=styletemplate_id)
    updated = (
        supabase.table("style_templates")
        .update(payload.model_dump())
        .eq("id", styletemplate_id)
        .execute()
    )

    # Drop the superseded demo image only once the row already points at the new
    # one, so a failed update never leaves the row referencing a deleted asset.
    previous_demo_url = existing.get("demo_image_url")
    if previous_demo_url != payload.demo_image_url and _owns_demo_image(
        previous_demo_url, current_user.id
    ):
        await delete_media(previous_demo_url, resource_type="image")

    return updated.data[0]


@router.delete("/delete/{styletemplate_id}")
async def delete_style_template(
    styletemplate_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    existing = _get_owned_template(styletemplate_id, current_user.id)
    supabase.table("style_templates").delete().eq("id", styletemplate_id).execute()
    if _owns_demo_image(existing.get("demo_image_url"), current_user.id):
        await delete_media(existing["demo_image_url"], resource_type="image")
    return {"success": True}
