import json
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.openrouter_client import CLAUDE_SCRIPT_MODEL, PERPLEXITY_RESEARCH_MODEL, get_openrouter_chat_model
from app.routes.scriptgenerationtemplate.crud import _get_owned_script_template
from app.schemas.scripttemplate import (
    GeneratedScriptRecord,
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
# cost = ceil((band's upper bound) / WORDS_PER_CREDIT), e.g. "800-900" words -> ceil(900/30) = 30 credits.
WORDS_PER_CREDIT = 30

# Delimiters for the character_involved text column — deliberately not "#" or ","
# since those can plausibly appear inside AI-generated names/descriptions.
_CHARACTER_SEP = "|||"
_FIELD_SEP = "::"


def _get_owned_generated_script(generated_script_id: str, user_id: str) -> dict:
    result = supabase.table("generated_scripts").select("*").eq("id", generated_script_id).execute()
    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Generated script not found")
    return result.data[0]


def _serialize_characters(characters: list[InvolvedCharacter]) -> str:
    parts = []
    for c in characters:
        fields = [
            c.name,
            str(c.age) if c.age is not None else "",
            c.gender or "",
            c.profession or "",
            c.appearance_description or "",
        ]
        parts.append(_FIELD_SEP.join(fields))
    return _CHARACTER_SEP.join(parts)


def _parse_characters(raw: str | None) -> list[InvolvedCharacter]:
    if not raw:
        return []
    characters: list[InvolvedCharacter] = []
    for chunk in raw.split(_CHARACTER_SEP):
        fields = chunk.split(_FIELD_SEP)
        if not fields or not fields[0]:
            continue
        name = fields[0]
        age_str = fields[1] if len(fields) > 1 else ""
        characters.append(
            InvolvedCharacter(
                name=name,
                age=int(age_str) if age_str.isdigit() else None,
                gender=fields[2] if len(fields) > 2 and fields[2] else None,
                profession=fields[3] if len(fields) > 3 and fields[3] else None,
                appearance_description=fields[4] if len(fields) > 4 and fields[4] else None,
            )
        )
    return characters


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


def _script_credit_cost(script_word_length: str) -> int:
    _, max_words = _parse_word_range(script_word_length)
    return math.ceil(max_words / WORDS_PER_CREDIT)


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
    """Researches 10 trending/viral topic ideas and persists them.

    The first call for a fresh session (no script_template_id) creates a new
    script_templates row (is_saved=false). Passing that id back in on later
    calls reuses the same row and updates the same 10 researched_topics rows
    in place instead of creating new ones.
    """
    if not settings.OPENROUTER_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter is not configured on the backend.")

    current_balance, current_misc_spent = await _check_and_get_balance(
        current_user.id, TOPIC_RESEARCH_CREDIT_COST, "researching viral topics"
    )

    template_fields = {
        "category": payload.category,
        "topic_description": payload.topic_description,
        "script_description": payload.script_description,
        "content_type": payload.content_type,
        "target_country": payload.target_country,
        "script_word_length": payload.script_word_length,
    }

    if payload.script_template_id:
        _get_owned_script_template(payload.script_template_id, current_user.id)
        supabase.table("script_templates").update(template_fields).eq(
            "id", payload.script_template_id
        ).execute()
        script_template_id = payload.script_template_id
    else:
        inserted = (
            supabase.table("script_templates")
            .insert({**template_fields, "user_id": current_user.id, "is_saved": False})
            .execute()
        )
        script_template_id = inserted.data[0]["id"]

    topics = await _research_viral_topics(payload)

    now = datetime.now(timezone.utc).isoformat()
    topic_rows = [
        {
            "script_template_id": script_template_id,
            "user_id": current_user.id,
            "topic_number": i + 1,
            "topic_name": t.title,
            "brief_description": t.reason,
            "updated_at": now,
        }
        for i, t in enumerate(topics)
    ]
    supabase.table("researched_topics").upsert(
        topic_rows, on_conflict="script_template_id,topic_number"
    ).execute()

    new_balance = _deduct_credits(current_user.id, current_balance, current_misc_spent, TOPIC_RESEARCH_CREDIT_COST)

    return TopicResearchResponse(
        script_template_id=script_template_id,
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


async def _build_script_draft(template: dict, topic: str) -> _ScriptDraft:
    llm = get_openrouter_chat_model(CLAUDE_SCRIPT_MODEL, temperature=0.8)
    structured_llm = llm.with_structured_output(_ScriptDraft)

    min_words, max_words = _parse_word_range(template["script_word_length"])
    human = (
        f"Topic: {topic}\n"
        f"Category: {template['category']}\n"
        f"Creator's topic focus: {template['topic_description']}\n"
        f"Script instructions from the creator: {template['script_description']}\n"
        f"Target audience country: {template['target_country']}\n"
        f"Video format: {_format_label(template['content_type'])}\n"
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


async def _build_improvised_script(topic: str, current_script: str, feedback: str, script_word_length: str) -> _ScriptDraft:
    llm = get_openrouter_chat_model(CLAUDE_SCRIPT_MODEL, temperature=0.8)
    structured_llm = llm.with_structured_output(_ScriptDraft)

    min_words, max_words = _parse_word_range(script_word_length)
    human = (
        f"Topic: {topic}\n"
        f"Target script length: {min_words}-{max_words} words\n"
        f"Creator's feedback: {feedback}\n\n"
        f"Current script:\n{current_script}"
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


@router.get("/generatedscripts", response_model=list[GeneratedScriptRecord])
async def list_generated_scripts(current_user: SupabaseUser = Depends(get_current_user)):
    """All of the user's generated scripts, across every research session, newest first."""
    result = (
        supabase.table("generated_scripts")
        .select("*, script_templates(script_word_length)")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return [
        GeneratedScriptRecord(
            id=row["id"],
            script_template_id=row["script_template_id"],
            topic=row["topic_name"],
            script=row["script_text"],
            word_count=len(row["script_text"].split()),
            characters=_parse_characters(row["character_involved"]),
            script_word_length=(row.get("script_templates") or {}).get("script_word_length", ""),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in result.data
    ]


@router.post("/generatescript", response_model=ScriptGenerateResponse)
async def generate_script(
    payload: ScriptGenerateRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Generates and persists a full script draft (+ involved characters) for the chosen topic."""
    if not settings.OPENROUTER_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter is not configured on the backend.")

    template = _get_owned_script_template(payload.script_template_id, current_user.id)

    credit_cost = _script_credit_cost(template["script_word_length"])
    current_balance, current_misc_spent = await _check_and_get_balance(
        current_user.id, credit_cost, f"generating a {template['script_word_length']}-word script"
    )

    draft = await _build_script_draft(template, payload.topic)
    new_balance = _deduct_credits(current_user.id, current_balance, current_misc_spent, credit_cost)

    inserted = (
        supabase.table("generated_scripts")
        .insert(
            {
                "script_template_id": payload.script_template_id,
                "user_id": current_user.id,
                "topic_name": payload.topic,
                "script_text": draft.script,
                "character_involved": _serialize_characters(draft.characters),
            }
        )
        .execute()
    )

    return ScriptGenerateResponse(
        generated_script_id=inserted.data[0]["id"],
        script_template_id=payload.script_template_id,
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
    """Regenerates a script based on user feedback and updates it in place. Same per-word credit cost as /generatescript."""
    if not settings.OPENROUTER_PAID_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter is not configured on the backend.")

    generated = _get_owned_generated_script(payload.generated_script_id, current_user.id)
    template = _get_owned_script_template(generated["script_template_id"], current_user.id)

    credit_cost = _script_credit_cost(template["script_word_length"])
    current_balance, current_misc_spent = await _check_and_get_balance(
        current_user.id, credit_cost, "improvising this script"
    )

    draft = await _build_improvised_script(
        generated["topic_name"], generated["script_text"], payload.feedback, template["script_word_length"]
    )
    new_balance = _deduct_credits(current_user.id, current_balance, current_misc_spent, credit_cost)

    supabase.table("generated_scripts").update(
        {
            "script_text": draft.script,
            "character_involved": _serialize_characters(draft.characters),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", payload.generated_script_id).execute()

    return ScriptImproviseResponse(
        generated_script_id=payload.generated_script_id,
        script_template_id=generated["script_template_id"],
        topic=generated["topic_name"],
        script=draft.script,
        word_count=len(draft.script.split()),
        characters=draft.characters,
        credits_spent=credit_cost,
        credits_remaining=new_balance,
    )
