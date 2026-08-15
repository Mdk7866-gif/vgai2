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


class GenerateScenesManualChargeRequest(BaseModel):
    project_id: str


class GenerateScenesManualChargeResponse(BaseModel):
    """Charges for the manual scene-split flow the instant the user clicks
    "Generate Scenes (Manual)" — before GenerateScenesManualPopUp.tsx even opens
    and reveals the copy-paste prompt. See freescripttoscenesplitter.py for why:
    once a user can see/copy the prompt they could run it through gemini.com and
    use the split outside vgAI without ever pasting a result back."""

    credits_spent: float
    credits_remaining: float


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
    # Always None — re-splitting discards the previous batch's thumbnail (see
    # scenesplitcommon.py's persist_scene_split), returned explicitly so the
    # frontend can clear its stale thumbnail without a separate re-fetch.
    thumbnail_image_url: str | None
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


class GenerateImagesManualRequest(BaseModel):
    project_id: str


class GenerateImagesManualResponse(BaseModel):
    """No scene data changes here — ManualImageGenerationPromptCopyPopUp.tsx builds
    everything (batched prompts, character-sheet copy buttons) client-side and the
    user generates on meta.ai themselves, so this is a credit charge only."""

    credits_spent: float
    credits_remaining: float
