from datetime import datetime

from pydantic import BaseModel


class Character(BaseModel):
    id: str
    user_id: str
    is_default: bool
    name: str
    description: str
    character_sheet_url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DefaultCharacter(BaseModel):
    """One entry of the read-only starter catalog served by GET /characters/defaults.

    Not a `characters` row: it has a `slug` instead of a `user_id`/`is_default`,
    since nothing exists in `characters` until the user imports it. Lives in the
    shared `default_characters` table, edited from the vgai2admin portal.
    """

    slug: str
    name: str
    description: str
    character_sheet_url: str
    best_for: str | None = None


class GenerateCharacterSheetResponse(BaseModel):
    character_prompt: str
    image_base64: str  # data URI, e.g. "data:image/png;base64,...."
    credits_spent: float
    credits_remaining: float
