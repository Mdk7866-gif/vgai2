from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import upload_image_bytes
from app.config import settings
from app.credits import refund_misc_credits, reserve_misc_credits
from app.openai_client import OPENAI_TEXT_MODEL, openai_client
from app.schemas.styletemplate import GenerateStyleTemplateRequest, GenerateStyleTemplateResponse

from .crud import (
    DEMO_IMAGE_FOLDER,
    GENERATE_DEMO_IMAGE_CREDIT_COST,
    _build_demo_image_prompt,
    _generate_demo_image_bytes,
)

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])

# Miscellaneous-spend cost of one "Generate Style Template" attempt. The
# optional "Generate demo image" toggle on GenerateStyleTemplatePopUp.tsx adds
# GENERATE_DEMO_IMAGE_CREDIT_COST (imported from crud.py, the single source of
# truth for that cost/size/prompt-building, also used by the Edit popup's own
# standalone "Generate" demo-image button) on top of this, e.g. 2 -> 6.
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

# Per-format creative brief injected into the prompt so the LLM writes image/animation/
# YouTube prompts suited to how the video will actually be watched, not just its pixel
# dimensions — a 9:16 template is for Shorts/Reels (fast hook, punchy pacing, mobile-first
# close framing), a 16:9 template is for long-form landscape video (sustained narrative
# pacing, more room for slower cinematic build-up).
VIDEO_FORMAT_BRIEFS: dict[str, str] = {
    "16:9": (
        "This style template is for a long-form, 16:9 landscape YouTube video. Write prompts "
        "that support a strong opening hook and then sustain viewer interest through "
        "narrative-driven, slower-building visual storytelling across many scenes. Image and "
        "animation prompts can favor more deliberate, cinematic camera movement and "
        "composition. YouTube title/description/tags and thumbnail prompts should read like "
        "a long-form video built for sustained watch time."
    ),
    "9:16": (
        "This style template is for a vertical, 9:16 YouTube Shorts/Reels video. Write prompts "
        "built for a fast, high-energy hook within the first couple of seconds, punchy and "
        "rapid visual changes, and bold, highly readable close-up compositions since it's "
        "watched on a small mobile screen. Image and animation prompts should favor tight "
        "framing, quick cuts/zooms, and eye-catching motion over slow cinematic pans. YouTube "
        "title/description/tags and thumbnail prompts should read like a Shorts/Reels video "
        "built to hook a scrolling viewer instantly and maximize replay/completion rate."
    ),
}


def _build_system_message(aspect_ratio: str) -> str:
    return (
        "You are a creative director's assistant for an AI video-production app. Given a "
        "style template's name, a short description of the desired visual style, and the "
        "target video format below, write a complete style template:\n\n"
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
        f"Target video format: {VIDEO_FORMAT_BRIEFS[aspect_ratio]}\n\n"
        "Keep every field consistent with the others and grounded in the given name, "
        "description, and target video format. Stay comfortably under each word limit — it "
        "will be hard-truncated at that word count, so an unfinished sentence at the cutoff "
        "looks worse than a shorter, complete one."
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


async def _build_style_template_draft(
    template_name: str, description: str, aspect_ratio: str
) -> _StyleTemplateDraft:
    llm = ChatOpenAI(model=OPENAI_TEXT_MODEL, api_key=settings.CHATGPT_PAID_API_KEY, temperature=0.7)
    structured_llm = llm.with_structured_output(_StyleTemplateDraft)

    video_format_label = "Long-form video (16:9 landscape)" if aspect_ratio == "16:9" else "Shorts/Reels (9:16 vertical)"
    messages = [
        SystemMessage(content=_build_system_message(aspect_ratio)),
        HumanMessage(
            content=(
                f"Style template name: {template_name}\n"
                f"Description: {description}\n"
                f"Video format: {video_format_label}"
            )
        ),
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


async def _generate_and_upload_demo_image(user_id: str, image_prompt: str, aspect_ratio: str) -> str:
    """Same generate-then-upload steps as crud.py's own generate_demo_image
    endpoint (including its moderation-block retry), reused here so a demo
    image generated as part of this draft matches the freshly-*generated*
    image_prompt (not whatever the user originally typed in the description
    field the draft was built from). No best_for is available at this point
    in the flow -- this AI-generation path doesn't collect/produce that field
    -- so the prompt is built from image_prompt alone.
    """
    prompt = _build_demo_image_prompt(image_prompt, best_for=None)
    image_bytes = await _generate_demo_image_bytes(prompt, aspect_ratio)
    return upload_image_bytes(
        image_bytes,
        folder=f"{user_id}/{DEMO_IMAGE_FOLDER}",
        public_id_prefix="demo",
    )


@router.post("/generate", response_model=GenerateStyleTemplateResponse)
async def generate_style_template(
    payload: GenerateStyleTemplateRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates a style template preview (description + prompts, optionally a
    demo image) for the user to review.

    Nothing is persisted here. If the user accepts it, the frontend submits the
    (possibly edited) fields to POST /styletemplates/create, same as a manually
    created template -- demo_image_url included, since (unlike the text fields)
    it's already a real uploaded Cloudinary asset by the time this returns, not
    a draft. Rejecting and retrying leaves that upload orphaned, same accepted
    tradeoff as crud.py's own generate_demo_image and upload_demo_image.
    """
    if not settings.CHATGPT_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI is not configured on the backend.")
    if payload.generate_demo_image and openai_client is None:
        raise HTTPException(status_code=500, detail="OpenAI is not configured on the backend.")

    credit_cost = GENERATE_CREDIT_COST + (GENERATE_DEMO_IMAGE_CREDIT_COST if payload.generate_demo_image else 0)

    # One reservation covering the whole attempt (draft + optional demo image),
    # refunded in full if any part fails -- see app/credits.py for why spend
    # happens up front rather than on success.
    new_balance = reserve_misc_credits(current_user.id, credit_cost, "generating a style template")
    demo_image_url: str | None = None
    try:
        draft = await _build_style_template_draft(
            payload.template_name, payload.description, payload.aspect_ratio
        )
        if payload.generate_demo_image:
            demo_image_url = await _generate_and_upload_demo_image(
                current_user.id, draft.image_prompt, payload.aspect_ratio
            )
    except HTTPException:
        new_balance = refund_misc_credits(current_user.id, credit_cost)
        raise
    except Exception as e:
        new_balance = refund_misc_credits(current_user.id, credit_cost)
        raise HTTPException(status_code=502, detail=f"Failed to generate demo image: {e}")

    return GenerateStyleTemplateResponse(
        description=draft.description,
        image_prompt=draft.image_prompt,
        animation_prompt=draft.animation_prompt,
        youtube_title_description_tags_prompt=draft.youtube_title_description_tags_prompt,
        youtube_thumbnail_image_prompt=draft.youtube_thumbnail_image_prompt,
        demo_image_url=demo_image_url,
        credits_spent=credit_cost,
        credits_remaining=new_balance,
    )
