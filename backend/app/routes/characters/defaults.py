"""Read-only starter catalog of product-default characters.

The character-library counterpart of `styletemplates/defaults.py`. The catalog
lives in the shared `default_characters` table, edited from the **vgai2admin**
portal (see that repo's README §9), and is read with *no* caching here — the
whole point of keeping it in the DB is that an admin edit shows up on the next
request rather than the next restart.

These are deliberately *not* rows in `characters`:

  - Editing the catalog updates what every user sees on their next visit.
    Seeded rows freeze at signup, so an improved sheet would never reach
    anyone who already has an account.
  - No backfill migration inserting a row per existing user.

Listing is unauthenticated on purpose -- /characters is browsable logged out
(see CLAUDE.md's "public browsing, gated actions"). Importing is gated.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import copy_image_from_url
from app.schemas.character import Character, DefaultCharacter
from app.supabase import supabase

router = APIRouter(prefix="/characters", tags=["characters"])

# Fields copied verbatim into the user's row on import. `slug` is catalog-only
# metadata and is deliberately not persisted -- once imported, the copy is an
# ordinary character the user owns outright and can edit or delete freely, with
# no link back to the catalog entry it came from. `best_for` is admin-authored
# guidance for browsing the catalog, not part of the character itself, so it is
# not copied either; `character_sheet_url` is handled separately below because
# it needs a real Cloudinary copy rather than a copied URL string.
_IMPORTABLE_FIELDS = ("name", "description")


@router.get("/defaults", response_model=list[DefaultCharacter])
async def list_default_characters():
    """Only published entries -- vgai2admin can draft an entry (is_published
    false) and it stays invisible here until it's ready."""
    result = (
        supabase.table("default_characters")
        .select("*")
        .eq("is_published", True)
        .order("sort_order")
        .order("created_at")
        .execute()
    )
    return result.data or []


@router.post("/defaults/{slug}/import", response_model=Character)
async def import_default_character(
    slug: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Copies one catalog entry into the caller's library.

    The field values are read server-side from the catalog rather than posted
    back by the client, so the request carries nothing but a slug -- a tampered
    payload can't smuggle in different content, and a catalog edit takes effect
    on the next import with no frontend change.

    The character sheet is copied as a real, independent Cloudinary asset into
    the importer's own folder rather than reusing the catalog's URL string.
    That is the difference that makes deleting a catalog entry safe: a copied
    URL would leave every importer's character pointing at the catalog's asset,
    so removing the entry (which deletes that asset) would blank the image for
    all of them. This is exactly the bug project_characters had and was fixed
    for -- see CLAUDE.md's character-import note.

    Importing the same slug twice is allowed and produces a second independent
    copy; the catalog is a starting point, not a set the library has to mirror.

    Unpublished entries are not importable -- a draft that's hidden from the
    listing must not be reachable by guessing its slug either.
    """
    result = (
        supabase.table("default_characters")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", True)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Default character not found")
    entry = result.data[0]

    new_character = {field: entry.get(field) for field in _IMPORTABLE_FIELDS}
    new_character["user_id"] = current_user.id
    new_character["character_sheet_url"] = copy_image_from_url(
        entry["character_sheet_url"],
        folder=f"{current_user.id}/characters",
        public_id_prefix="character",
    )
    # Never auto-defaulted, unlike an imported style template. A default
    # character is auto-snapshotted into every new project (projectcrud.py's
    # create_project), and `characters` has no one-default-per-user constraint,
    # so defaulting an import would silently push a stock character into every
    # project the user goes on to create. They opt in with the card's own
    # "Set default" toggle instead.
    new_character["is_default"] = False

    created = supabase.table("characters").insert(new_character).execute()
    return created.data[0]
