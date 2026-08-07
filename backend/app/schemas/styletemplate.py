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


class StyleTemplateUpdate(StyleTemplateCreate):
    pass
