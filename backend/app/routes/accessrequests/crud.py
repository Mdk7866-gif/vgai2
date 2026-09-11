"""Public access requests shown only while vgAI is in allowed_only mode.

No authentication dependency is intentional: people absent from the allowed
list are signed out/blocked, so requiring a vgAI session would make the form
unusable by exactly the audience it serves.
"""

from fastapi import APIRouter, HTTPException

from app.access_control import get_public_mode
from app.schemas.accessrequest import (
    AccessRequestCreate,
    AccessRequestCreateResponse,
)
from app.supabase import supabase

router = APIRouter(prefix="/access-requests", tags=["access-requests"])


@router.post("/", response_model=AccessRequestCreateResponse)
async def create_access_request(payload: AccessRequestCreate):
    if get_public_mode() != "allowed_only":
        raise HTTPException(status_code=409, detail="Access requests are only open while vgAI is invite-only.")

    existing_rows = (
        supabase.table("user_access_requests").select("*").eq("email", payload.email).execute()
    ).data or []

    if existing_rows:
        existing = existing_rows[0]
        if existing["status"] == "approved":
            return AccessRequestCreateResponse(
                **existing,
                message="This email has already been approved. You can sign in with Google.",
            )
        if existing["status"] == "pending":
            return AccessRequestCreateResponse(
                **existing,
                message="Your access request is already waiting for review.",
            )
        row = (
            supabase.table("user_access_requests")
            .update(
                {
                    "purpose": payload.purpose,
                    "status": "pending",
                    "requested_at": "now()",
                    "reviewed_at": None,
                    "updated_at": "now()",
                }
            )
            .eq("id", existing["id"])
            .execute()
        ).data[0]
    else:
        row = (
            supabase.table("user_access_requests")
            .insert({"email": payload.email, "purpose": payload.purpose})
            .execute()
        ).data[0]

    return AccessRequestCreateResponse(
        **row,
        message="Your request has been submitted. We’ll review it and add your email if approved.",
    )
