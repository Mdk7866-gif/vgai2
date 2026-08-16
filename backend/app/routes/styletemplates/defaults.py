"""Read-only starter catalog of product-default style templates.

The catalog lives in default_style_templates.json, alongside this file --
edit it directly, no build step. (An earlier version generated this JSON from
a markdown source via a parser script; that indirection was dropped because
forgetting to re-run the script after an edit left the API silently serving
stale content. See CLAUDE.md's starter-catalog bullet for the design notes --
density-tier rationale, the model-agnostic prompt-language rule, fingerprint
risk -- that used to live in that markdown's prose.) These are deliberately
*not* rows in style_templates:

  - Editing the JSON updates what every user sees on their next visit. Seeded
    rows freeze at signup, so an improved prompt would never reach anyone who
    already has an account.
  - No backfill migration inserting 12 rows for every existing user.
  - Import is the one place a copy is made, which is where the fingerprint
    mitigation (per-user palette/lighting nudges, so a thousand channels
    running the same default don't ship interchangeable output) will go.

Listing is unauthenticated on purpose -- /style_templates is browsable logged
out (see CLAUDE.md's "public browsing, gated actions"), and the starter library
is the most persuasive thing a signed-out visitor can see. Importing is gated.
"""

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.schemas.styletemplate import DefaultStyleTemplate, StyleTemplate
from app.supabase import supabase

from .crud import _clear_existing_default

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])

CATALOG_PATH = Path(__file__).resolve().parent / "default_style_templates.json"

# Fields copied verbatim into the user's row on import. `slug` is catalog-only
# metadata and is deliberately not persisted -- once imported, the copy is an
# ordinary template the user owns outright and can edit or delete freely, with
# no link back to the catalog entry it came from (same real-copy-not-reference
# rule as project_characters).
_IMPORTABLE_FIELDS = (
    "name",
    "description",
    "image_prompt",
    "animation_prompt",
    "youtube_title_description_tags_prompt",
    "youtube_thumbnail_image_prompt",
    "scene_density",
    "image_aspect_ratio",
    "video_aspect_ratio",
    "best_for",
    "demo_image_url",
)


@lru_cache(maxsize=1)
def _load_catalog() -> list[dict]:
    """Parses the catalog once per process -- it is a static bundled asset, so
    re-reading it on every request would be pure disk churn. Restart (or reload,
    which dev already does) to pick up an edit."""
    if not CATALOG_PATH.exists():
        raise HTTPException(status_code=500, detail="Default style template catalog is missing.")
    try:
        return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500, detail=f"Default style template catalog is malformed: {exc}"
        ) from exc


@router.get("/defaults", response_model=list[DefaultStyleTemplate])
async def list_default_style_templates():
    return _load_catalog()


@router.post("/defaults/{slug}/import", response_model=StyleTemplate)
async def import_default_style_template(
    slug: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Copies one catalog entry into the caller's library.

    The prompt bodies are read server-side from the catalog rather than posted
    back by the client, so the request carries nothing but a slug -- a tampered
    payload can't smuggle in different content, and a catalog edit takes effect
    on the next import with no frontend change.

    Importing the same slug twice is allowed and produces a second independent
    copy; the catalog is a starting point, not a set the library has to mirror.
    """
    entry = next((item for item in _load_catalog() if item["slug"] == slug), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Default style template not found")

    new_template = {field: entry.get(field) for field in _IMPORTABLE_FIELDS}
    new_template["user_id"] = current_user.id

    # A user's first-ever template becomes their default, so project creation
    # (which auto-imports the default style template) works without them having
    # to go set one manually. Later imports leave the existing default alone.
    has_existing = (
        supabase.table("style_templates")
        .select("id")
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    new_template["is_default"] = not has_existing.data
    if new_template["is_default"]:
        _clear_existing_default(current_user.id)

    created = supabase.table("style_templates").insert(new_template).execute()
    return created.data[0]
