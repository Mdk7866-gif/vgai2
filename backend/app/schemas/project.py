from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.styletemplate import SceneDensity

# "base"/"pro" tiers, resolved server-side to actual provider model ids (see
# paidscripttoscenesplitter.py / imagegeneration.py / animationgeneration.py) —
# kept as opaque tier strings on the DB row rather than raw model ids, same
# reasoning as quality="low"/"high" on the character-sheet generation flow.
LlmModelTier = Literal["base", "pro"]
ImageModelTier = Literal["base", "pro"]
AnimationModelTier = Literal["base", "pro"]


class Project(BaseModel):
    id: str
    user_id: str
    name: str
    script: str | None = None
    is_liked: bool

    llm_model_id: LlmModelTier
    image_model_id: ImageModelTier
    animation_model_id: AnimationModelTier

    snapshot_styletemplate_name: str | None = None
    snapshot_styletemplate_image_prompt: str | None = None
    snapshot_styletemplate_animation_prompt: str | None = None
    snapshot_styletemplate_youtube_title_description_tags_prompt: str | None = None
    snapshot_styletemplate_youtube_thumbnail_image_prompt: str | None = None
    snapshot_styletemplate_description: str | None = None
    snapshot_styletemplate_image_aspect_ratio: str | None = None
    snapshot_styletemplate_video_aspect_ratio: str | None = None
    snapshot_styletemplate_scene_density: SceneDensity | None = None

    thumbnail_prompt: str | None = None
    thumbnail_image_url: str | None = None
    title_of_video: str | None = None
    description_of_video: str | None = None
    tags_of_video: str | None = None

    vo_voice_id: str | None = None
    vo_model_id: str | None = None
    vo_stability: float | None = None
    vo_similarity: float | None = None
    vo_style: float | None = None
    vo_speaker_boost: bool | None = None
    vo_speed: float | None = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectCreate(BaseModel):
    name: str
    script: str | None = None


class ProjectBatchDeleteRequest(BaseModel):
    """The project ids selected for one destructive sidebar action."""

    project_ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator("project_ids")
    @classmethod
    def project_ids_are_unique(cls, value: list[str]) -> list[str]:
        unique_ids = list(dict.fromkeys(value))
        if not all(project_id.strip() for project_id in unique_ids):
            raise ValueError("Project ids cannot be blank")
        return unique_ids


class ProjectUpdate(BaseModel):
    """All fields optional — applied via model_dump(exclude_unset=True) in
    projectcrud.py. Deliberately a partial-update shape (unlike StyleTemplateUpdate's
    full-replace), since rename, script autosave, and the model-tier pickers are
    separate UI surfaces that each only ever touch their own subset of fields.

    The snapshot_styletemplate_* fields let a user tweak the style template
    *snapshotted onto this project* directly (ChooseStyleTemplatePopUp.tsx's
    "Currently applied" card, reusing EditStyleTemplateCardPopUp.tsx in its
    project-scoped variant) without touching the original style_templates row
    or any other project that imported the same template — that's the entire
    point of snapshotting per vgaidatabase.dbml. Deliberately no endpoint
    writes these back onto style_templates; this is a one-way, project-local
    edit only.
    """

    name: str | None = None
    script: str | None = None
    is_liked: bool | None = None
    llm_model_id: LlmModelTier | None = None
    image_model_id: ImageModelTier | None = None
    animation_model_id: AnimationModelTier | None = None
    title_of_video: str | None = None
    description_of_video: str | None = None
    tags_of_video: str | None = None
    thumbnail_prompt: str | None = None

    @field_validator("script")
    @classmethod
    def script_has_at_most_4000_words(cls, value: str | None) -> str | None:
        if value is not None and len(value.split()) > 4000:
            raise ValueError("Script must be 4,000 words or fewer. Please shorten it and try again.")
        return value

    snapshot_styletemplate_name: str | None = None
    snapshot_styletemplate_image_prompt: str | None = None
    snapshot_styletemplate_animation_prompt: str | None = None
    snapshot_styletemplate_youtube_title_description_tags_prompt: str | None = None
    snapshot_styletemplate_youtube_thumbnail_image_prompt: str | None = None
    snapshot_styletemplate_description: str | None = None
    snapshot_styletemplate_image_aspect_ratio: str | None = None
    snapshot_styletemplate_video_aspect_ratio: str | None = None
    snapshot_styletemplate_scene_density: SceneDensity | None = None


class ProjectCharacter(BaseModel):
    id: str
    project_id: str
    snapshot_name: str
    snapshot_description: str
    snapshot_character_sheet_url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CharacterImportRequest(BaseModel):
    character_ids: list[str]


class StyleTemplateImportRequest(BaseModel):
    style_template_id: str


class VoiceoverSettingsUpdate(BaseModel):
    vo_voice_id: str
    vo_model_id: str
    vo_stability: float
    vo_similarity: float
    vo_style: float
    vo_speaker_boost: bool
    vo_speed: float
