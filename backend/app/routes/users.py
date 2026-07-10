from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.user import User, UserCreate
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[User])
async def get_users():
    return []

@router.post("/", response_model=User)
async def create_user(user: UserCreate):
    return {
        "id": "user_123",
        "created_at": datetime.now(timezone.utc),
        "email": user.email,
        "is_active": user.is_active
    }
