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
