from fastapi import APIRouter
from typing import List
from app.schemas.item import Item, ItemCreate

router = APIRouter(prefix="/items", tags=["items"])

@router.get("/", response_model=List[Item])
async def get_items():
    return []

@router.post("/", response_model=Item)
async def create_item(item: ItemCreate):
    return {
        "id": 1,
        "owner_id": "user_123",
        "title": item.title,
        "description": item.description
    }
