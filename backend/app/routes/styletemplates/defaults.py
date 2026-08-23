"""Read-only starter catalog of product-default style templates.

The catalog lives in the shared `default_style_templates` table, edited from
the **vgai2admin** portal (see that repo's README §9). It used to be a bundled
`default_style_templates.json` read through an `lru_cache`d loader; that was
replaced so the catalog can be changed without a redeploy — and deliberately
with *no* caching here, since the whole point of moving it into the DB is that
an admin edit shows up on the next request rather than the next restart. (The
design notes that used to justify each entry's wording — density-tier
rationale, the model-agnostic prompt-language rule, fingerprint risk — are in
CLAUDE.md's starter-catalog bullet, not in the data.)

These are still deliberately *not* rows in `style_templates`:

  - Editing the catalog updates what every user sees on their next visit.
    Seeded rows freeze at signup, so an improved prompt would never reach
    anyone who already has an account.
  - No backfill migration inserting 12 rows for every existing user.
  - Import is the one place a copy is made, which is where the fingerprint
    mitigation (per-user palette/lighting nudges, so a thousand channels
    running the same default don't ship interchangeable output) will go.

Listing is unauthenticated on purpose -- /style_templates is browsable logged
out (see CLAUDE.md's "public browsing, gated actions"), and the starter library
is the most persuasive thing a signed-out visitor can see. Importing is gated.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import copy_image_from_url
from app.schemas.styletemplate import DefaultStyleTemplate, StyleTemplate
from app.supabase import supabase

from .crud import DEMO_IMAGE_FOLDER, _clear_existing_default

router = APIRouter(prefix="/styletemplates", tags=["styletemplates"])

# Fields copied verbatim into the user's row on import. `slug` is catalog-only
# metadata and is deliberately not persisted -- once imported, the copy is an
# ordinary template the user owns outright and can edit or delete freely, with
# no link back to the catalog entry it came from (same real-copy-not-reference
# rule as project_characters). The catalog's own is_published/sort_order/
# timestamps are likewise admin-side bookkeeping, never copied.
#
# `demo_image_url` is NOT here: it needs a real Cloudinary copy rather than a
# copied URL string, so it's handled separately in the import below.
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
)


@router.get("/defaults", response_model=list[DefaultStyleTemplate])
async def list_default_style_templates():
    """Only published entries -- vgai2admin can draft an entry (is_published
    false) and it stays invisible here until it's ready."""
    result = (
        supabase.table("default_style_templates")
        .select("*")
        .eq("is_published", True)
        .order("sort_order")
        .order("created_at")
        .execute()
    )
    return result.data or []


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

    The demo image is copied as a real, independent Cloudinary asset into the
    importer's own folder rather than reusing the catalog's URL string. A copied
    URL would leave every importer's row pointing at the catalog's own asset, so
    an admin replacing or deleting that entry would blank the preview on every
    template already imported from it -- the same trap project_characters had
    (see CLAUDE.md's character-import note). It also means an imported template
    genuinely owns its preview: editing or deleting it cleans up its own copy
    via crud.py's _owns_demo_image(), which no longer has to refuse.

    Importing the same slug twice is allowed and produces a second independent
    copy; the catalog is a starting point, not a set the library has to mirror.

    Unpublished entries are not importable -- a draft that's hidden from the
    listing must not be reachable by guessing its slug either.
    """
    result = (
        supabase.table("default_style_templates")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", True)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Default style template not found")
    entry = result.data[0]

    new_template = {field: entry.get(field) for field in _IMPORTABLE_FIELDS}
    new_template["user_id"] = current_user.id

    # Nullable in the catalog, so only copy when there's actually one to copy.
    catalog_demo_url = entry.get("demo_image_url")
    new_template["demo_image_url"] = (
        copy_image_from_url(
            catalog_demo_url,
            folder=f"{current_user.id}/{DEMO_IMAGE_FOLDER}",
            public_id_prefix="demo",
        )
        if catalog_demo_url
        else None
    )

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
