from datetime import datetime
from typing import Literal

from pydantic import BaseModel

GenerationStatus = Literal["pending", "generating", "completed", "failed"]


class InvolvedCharacterRef(BaseModel):
    id: str
    name: str


class Scene(BaseModel):
    id: str
    project_id: str
    scene_number: int
    scene_text: str
    scene_image_prompt: str | None = None
    scene_animation_prompt: str | None = None
    generated_image_url: str | None = None
    generated_animation_url: str | None = None
    image_status: GenerationStatus
    animation_status: GenerationStatus
    involved_characters: list[InvolvedCharacterRef] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SceneCreate(BaseModel):
    project_id: str
    scene_text: str
    scene_image_prompt: str | None = None
    scene_animation_prompt: str | None = None
    involved_character_ids: list[str] = []


class SceneUpdate(BaseModel):
    scene_text: str
    scene_image_prompt: str | None = None
    scene_animation_prompt: str | None = None
    involved_character_ids: list[str] = []


class InsertSceneRequest(BaseModel):
    project_id: str
    reference_scene_id: str
    direction: Literal["above", "below"]


GenerationKind = Literal["image", "animation"]


class CancelGenerationRequest(BaseModel):
    scene_id: str
    kind: GenerationKind


class GenerateScenesAutomaticRequest(BaseModel):
    project_id: str


class GenerateScenesManualRequest(BaseModel):
    project_id: str
    # The structured JSON the user pasted back after running our prompt through
    # gemini.com themselves. Parsed defensively — see freescripttoscenesplitter.py.
    raw_response: str


class GenerateScenesResponse(BaseModel):
    """Shared response shape for both /generate_automatic and /generate_manual —
    same fields either way, only how the scene split was produced differs."""

    scenes: list[Scene]
    title_of_video: str
    description_of_video: str
    tags_of_video: str
    thumbnail_prompt: str
    credits_spent: float
    credits_remaining: float


class GenerateSceneImageRequest(BaseModel):
    scene_id: str


class GenerateSceneImageResponse(BaseModel):
    scene: Scene
    credits_spent: float
    credits_remaining: float


class GenerateSceneAnimationRequest(BaseModel):
    scene_id: str


class GenerateSceneAnimationResponse(BaseModel):
    scene: Scene
    credits_spent: float
    credits_remaining: float


class GenerateThumbnailRequest(BaseModel):
    project_id: str


class GenerateThumbnailResponse(BaseModel):
    thumbnail_image_url: str
    credits_spent: float
    credits_remaining: float
