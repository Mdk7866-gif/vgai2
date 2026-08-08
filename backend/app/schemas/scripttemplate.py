from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ContentType = Literal["long_videos", "short_videos"]


class ScriptTemplate(BaseModel):
    id: str
    user_id: str
    category: str
    topic_description: str
    script_description: str
    content_type: ContentType
    target_country: str
    script_word_length: str
    is_saved: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScriptTemplateCreate(BaseModel):
    # If set, this "Save as Template" reuses the (already-persisted, auto-created
    # by /generatetopics) script_templates row instead of inserting a duplicate.
    script_template_id: str | None = None

    category: str
    topic_description: str
    script_description: str
    content_type: ContentType = "long_videos"
    target_country: str
    script_word_length: str


class ScriptTemplateUpdate(BaseModel):
    category: str
    topic_description: str
    script_description: str
    content_type: ContentType = "long_videos"
    target_country: str
    script_word_length: str


# ---- "Generate Script" flow — researched_topics / generated_scripts (DB-backed,
# see viralscripttopicresearch.py). Every call here operates on a script_templates
# row: the first /generatetopics call for a fresh session creates one
# (is_saved=false); later calls reuse it via script_template_id. ----


class TopicResearchRequest(BaseModel):
    script_template_id: str | None = None
    category: str
    topic_description: str
    script_description: str
    content_type: ContentType
    target_country: str
    script_word_length: str


class ViralTopic(BaseModel):
    title: str
    reason: str


class TopicResearchResponse(BaseModel):
    script_template_id: str
    topics: list[ViralTopic]
    credits_spent: float
    credits_remaining: float


class InvolvedCharacter(BaseModel):
    name: str
    age: int | None = None
    gender: str | None = None
    profession: str | None = None
    appearance_description: str | None = None


class ScriptGenerateRequest(BaseModel):
    script_template_id: str
    topic: str


class ScriptGenerateResponse(BaseModel):
    generated_script_id: str
    script_template_id: str
    topic: str
    script: str
    word_count: int
    characters: list[InvolvedCharacter]
    credits_spent: float
    credits_remaining: float


class ScriptImproviseRequest(BaseModel):
    generated_script_id: str
    feedback: str


class ScriptImproviseResponse(BaseModel):
    generated_script_id: str
    script_template_id: str
    topic: str
    script: str
    word_count: int
    characters: list[InvolvedCharacter]
    credits_spent: float
    credits_remaining: float


class GeneratedScriptRecord(BaseModel):
    id: str
    script_template_id: str
    topic: str
    script: str
    word_count: int
    characters: list[InvolvedCharacter]
    # The owning script_template's word-length band, embedded via the FK join —
    # needed to display the right Improvise cost after a page reload, since it
    # can differ from whatever the form currently shows.
    script_word_length: str
    created_at: datetime
    updated_at: datetime
