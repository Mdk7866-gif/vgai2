from datetime import datetime
from typing import Literal

from pydantic import BaseModel

SceneDensity = Literal["small", "medium", "high"]


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
    """One entry of the read-only starter catalog (app/data/default_style_templates.json).

    Not DB-backed — it has a `slug` instead of an `id` and no `user_id`/timestamps,
    since nothing exists in style_templates until the user imports it.
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


class GenerateStyleTemplateRequest(BaseModel):
    template_name: str
    description: str
    aspect_ratio: Literal["16:9", "9:16"] = "16:9"


class GenerateStyleTemplateResponse(BaseModel):
    description: str
    image_prompt: str
    animation_prompt: str
    youtube_title_description_tags_prompt: str
    youtube_thumbnail_image_prompt: str
    credits_spent: float
    credits_remaining: float
