from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.cloudinary import delete_media, upload_image
from app.schemas.character import Character, MAX_CHARACTER_DESCRIPTION_WORDS, character_description_within_word_limit
from app.supabase import supabase

router = APIRouter(prefix="/characters", tags=["characters"])


def _get_owned_character(character_id: str, user_id: str) -> dict:
    """Fetches a character and verifies it belongs to user_id, or raises 404."""
    result = supabase.table("characters").select("*").eq("id", character_id).execute()

    if not result.data or result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Character not found")

    return result.data[0]


@router.get("/", response_model=list[Character])
async def list_characters(current_user: SupabaseUser = Depends(get_current_user)):
    result = (
        supabase.table("characters")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/create", response_model=Character)
async def create_character(
    name: str = Form(...),
    description: str = Form(...),
    is_default: bool = Form(False),
    character_sheet: UploadFile = File(...),
    current_user: SupabaseUser = Depends(get_current_user),
):
    if not character_description_within_word_limit(description):
        raise HTTPException(
            status_code=422,
            detail=f"Description must be {MAX_CHARACTER_DESCRIPTION_WORDS} words or fewer.",
        )
    image_url = await upload_image(
        character_sheet, folder=f"{current_user.id}/characters", public_id_prefix="character"
    )

    new_character = {
        "user_id": current_user.id,
        "name": name,
        "description": description,
        "is_default": is_default,
        "character_sheet_url": image_url,
    }
    created = supabase.table("characters").insert(new_character).execute()
    return created.data[0]


@router.put("/update/{character_id}", response_model=Character)
async def update_character(
    character_id: str,
    name: str = Form(...),
    description: str = Form(...),
    is_default: bool = Form(False),
    character_sheet: UploadFile | None = File(None),
    current_user: SupabaseUser = Depends(get_current_user),
):
    if not character_description_within_word_limit(description):
        raise HTTPException(
            status_code=422,
            detail=f"Description must be {MAX_CHARACTER_DESCRIPTION_WORDS} words or fewer.",
        )
    existing = _get_owned_character(character_id, current_user.id)

    update_data: dict = {
        "name": name,
        "description": description,
        "is_default": is_default,
    }
    if character_sheet is not None and character_sheet.filename:
        update_data["character_sheet_url"] = await upload_image(
            character_sheet, folder=f"{current_user.id}/characters", public_id_prefix="character"
        )
        await delete_media(existing["character_sheet_url"], resource_type="image")

    updated = (
        supabase.table("characters")
        .update(update_data)
        .eq("id", character_id)
        .execute()
    )
    return updated.data[0]


@router.delete("/delete/{character_id}")
async def delete_character(
    character_id: str,
    current_user: SupabaseUser = Depends(get_current_user),
):
    existing = _get_owned_character(character_id, current_user.id)
    supabase.table("characters").delete().eq("id", character_id).execute()
    await delete_media(existing["character_sheet_url"], resource_type="image")
    return {"success": True}
