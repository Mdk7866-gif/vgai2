import json
import math

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.credits import get_balance, reserve_project_credits
from app.routes.project.projectcrud import _get_owned_project
from app.routes.project.scenesplitcommon import (
    WORDS_PER_CREDIT_MANUAL,
    SceneSplitDraft,
    persist_scene_split,
)
from app.schemas.scene import (
    GenerateScenesManualChargeRequest,
    GenerateScenesManualChargeResponse,
    GenerateScenesManualRequest,
    GenerateScenesResponse,
    InvolvedCharacterRef,
    Scene,
)
from app.supabase import supabase

router = APIRouter(prefix="/projects/scenes", tags=["scenes"])


def _validate_manual_preconditions(project: dict) -> tuple[str, int]:
    """Shared precondition check + cost calc for both the charge step and the
    parse/persist step below — a project that's missing its script or style
    template shouldn't charge, and shouldn't accept a paste-back either."""
    script = (project.get("script") or "").strip()
    if not script:
        raise HTTPException(status_code=400, detail="Paste a script before generating scenes.")
    if not project.get("snapshot_styletemplate_name"):
        raise HTTPException(status_code=400, detail="Import a style template before generating scenes.")
    word_count = len(script.split())
    return script, math.ceil(word_count / WORDS_PER_CREDIT_MANUAL)


def _parse_manual_response(raw: str) -> SceneSplitDraft:
    """Parses the JSON the user pasted back from gemini.com, tolerating the same
    markdown code-fence wrapping viralscripttopicresearch.py's Perplexity parser
    guards against — Gemini's raw chat output isn't guaranteed to be bare JSON
    even when asked for it."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise HTTPException(status_code=422, detail="Couldn't find valid JSON in the pasted response.")
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Couldn't parse the pasted response as JSON.")

    try:
        return SceneSplitDraft.model_validate(data)
    except ValidationError as e:
        first = e.errors()[0]
        field = ".".join(str(loc) for loc in first["loc"])
        raise HTTPException(
            status_code=422,
            detail=f"Pasted response doesn't match the expected format ({field}: {first['msg']}).",
        )


@router.post("/generate_manual_charge", response_model=GenerateScenesManualChargeResponse)
async def generate_scenes_manual_charge(
    payload: GenerateScenesManualChargeRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Charges for manual scene-splitting the instant the "Generate Scenes
    (Manual)" trigger button is clicked, before GenerateScenesManualPopUp.tsx
    opens and reveals the copy-paste prompt. Without this, a user could open the
    popup, copy the prompt, run it through gemini.com, and use the resulting
    scene split entirely outside vgAI without ever pasting a result back or
    paying anything — charging on paste-back only works if the paste-back is
    guaranteed to happen, and it isn't. Mirrors imagegeneration.py's
    generate_images_manual, which charges up front for the same reason."""
    project = _get_owned_project(payload.project_id, current_user.id)
    _, cost = _validate_manual_preconditions(project)

    new_balance = reserve_project_credits(
        current_user.id, project["id"], project["name"], "llm", cost, "splitting the script into scenes (manual)"
    )
    return GenerateScenesManualChargeResponse(credits_spent=cost, credits_remaining=new_balance)


@router.post("/generate_manual", response_model=GenerateScenesResponse)
async def generate_scenes_manual(
    payload: GenerateScenesManualRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Free/manual counterpart to /generate_automatic. No LLM call happens here —
    the user ran our prompt through gemini.com themselves and pastes back the
    structured JSON response, which this endpoint validates and persists through
    the same path /generate_automatic uses. Charges nothing itself — the credits
    were already reserved by generate_manual_charge above the moment the popup
    opened, so a malformed paste (or the user just retrying) costs nothing further."""
    project = _get_owned_project(payload.project_id, current_user.id)
    _validate_manual_preconditions(project)

    draft = _parse_manual_response(payload.raw_response)

    characters = (
        supabase.table("project_characters")
        .select("id, snapshot_name, snapshot_description")
        .eq("project_id", project["id"])
        .execute()
    ).data

    inserted_scenes, scene_characters_rows = await persist_scene_split(project, characters, draft)
    id_to_name = {c["id"]: c["snapshot_name"] for c in characters}

    response_scenes = [
        Scene(
            **inserted,
            involved_characters=[
                InvolvedCharacterRef(id=row["project_character_id"], name=id_to_name[row["project_character_id"]])
                for row in scene_characters_rows
                if row["scene_id"] == inserted["id"] and row["project_character_id"] in id_to_name
            ],
        )
        for inserted in inserted_scenes
    ]

    return GenerateScenesResponse(
        scenes=response_scenes,
        title_of_video=draft.metadata.title,
        description_of_video=draft.metadata.description,
        tags_of_video=draft.metadata.tags,
        thumbnail_prompt=draft.metadata.thumbnail_prompt,
        thumbnail_image_url=None,
        # Nothing charged in this step — see the docstring above. credits_remaining
        # just reflects the current balance for the frontend to resync against.
        credits_spent=0,
        credits_remaining=get_balance(current_user.id),
    )
