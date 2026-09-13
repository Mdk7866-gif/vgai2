import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.credits import refund_misc_credits, reserve_misc_credits
from app.openai_client import OPENAI_IMAGE_BASE_MODEL, OPENAI_IMAGE_PRO_MODEL, OPENAI_TEXT_MODEL, openai_client
from app.schemas.character import GenerateCharacterSheetResponse

router = APIRouter(prefix="/characters", tags=["characters"])

# Miscellaneous-spend cost of one "Generate Character Sheet" attempt.
# "Pro" uses GPT Image 2.5 Sunburst; Base uses GPT Image 2.5 Flare.
GENERATE_CREDIT_COST = 4
GENERATE_PRO_CREDIT_COST = 20

# GPT Image 2.5 requires both edges to be multiples of 16. 1792x1008 = 16*112 x 16*63,
# and 112:63 reduces to exactly 16:9 (unlike the legacy 1792x1024 DALL-E-3 size, which is 1.75:1).
SHEET_IMAGE_SIZE = "1792x1008"

CHARACTER_PROMPT_SYSTEM_MESSAGE = (
    "You are a concept artist's assistant. Given a character's name and description "
    "(and optionally a reference photo), write a single detailed image-generation prompt "
    "for a character reference sheet laid out as a two-row grid on a plain, evenly lit "
    "pure white (#FFFFFF) background, with a thin divider line between each cell:\n\n"
    "- Row 1 — five equal-height full-body panels, same character scale and ground line "
    "in every panel, left to right: 3/4 view, front view, back view, right profile view, "
    "left profile view.\n"
    "- Row 2 — six equal-width head-and-shoulders close-up panels, left to right: happy, "
    "sad, angry, confused, thinking, surprised.\n\n"
    "Keep the character's proportions, outfit, hairstyle, and features perfectly "
    "identical across all eleven panels — only the pose/angle (row 1) or facial "
    "expression (row 2) changes. Label each panel with small bold uppercase text above "
    "it naming that view or expression, and put the character's name once as a title "
    "above the whole sheet — these are the ONLY text elements allowed. Do not include a "
    "color palette, swatches, measurements, callouts, watermarks, or any other "
    "labeling/annotation.\n\n"
    "The prompt you write must itself state that the background is a plain pure white "
    "(#FFFFFF) studio backdrop, seamless and uniform across the entire sheet, with no "
    "scenery, gradient, texture, vignette, or cast shadows on it — the character sheet "
    "gets composited over other backgrounds later, so anything but flat white is wrong.\n\n"
    "Output ONLY the image-generation prompt text itself, nothing else — no preamble, "
    "no markdown."
)


async def _build_character_prompt(
    name: str,
    description: str,
    reference_bytes: bytes | None,
    reference_mime: str | None,
) -> str:
    llm = ChatOpenAI(model=OPENAI_TEXT_MODEL, api_key=settings.CHATGPT_PAID_API_KEY, temperature=0.7)

    content: list[dict] = [
        {"type": "text", "text": f"Character name: {name}\nDescription: {description}"}
    ]
    if reference_bytes and reference_mime:
        encoded = base64.b64encode(reference_bytes).decode()
        content[0]["text"] += "\nA reference photo of the character is attached — match their likeness."
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:{reference_mime};base64,{encoded}"}}
        )

    messages = [SystemMessage(content=CHARACTER_PROMPT_SYSTEM_MESSAGE), HumanMessage(content=content)]

    try:
        response = await llm.ainvoke(messages)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate character prompt: {e}")

    prompt_text = response.content if isinstance(response.content, str) else str(response.content)
    return prompt_text.strip()


async def _generate_sheet_image(
    prompt: str,
    reference_bytes: bytes | None,
    reference_filename: str | None,
    reference_mime: str | None,
    quality: str,
) -> str:
    try:
        if reference_bytes:
            result = await openai_client.images.edit(
            model=OPENAI_IMAGE_PRO_MODEL if quality == "high" else OPENAI_IMAGE_BASE_MODEL,
                image=(reference_filename or "reference.png", reference_bytes, reference_mime or "image/png"),
                prompt=prompt,
                size=SHEET_IMAGE_SIZE,
                quality=quality,
            )
        else:
            result = await openai_client.images.generate(
            model=OPENAI_IMAGE_PRO_MODEL if quality == "high" else OPENAI_IMAGE_BASE_MODEL,
                prompt=prompt,
                size=SHEET_IMAGE_SIZE,
                quality=quality,
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate character sheet image: {e}")

    if not result.data or not result.data[0].b64_json:
        raise HTTPException(status_code=502, detail="Image generation returned no image.")

    return result.data[0].b64_json


@router.post("/generate", response_model=GenerateCharacterSheetResponse)
async def generate_character_sheet(
    character_name: str = Form(...),
    description: str = Form(...),
    reference_image: UploadFile | None = File(None),
    pro: bool = Form(False),
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates a character sheet preview (image + prompt) for the user to review.

    Nothing is persisted here — the image is returned as a base64 data URI. If the
    user accepts it, the frontend re-submits it as a file to POST /characters/create,
    which does the actual Cloudinary upload + characters row insert.

    `pro=true` generates with GPT Image 2.5 Sunburst at quality="high" instead
    of GPT Image 2.5 Flare at quality="low", for
    GENERATE_PRO_CREDIT_COST credits instead of GENERATE_CREDIT_COST.
    """
    if openai_client is None:
        raise HTTPException(status_code=500, detail="OpenAI is not configured on the backend.")

    credit_cost = GENERATE_PRO_CREDIT_COST if pro else GENERATE_CREDIT_COST

    reference_bytes: bytes | None = None
    reference_mime: str | None = None
    if reference_image is not None and reference_image.filename:
        reference_bytes = await reference_image.read()
        reference_mime = reference_image.content_type

    # Reserved before either OpenAI call, refunded if either fails — see
    # app/credits.py for why spend happens up front rather than on success.
    new_balance = reserve_misc_credits(
        current_user.id, credit_cost, f"generating a{' pro' if pro else ''} character sheet"
    )
    try:
        character_prompt = await _build_character_prompt(
            character_name, description, reference_bytes, reference_mime
        )
        image_b64 = await _generate_sheet_image(
            character_prompt,
            reference_bytes,
            reference_image.filename if reference_image else None,
            reference_mime,
            "high" if pro else "low",
        )
    except HTTPException:
        new_balance = refund_misc_credits(current_user.id, credit_cost)
        raise

    return GenerateCharacterSheetResponse(
        character_prompt=character_prompt,
        image_base64=f"data:image/png;base64,{image_b64}",
        credits_spent=credit_cost,
        credits_remaining=new_balance,
    )
