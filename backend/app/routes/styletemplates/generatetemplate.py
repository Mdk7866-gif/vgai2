from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.schemas.styletemplate import GenerateStyleTemplateRequest, GenerateStyleTemplateResponse
from app.supabase import supabase

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])

# Miscellaneous-spend cost of one "Generate Style Template" attempt.
GENERATE_CREDIT_COST = 2

# Hard word-count ceilings — MUST match EditStyleTemplateCardPopUp.tsx exactly.
# The LLM is only ever *asked* to respect these via the prompt below, which isn't
# a guarantee, so _build_style_template_draft() also hard-truncates each field
# to its limit before returning — otherwise an over-limit draft would fail the
# frontend's own word-count validation the moment the user tries to import it.
DESCRIPTION_MAX_WORDS = 150
IMAGE_PROMPT_MAX_WORDS = 300
ANIMATION_PROMPT_MAX_WORDS = 200
YOUTUBE_PROMPT_MAX_WORDS = 150

STYLE_TEMPLATE_SYSTEM_MESSAGE = (
    "You are a creative director's assistant for an AI video-production app. Given a "
    "style template's name and a short description of the desired visual style, write "
    "a complete style template:\n\n"
    f"- description: a refined, concise description of the visual style "
    f"({DESCRIPTION_MAX_WORDS} words max)\n"
    "- image_prompt: a detailed prompt fragment used to generate every scene's image in "
    "this style — art style, rendering technique, color treatment, linework, mood "
    f"({IMAGE_PROMPT_MAX_WORDS} words max)\n"
    "- animation_prompt: a detailed prompt fragment used to animate each scene's "
    "already-generated image — motion style, camera movement feel, pacing "
    f"({ANIMATION_PROMPT_MAX_WORDS} words max)\n"
    "- youtube_title_description_tags_prompt: a prompt for later generating a YouTube "
    f"title, description, and tags matching this style and tone ({YOUTUBE_PROMPT_MAX_WORDS} words max)\n"
    "- youtube_thumbnail_image_prompt: a prompt for later generating a YouTube "
    f"thumbnail image matching this style ({YOUTUBE_PROMPT_MAX_WORDS} words max)\n\n"
    "Keep every field consistent with the others and grounded in the given name and "
    "description. Stay comfortably under each word limit — it will be hard-truncated "
    "at that word count, so an unfinished sentence at the cutoff looks worse than a "
    "shorter, complete one."
)


class _StyleTemplateDraft(BaseModel):
    description: str
    image_prompt: str
    animation_prompt: str
    youtube_title_description_tags_prompt: str
    youtube_thumbnail_image_prompt: str


def _truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words])


async def _build_style_template_draft(template_name: str, description: str) -> _StyleTemplateDraft:
    llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.CHATGPT_PAID_API_KEY, temperature=0.7)
    structured_llm = llm.with_structured_output(_StyleTemplateDraft)

    messages = [
        SystemMessage(content=STYLE_TEMPLATE_SYSTEM_MESSAGE),
        HumanMessage(content=f"Style template name: {template_name}\nDescription: {description}"),
    ]

    try:
        draft = await structured_llm.ainvoke(messages)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate style template: {e}")

    if not isinstance(draft, _StyleTemplateDraft):
        raise HTTPException(status_code=502, detail="Style template generation returned an unexpected format.")

    # Hard safety net — see the comment on the word-limit constants above.
    draft.description = _truncate_words(draft.description, DESCRIPTION_MAX_WORDS)
    draft.image_prompt = _truncate_words(draft.image_prompt, IMAGE_PROMPT_MAX_WORDS)
    draft.animation_prompt = _truncate_words(draft.animation_prompt, ANIMATION_PROMPT_MAX_WORDS)
    draft.youtube_title_description_tags_prompt = _truncate_words(
        draft.youtube_title_description_tags_prompt, YOUTUBE_PROMPT_MAX_WORDS
    )
    draft.youtube_thumbnail_image_prompt = _truncate_words(
        draft.youtube_thumbnail_image_prompt, YOUTUBE_PROMPT_MAX_WORDS
    )

    return draft


@router.post("/generate", response_model=GenerateStyleTemplateResponse)
async def generate_style_template(
    payload: GenerateStyleTemplateRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates a style template preview (description + prompts) for the user to review.

    Nothing is persisted here. If the user accepts it, the frontend submits the
    (possibly edited) fields to POST /styletemplates/create, same as a manually
    created template.
    """
    if not settings.CHATGPT_PAID_API_KEY:
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
                f"Not enough credits — generating a style template costs "
                f"{GENERATE_CREDIT_COST} credits, you have {current_balance:g}."
            ),
        )

    draft = await _build_style_template_draft(payload.template_name, payload.description)

    new_balance = current_balance - GENERATE_CREDIT_COST
    new_misc_spent = float(user_result.data[0]["miscellaneous_credit_spent"]) + GENERATE_CREDIT_COST
    supabase.table("users").update(
        {"current_credit_balance": new_balance, "miscellaneous_credit_spent": new_misc_spent}
    ).eq("id", current_user.id).execute()

    return GenerateStyleTemplateResponse(
        description=draft.description,
        image_prompt=draft.image_prompt,
        animation_prompt=draft.animation_prompt,
        youtube_title_description_tags_prompt=draft.youtube_title_description_tags_prompt,
        youtube_thumbnail_image_prompt=draft.youtube_thumbnail_image_prompt,
        credits_spent=GENERATE_CREDIT_COST,
        credits_remaining=new_balance,
    )
