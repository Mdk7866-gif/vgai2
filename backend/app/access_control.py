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
# email -> note (the admin-entered "why", vgai2admin's AllowedUsersCardPopUp /
# RestrictedUsersCardPopUp "Reason" field). A dict, not a set, so a block can
# be explained to the user it happened to, not just enforced silently.
_cache_entries: dict[str, str | None] = {}
_cache_expires_at = 0.0


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _refresh_cache() -> None:
    global _cache_mode, _cache_entries, _cache_expires_at

    settings_resp = (
        supabase.table("access_system_settings").select("mode").eq("id", 1).execute()
    )
    mode = settings_resp.data[0]["mode"] if settings_resp.data else "allowed_all"

    # allowed_all is enforced by the restricted list; allowed_only is enforced
    # by the allowed list. Only ever need to fetch the one that's live.
    list_type = "restricted" if mode == "allowed_all" else "allowed"
    list_resp = (
        supabase.table("access_control_list")
        .select("email, note")
        .eq("list_type", list_type)
        .execute()
    )
    entries = {
        _normalize_email(row["email"]): row.get("note") for row in (list_resp.data or [])
    }

    with _cache_lock:
        _cache_mode = mode
        _cache_entries = entries
        _cache_expires_at = time.monotonic() + _CACHE_TTL_SECONDS


def _get_cached_state() -> tuple[str, dict[str, str | None]]:
    with _cache_lock:
        expired = time.monotonic() >= _cache_expires_at
    if expired:
        _refresh_cache()
    with _cache_lock:
        return _cache_mode, _cache_entries


def get_public_mode() -> str:
    """The current access mode only -- no emails, no notes. Safe to expose on
    an unauthenticated endpoint so the frontend can show mode-aware copy
    (e.g. an "invite-only" navbar note) before anyone has signed in.
    """
    try:
        mode, _ = _get_cached_state()
    except Exception:
        return "allowed_all"
    return mode


def enforce_access(email: str | None) -> None:
    """Raises 403 (code ACCESS_REVOKED) if `email` is blocked under the
    current access-control mode. No-op if the lookup itself fails -- a DB
    hiccup here must not lock every signed-in user out of the whole product;
    the admin panel's own guard against emptying the allowed list is what
    keeps this feature safe, not this fallback.

    The 403 detail carries `mode` and `reason` alongside the old `code`/
    `message` shape, so the frontend (AccessRevokedModal, see vgai2admin
    README §10.3-adjacent access-control docs) can explain *why* rather than
    just that. `reason` is the admin's note on the matching restricted-list
    entry when one exists (allowed_all mode); there is no per-user reason for
    an allowed_only block, since being blocked there just means "absent from
    the allowed list", not "present on some other list".
    """
    if not email:
        return

    try:
        mode, entries = _get_cached_state()
    except Exception:
        return

    normalized = _normalize_email(email)

    if mode == "allowed_all":
        blocked = normalized in entries
        reason = entries.get(normalized) if blocked else None
        message = "Your access to vgAI2 has been revoked."
    else:
        blocked = normalized not in entries
        reason = None
        message = "vgAI2 is currently invite-only, and this email is not on the allowed list."

    if blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCESS_REVOKED",
                "message": message,
                "mode": mode,
                "reason": reason,
            },
        )
