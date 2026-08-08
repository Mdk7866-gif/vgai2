import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.openai_client import openai_client
from app.schemas.character import GenerateCharacterSheetResponse
from app.supabase import supabase

router = APIRouter(prefix="/characters", tags=["characters"])

# Miscellaneous-spend cost of one "Generate Character Sheet" attempt.
GENERATE_CREDIT_COST = 4

# gpt-image-2 requires both edges to be multiples of 16. 1792x1008 = 16*112 x 16*63,
# and 112:63 reduces to exactly 16:9 (unlike the legacy 1792x1024 DALL-E-3 size, which is 1.75:1).
SHEET_IMAGE_SIZE = "1792x1008"

CHARACTER_PROMPT_SYSTEM_MESSAGE = (
    "You are a concept artist's assistant. Given a character's name and description "
    "(and optionally a reference photo), write a single detailed image-generation prompt "
    "for a character reference sheet: a clean, evenly lit grid on a plain neutral "
    "background showing the SAME character consistently across a front view, a 3/4 view, "
    "a back view, a left profile view, a right profile view, and headshot expressions for "
    "happy, sad, angry, confused, thinking, and surprised. Keep the character's "
    "proportions, outfit, and features identical across every panel. Output ONLY the "
    "image-generation prompt text, nothing else — no preamble, no markdown, no labels."
)


async def _build_character_prompt(
    name: str,
    description: str,
    reference_bytes: bytes | None,
    reference_mime: str | None,
) -> str:
    llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.CHATGPT_PAID_API_KEY, temperature=0.7)

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
) -> str:
    try:
        if reference_bytes:
            result = await openai_client.images.edit(
                model="gpt-image-2",
                image=(reference_filename or "reference.png", reference_bytes, reference_mime or "image/png"),
                prompt=prompt,
                size=SHEET_IMAGE_SIZE,
                quality="low",
            )
        else:
            result = await openai_client.images.generate(
                model="gpt-image-2",
                prompt=prompt,
                size=SHEET_IMAGE_SIZE,
                quality="low",
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
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates a character sheet preview (image + prompt) for the user to review.

    Nothing is persisted here — the image is returned as a base64 data URI. If the
    user accepts it, the frontend re-submits it as a file to POST /characters/create,
    which does the actual Cloudinary upload + characters row insert.
    """
    if openai_client is None:
        raise HTTPException(status_code=500, detail="OpenAI is not configured on the backend.")

    user_result = (
        supabase.table("users")
        .select("current_credit_balance, miscellaneous_credit_spent")
        .eq("id", current_user.id)
        .execute()
    )
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    current_balance = float(user_result.data[0]["current_credit_balance"])
    if current_balance < GENERATE_CREDIT_COST:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Not enough credits — generating a character sheet costs "
                f"{GENERATE_CREDIT_COST} credits, you have {current_balance:g}."
            ),
        )

    reference_bytes: bytes | None = None
    reference_mime: str | None = None
    if reference_image is not None and reference_image.filename:
        reference_bytes = await reference_image.read()
        reference_mime = reference_image.content_type

    character_prompt = await _build_character_prompt(
        character_name, description, reference_bytes, reference_mime
    )
    image_b64 = await _generate_sheet_image(
        character_prompt,
        reference_bytes,
        reference_image.filename if reference_image else None,
        reference_mime,
    )

    new_balance = current_balance - GENERATE_CREDIT_COST
    new_misc_spent = float(user_result.data[0]["miscellaneous_credit_spent"]) + GENERATE_CREDIT_COST
    supabase.table("users").update(
        {"current_credit_balance": new_balance, "miscellaneous_credit_spent": new_misc_spent}
    ).eq("id", current_user.id).execute()

    return GenerateCharacterSheetResponse(
        character_prompt=character_prompt,
        image_base64=f"data:image/png;base64,{image_b64}",
        credits_spent=GENERATE_CREDIT_COST,
        credits_remaining=new_balance,
    )
