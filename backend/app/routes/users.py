from fastapi import APIRouter, Depends

from app.access_control import get_public_mode
from app.auth import get_current_user
from app.schemas.user import User
from app.supabase import supabase
from supabase_auth.types import User as SupabaseUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/access_status")
async def get_access_status():
    """Unauthenticated on purpose -- the Navbar needs this before anyone has
    signed in, to show "this app is invite-only" without knowing who's
    asking. Mode only, never the lists themselves: no email addresses leave
    this endpoint. See app/access_control.py::get_public_mode.
    """
    return {"mode": get_public_mode()}


@router.post("/sync", response_model=User)
async def sync_user(current_user: SupabaseUser = Depends(get_current_user)):
    """Ensures a `users` row exists for the authenticated Supabase user.

    Called by the frontend right after login. Safe to call repeatedly: a new
    account receives its 20-credit welcome bonus exactly once, atomically with
    creating its row; returning users are left untouched.
    """
    existing = (
        supabase.table("users").select("*").eq("id", current_user.id).execute()
    )

    if existing.data:
        return existing.data[0]

    metadata = current_user.user_metadata or {}
    created = supabase.rpc(
        "create_user_with_welcome_bonus",
        {
            "p_user_id": current_user.id,
            "p_email": current_user.email,
            "p_name": metadata.get("full_name") or metadata.get("name"),
            "p_profile_image_url": metadata.get("avatar_url"),
        },
    ).execute()
    return created.data[0]


@router.get("/me", response_model=User)
async def get_me(current_user: SupabaseUser = Depends(get_current_user)):
    result = (
        supabase.table("users").select("*").eq("id", current_user.id).execute()
    )
    return result.data[0]
