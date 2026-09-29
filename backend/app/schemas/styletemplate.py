from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

SceneDensity = Literal["small", "medium", "high"]

IMAGE_PROMPT_MAX_WORDS = 500
ANIMATION_PROMPT_MAX_WORDS = 300


def _within_word_limit(value: str, limit: int) -> bool:
    return len(value.split()) <= limit


class StyleTemplate(BaseModel):
    id: str
    user_id: str
    name: str
    is_default: bool
    image_prompt: str
    animation_prompt: str
    youtube_title_description_tags_prompt: str | None = None
    youtube_thumbnail_image_prompt: str | None = None
    scene_density: SceneDensity
    image_aspect_ratio: str
    video_aspect_ratio: str
    description: str
    best_for: str | None = None
    demo_image_url: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StyleTemplateCreate(BaseModel):
    name: str
    is_default: bool = False
    image_prompt: str
    animation_prompt: str
    youtube_title_description_tags_prompt: str | None = None
    youtube_thumbnail_image_prompt: str | None = None
    scene_density: SceneDensity = "small"
    image_aspect_ratio: str
    video_aspect_ratio: str
    description: str
    best_for: str | None = None
    demo_image_url: str | None = None


class StyleTemplateUpdate(StyleTemplateCreate):
    pass


class DefaultStyleTemplate(BaseModel):
    """One entry of the read-only starter catalog, read from the shared
    `default_style_templates` table (edited from the vgai2admin portal, not
    from this repo — see its README §9).

    This is the *public wire shape* only, not the table's own columns: no
    `id`/`is_published`/`sort_order`/timestamps, since those are admin-side
    bookkeeping vgai2 has no use for. Still no `user_id` either way — nothing
    exists in `style_templates` until a user imports an entry.
    """

    slug: str
    name: str
    description: str
    image_prompt: str
    animation_prompt: str
    youtube_title_description_tags_prompt: str | None = None
    youtube_thumbnail_image_prompt: str | None = None
    scene_density: SceneDensity
    image_aspect_ratio: str
    video_aspect_ratio: str
    best_for: str | None = None
    demo_image_url: str | None = None

    @field_validator("image_prompt")
    @classmethod
    def image_prompt_within_word_limit(cls, value: str) -> str:
        if not _within_word_limit(value, IMAGE_PROMPT_MAX_WORDS):
            raise ValueError(f"Image prompt must be {IMAGE_PROMPT_MAX_WORDS} words or fewer.")
        return value

    @field_validator("animation_prompt")
    @classmethod
    def animation_prompt_within_word_limit(cls, value: str) -> str:
        if not _within_word_limit(value, ANIMATION_PROMPT_MAX_WORDS):
            raise ValueError(f"Animation prompt must be {ANIMATION_PROMPT_MAX_WORDS} words or fewer.")
        return value

    # Catalog-only gallery; its first image is the only one copied on import.
    demo_image_urls: list[str] = Field(default_factory=list, max_length=3)


class GenerateStyleTemplateRequest(BaseModel):
    template_name: str
    description: str
    aspect_ratio: Literal["16:9", "9:16"] = "16:9"
    generate_demo_image: bool = False


class GenerateStyleTemplateResponse(BaseModel):
    description: str
    image_prompt: str
    animation_prompt: str
    youtube_title_description_tags_prompt: str
    youtube_thumbnail_image_prompt: str
    demo_image_url: str | None = None
    credits_spent: float
    credits_remaining: float


class GenerateDemoImageRequest(BaseModel):
    image_prompt: str
    best_for: str | None = None
    aspect_ratio: Literal["16:9", "9:16"] = "16:9"

    @field_validator("image_prompt")
    @classmethod
    def image_prompt_within_word_limit(cls, value: str) -> str:
        if not _within_word_limit(value, IMAGE_PROMPT_MAX_WORDS):
            raise ValueError(f"Image prompt must be {IMAGE_PROMPT_MAX_WORDS} words or fewer.")
        return value


class GenerateDemoImageResponse(BaseModel):
    demo_image_url: str
    credits_spent: float
    credits_remaining: float
