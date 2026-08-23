"""The /contact form's one write endpoint.

Deliberately **not** behind `get_current_user`, for three reasons:

  * `/contact` is reachable while signed out, like the rest of the browsable
    app (see CLAUDE.md's "public browsing, gated actions" -- this is the rare
    action that stays ungated, because gating it would defeat its purpose).
  * A user whose access was revoked is exactly who most needs to reach support,
    and vgAI signs them out the moment the backend rejects them -- routing this
    through the auth dependency would call `enforce_access()` and 403 the one
    person the form exists for.
  * Someone who can't sign in at all still has to be able to report that.

The submitter is still attributed when possible: `_optional_user_id()` reads a
Bearer token if one happens to be present and resolves it best-effort, so a
signed-in report carries `user_id` without a signed-out one being rejected.
It never calls `enforce_access()`, on purpose -- see above.

Nothing here reads submissions back. They're listed and triaged from the
vgai2admin portal, which holds the service-role key.
"""

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from app.cloudinary import upload_image
from app.schemas.contact import ContactSubmissionResponse
from app.supabase import supabase

router = APIRouter(prefix="/contact", tags=["contact"])

# Product-wide, not per-user: a signed-out submitter has no <user_id> folder to
# write into, and support screenshots aren't the submitter's own library asset.
SCREENSHOT_FOLDER = "contacts"

# Mirrors the column widths in migration/001_contact_submissions.sql. Checked
# here so an over-long value gets a clear 422 instead of a Postgres error.
NAME_MAX = 200
CONTACT_MAX = 320
DESCRIPTION_MAX = 5000

MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024


async def _optional_user_id(authorization: str | None) -> str | None:
    """Resolves a Bearer token to a user id, or None. Never raises.

    Best-effort attribution only -- a bad/expired token is treated exactly like
    no token, since the submission must go through either way.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        response = supabase.auth.get_user(token)
    except Exception:
        return None
    return response.user.id if response and response.user else None


@router.post("/submit", response_model=ContactSubmissionResponse)
async def submit_contact_form(
    name: str = Form(...),
    contact: str = Form(...),
    issue_description: str = Form(...),
    screenshot: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    name = name.strip()
    contact = contact.strip()
    issue_description = issue_description.strip()

    if not name or not contact or not issue_description:
        raise HTTPException(
            status_code=422, detail="Name, contact, and issue description are all required."
        )
    if len(name) > NAME_MAX:
        raise HTTPException(status_code=422, detail=f"Name must be {NAME_MAX} characters or fewer.")
    if len(contact) > CONTACT_MAX:
        raise HTTPException(
            status_code=422, detail=f"Contact must be {CONTACT_MAX} characters or fewer."
        )
    if len(issue_description) > DESCRIPTION_MAX:
        raise HTTPException(
            status_code=422,
            detail=f"Issue description must be {DESCRIPTION_MAX} characters or fewer.",
        )

    screenshot_url = None
    if screenshot is not None and screenshot.filename:
        if screenshot.content_type and not screenshot.content_type.startswith("image/"):
            raise HTTPException(status_code=422, detail="The screenshot must be an image file.")
        # Read once to size-check, then hand the bytes on -- upload_image()
        # reads the UploadFile itself, so seek back rather than reading twice.
        contents = await screenshot.read()
        if len(contents) > MAX_SCREENSHOT_BYTES:
            raise HTTPException(status_code=422, detail="The screenshot must be 10 MB or smaller.")
        await screenshot.seek(0)
        screenshot_url = await upload_image(
            screenshot, folder=SCREENSHOT_FOLDER, public_id_prefix="contact"
        )

    row = {
        "user_id": await _optional_user_id(authorization),
        "name": name,
        "contact": contact,
        "issue_description": issue_description,
        "screenshot_url": screenshot_url,
    }
    supabase.table("contact_submissions").insert(row).execute()

    return ContactSubmissionResponse(
        message="Thanks — we've received your message and will get back to you soon."
    )
