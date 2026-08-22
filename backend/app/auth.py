from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.types import User

from app.access_control import enforce_access
from app.supabase import supabase

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:
    """Verifies the Supabase-issued access token and returns the authenticated user."""
    try:
        response = supabase.auth.get_user(credentials.credentials)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )

    if response is None or response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )

    # Every authenticated request goes through this dependency (including
    # /users/sync, called right after login), so this is both the login-time
    # rejection and the ongoing per-request enforcement in one place.
    enforce_access(response.user.email)

    return response.user
