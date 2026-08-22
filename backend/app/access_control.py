"""Access-control enforcement for the shared `access_control_list` /
`access_system_settings` tables (written by vgai2admin, enforced here).

Checked from `get_current_user` on every authenticated request, not just at
login: a JWT issued before a user was restricted stays valid (Supabase
auto-refreshes it) until it expires, so a login-only check would let an
already-signed-in restricted user keep working indefinitely.

Short in-process TTL cache rather than a query per request: this table
changes rarely (an admin toggling one user), so a `_CACHE_TTL_SECONDS`-stale
read is an acceptable tradeoff against hitting Postgres on every request.
"""

import time
from threading import Lock

from fastapi import HTTPException, status

from app.supabase import supabase

_CACHE_TTL_SECONDS = 30

_cache_lock = Lock()
_cache_mode = "allowed_all"
_cache_emails: set[str] = set()
_cache_expires_at = 0.0


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _refresh_cache() -> None:
    global _cache_mode, _cache_emails, _cache_expires_at

    settings_resp = (
        supabase.table("access_system_settings").select("mode").eq("id", 1).execute()
    )
    mode = settings_resp.data[0]["mode"] if settings_resp.data else "allowed_all"

    # allowed_all is enforced by the restricted list; allowed_only is enforced
    # by the allowed list. Only ever need to fetch the one that's live.
    list_type = "restricted" if mode == "allowed_all" else "allowed"
    list_resp = (
        supabase.table("access_control_list")
        .select("email")
        .eq("list_type", list_type)
        .execute()
    )
    emails = {_normalize_email(row["email"]) for row in (list_resp.data or [])}

    with _cache_lock:
        _cache_mode = mode
        _cache_emails = emails
        _cache_expires_at = time.monotonic() + _CACHE_TTL_SECONDS


def _get_cached_state() -> tuple[str, set[str]]:
    with _cache_lock:
        expired = time.monotonic() >= _cache_expires_at
    if expired:
        _refresh_cache()
    with _cache_lock:
        return _cache_mode, _cache_emails


def enforce_access(email: str | None) -> None:
    """Raises 403 (code ACCESS_REVOKED) if `email` is blocked under the
    current access-control mode. No-op if the lookup itself fails -- a DB
    hiccup here must not lock every signed-in user out of the whole product;
    the admin panel's own guard against emptying the allowed list is what
    keeps this feature safe, not this fallback.
    """
    if not email:
        return

    try:
        mode, emails = _get_cached_state()
    except Exception:
        return

    normalized = _normalize_email(email)
    blocked = normalized in emails if mode == "allowed_all" else normalized not in emails

    if blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCESS_REVOKED",
                "message": "Your access to vgAI has been revoked.",
            },
        )
