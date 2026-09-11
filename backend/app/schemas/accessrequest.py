from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

AccessRequestStatus = Literal["pending", "approved", "denied"]


class AccessRequestCreate(BaseModel):
    email: str = Field(max_length=320)
    purpose: str | None = Field(default=None, max_length=1000)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized or "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("A valid email address is required")
        return normalized

    @field_validator("purpose")
    @classmethod
    def normalize_purpose(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AccessRequestCreateResponse(BaseModel):
    id: str
    email: str
    status: AccessRequestStatus
    requested_at: datetime
    message: str
