from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.schemas.user import User
from app.supabase import supabase
from supabase_auth.types import User as SupabaseUser

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/sync", response_model=User)
async def sync_user(current_user: SupabaseUser = Depends(get_current_user)):
    """Ensures a `users` row exists for the authenticated Supabase user.

    Called by the frontend right after login. Safe to call repeatedly:
    creates the row on first login, otherwise returns the existing one untouched.
    """
    existing = (
        supabase.table("users").select("*").eq("id", current_user.id).execute()
    )

    if existing.data:
        return existing.data[0]

    metadata = current_user.user_metadata or {}
    new_user = {
        "id": current_user.id,
        "email": current_user.email,
        "name": metadata.get("full_name") or metadata.get("name"),
        "profile_image_url": metadata.get("avatar_url"),
    }

    created = supabase.table("users").insert(new_user).execute()
    return created.data[0]


@router.get("/me", response_model=User)
async def get_me(current_user: SupabaseUser = Depends(get_current_user)):
    result = (
        supabase.table("users").select("*").eq("id", current_user.id).execute()
    )
    return result.data[0]
