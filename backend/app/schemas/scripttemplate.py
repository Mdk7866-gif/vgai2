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
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScriptTemplateCreate(BaseModel):
    category: str
    topic_description: str
    script_description: str
    content_type: ContentType = "long_videos"
    target_country: str
    script_word_length: str


class ScriptTemplateUpdate(ScriptTemplateCreate):
    pass


# ---- "Generate Script" flow (not DB-backed — see viralscripttopicresearch.py) ----


class TopicResearchRequest(BaseModel):
    category: str
    topic_description: str
    target_country: str
    content_type: ContentType


class ViralTopic(BaseModel):
    title: str
    reason: str


class TopicResearchResponse(BaseModel):
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
    topic: str
    category: str
    topic_description: str
    script_description: str
    target_country: str
    content_type: ContentType
    script_word_length: str


class ScriptGenerateResponse(BaseModel):
    topic: str
    script: str
    word_count: int
    characters: list[InvolvedCharacter]
    credits_spent: float
    credits_remaining: float


class ScriptImproviseRequest(BaseModel):
    topic: str
    script: str
    feedback: str
    script_word_length: str


class ScriptImproviseResponse(BaseModel):
    topic: str
    script: str
    word_count: int
    characters: list[InvolvedCharacter]
    credits_spent: float
    credits_remaining: float
