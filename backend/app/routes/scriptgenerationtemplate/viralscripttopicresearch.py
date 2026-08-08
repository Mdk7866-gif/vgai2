import json

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.openrouter_client import CLAUDE_SCRIPT_MODEL, PERPLEXITY_RESEARCH_MODEL, get_openrouter_chat_model
from app.schemas.scripttemplate import (
    InvolvedCharacter,
    ScriptGenerateRequest,
    ScriptGenerateResponse,
    ScriptImproviseRequest,
    ScriptImproviseResponse,
    TopicResearchRequest,
    TopicResearchResponse,
    ViralTopic,
)
from app.supabase import supabase

router = APIRouter(prefix="/scripttemplates", tags=["scripttemplates"])

# Flat miscellaneous-spend cost of one "Get Top 10 Viral Topics" research call.
TOPIC_RESEARCH_CREDIT_COST = 5

# Script generation/improvise cost scales with the chosen word-length band:
# cost = (band's upper bound) / WORDS_PER_CREDIT, e.g. "800-900" words -> 900/5 = 180 credits.
WORDS_PER_CREDIT = 30


def _format_label(content_type: str) -> str:
    return (
        "long-form YouTube video (16:9 landscape)"
        if content_type == "long_videos"
        else "YouTube Shorts/Reel (9:16 vertical)"
    )


def _parse_word_range(script_word_length: str) -> tuple[int, int]:
    try:
        low_str, high_str = script_word_length.split("-")
        return int(low_str), int(high_str)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=422, detail="Invalid script_word_length format — expected e.g. '800-900'."
        )


def _script_credit_cost(script_word_length: str) -> float:
    _, max_words = _parse_word_range(script_word_length)
    return max_words / WORDS_PER_CREDIT


async def _check_and_get_balance(user_id: str, credit_cost: float, action_label: str) -> tuple[float, float]:
    """Returns (current_balance, current_misc_spent), raising 402 if balance is insufficient."""
    user_result = (
        supabase.table("users")
        .select("current_credit_balance, miscellaneous_credit_spent")
        .eq("id", user_id)
        .execute()
    )
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    current_balance = float(user_result.data[0]["current_credit_balance"])
    if current_balance < credit_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Not enough credits — {action_label} costs {credit_cost:g} credits, you have {current_balance:g}.",
        )
    return current_balance, float(user_result.data[0]["miscellaneous_credit_spent"])


def _deduct_credits(user_id: str, current_balance: float, current_misc_spent: float, credit_cost: float) -> float:
    new_balance = current_balance - credit_cost
    supabase.table("users").update(
        {"current_credit_balance": new_balance, "miscellaneous_credit_spent": current_misc_spent + credit_cost}
    ).eq("id", user_id).execute()
    return new_balance


# ---- /generatetopics — Perplexity market research ----

TOPIC_RESEARCH_SYSTEM_MESSAGE = (
    "You are a viral-content strategist for a YouTube creator. Research the current web and return the "
    "10 most trending/viral topic ideas the creator should make a video about right now, grounded in the "
    "given category, the creator's topic focus, and their target audience country's trends. Respond with "
    'ONLY a JSON array of exactly 10 objects shaped like {"title": "...", "reason": "..."} — no markdown, '
    "no code fences, no prose outside the JSON. \"title\" is a short punchy topic/video-idea name (under "
    "15 words). \"reason\" is one sentence on why it's trending or likely to perform well right now (under "
    "30 words)."
)


def _parse_topics_json(raw: str) -> list[ViralTopic]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end == -1:
            raise HTTPException(status_code=502, detail="Topic research returned an unexpected format.")
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Topic research returned an unexpected format.")

    if not isinstance(data, list) or not data:
        raise HTTPException(status_code=502, detail="Topic research returned an unexpected format.")

    topics: list[ViralTopic] = []
    for item in data[:10]:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        topics.append(ViralTopic(title=str(item["title"]).strip(), reason=str(item.get("reason", "")).strip()))

    if not topics:
        raise HTTPException(status_code=502, detail="Topic research returned no usable topics.")
    return topics


async def _research_viral_topics(payload: TopicResearchRequest) -> list[ViralTopic]:
    llm = get_openrouter_chat_model(PERPLEXITY_RESEARCH_MODEL, temperature=0.6)

    human = (
        f"Category: {payload.category}\n"
        f"Creator's topic focus: {payload.topic_description}\n"
        f"Target audience country: {payload.target_country}\n"
        f"Video format: {_format_label(payload.content_type)}"
    )

    try:
        response = await llm.ainvoke(
            [SystemMessage(content=TOPIC_RESEARCH_SYSTEM_MESSAGE), HumanMessage(content=human)]
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to research viral topics: {e}")

    raw = response.content if isinstance(response.content, str) else str(response.content)
    return _parse_topics_json(raw)


@router.post("/generatetopics", response_model=TopicResearchResponse)
async def generate_topics(
    payload: TopicResearchRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Researches 10 trending/viral video topic ideas. Nothing is persisted here."""
    if not settings.OPENROUTER_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter is not configured on the backend.")

    current_balance, current_misc_spent = await _check_and_get_balance(
        current_user.id, TOPIC_RESEARCH_CREDIT_COST, "researching viral topics"
    )

    topics = await _research_viral_topics(payload)

    new_balance = _deduct_credits(current_user.id, current_balance, current_misc_spent, TOPIC_RESEARCH_CREDIT_COST)

    return TopicResearchResponse(
        topics=topics,
        credits_spent=TOPIC_RESEARCH_CREDIT_COST,
        credits_remaining=new_balance,
    )


# ---- /generatescript and /improvise — Claude script writing ----


class _ScriptDraft(BaseModel):
    script: str
    characters: list[InvolvedCharacter] = []


SCRIPT_PROMPT_SYSTEM_MESSAGE = (
    "You are a professional scriptwriter for AI faceless YouTube content. Given a video topic, its "
    "category, the creator's overall topic focus, their specific script instructions, the target video "
    "format, and the target audience country, write a complete, ready-to-record video script:\n\n"
    "- script: the full script text, written within the requested word count range, paced for the target "
    "format (a long-form video can build slower with more narrative depth; a Shorts/Reels video needs an "
    "instant hook in the first line and punchy, fast-moving beats throughout). Write only the spoken/"
    "narration content — no scene directions, no markdown, no speaker labels unless the script is "
    "dialogue-driven.\n"
    "- characters: every named character who appears or is referenced in the script, each with their "
    "name, best-estimate age, gender, profession (if inferable), and a brief physical appearance "
    "description useful for later generating a matching character image. Leave this list empty if the "
    "script has no named characters (e.g. a pure narration/documentary-style script)."
)

IMPROVISE_PROMPT_SYSTEM_MESSAGE = (
    "You are a professional scriptwriter revising an existing AI faceless YouTube video script based on "
    "the creator's feedback. Rewrite the full script incorporating their feedback, keeping it within "
    "approximately the same word count as the original. Also return every named character appearing in "
    "the revised script the same way as before (name, age, gender, profession, appearance description); "
    "leave the list empty if there are no named characters."
)


async def _build_script_draft(payload: ScriptGenerateRequest) -> _ScriptDraft:
    llm = get_openrouter_chat_model(CLAUDE_SCRIPT_MODEL, temperature=0.8)
    structured_llm = llm.with_structured_output(_ScriptDraft)

    min_words, max_words = _parse_word_range(payload.script_word_length)
    human = (
        f"Topic: {payload.topic}\n"
        f"Category: {payload.category}\n"
        f"Creator's topic focus: {payload.topic_description}\n"
        f"Script instructions from the creator: {payload.script_description}\n"
        f"Target audience country: {payload.target_country}\n"
        f"Video format: {_format_label(payload.content_type)}\n"
        f"Target script length: {min_words}-{max_words} words"
    )

    try:
        draft = await structured_llm.ainvoke(
            [SystemMessage(content=SCRIPT_PROMPT_SYSTEM_MESSAGE), HumanMessage(content=human)]
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate script: {e}")

    if not isinstance(draft, _ScriptDraft):
        raise HTTPException(status_code=502, detail="Script generation returned an unexpected format.")
    return draft


async def _build_improvised_script(payload: ScriptImproviseRequest) -> _ScriptDraft:
    llm = get_openrouter_chat_model(CLAUDE_SCRIPT_MODEL, temperature=0.8)
    structured_llm = llm.with_structured_output(_ScriptDraft)

    min_words, max_words = _parse_word_range(payload.script_word_length)
    human = (
        f"Topic: {payload.topic}\n"
        f"Target script length: {min_words}-{max_words} words\n"
        f"Creator's feedback: {payload.feedback}\n\n"
        f"Current script:\n{payload.script}"
    )

    try:
        draft = await structured_llm.ainvoke(
            [SystemMessage(content=IMPROVISE_PROMPT_SYSTEM_MESSAGE), HumanMessage(content=human)]
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to improvise script: {e}")

    if not isinstance(draft, _ScriptDraft):
        raise HTTPException(status_code=502, detail="Script improvisation returned an unexpected format.")
    return draft


@router.post("/generatescript", response_model=ScriptGenerateResponse)
async def generate_script(
    payload: ScriptGenerateRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates a full script draft (+ involved characters) for the chosen topic. Nothing is persisted here."""
    if not settings.OPENROUTER_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter is not configured on the backend.")

    credit_cost = _script_credit_cost(payload.script_word_length)
    current_balance, current_misc_spent = await _check_and_get_balance(
        current_user.id, credit_cost, f"generating a {payload.script_word_length}-word script"
    )

    draft = await _build_script_draft(payload)
    new_balance = _deduct_credits(current_user.id, current_balance, current_misc_spent, credit_cost)

    return ScriptGenerateResponse(
        topic=payload.topic,
        script=draft.script,
        word_count=len(draft.script.split()),
        characters=draft.characters,
        credits_spent=credit_cost,
        credits_remaining=new_balance,
    )


@router.post("/improvise", response_model=ScriptImproviseResponse)
async def improvise_script(
    payload: ScriptImproviseRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Regenerates a script based on user feedback. Same per-word credit cost as /generatescript."""
    if not settings.OPENROUTER_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter is not configured on the backend.")

    credit_cost = _script_credit_cost(payload.script_word_length)
    current_balance, current_misc_spent = await _check_and_get_balance(
        current_user.id, credit_cost, "improvising this script"
    )

    draft = await _build_improvised_script(payload)
    new_balance = _deduct_credits(current_user.id, current_balance, current_misc_spent, credit_cost)

    return ScriptImproviseResponse(
        topic=payload.topic,
        script=draft.script,
        word_count=len(draft.script.split()),
        characters=draft.characters,
        credits_spent=credit_cost,
        credits_remaining=new_balance,
    )
