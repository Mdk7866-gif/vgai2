from datetime import datetime

from pydantic import BaseModel


class ContactSubmission(BaseModel):
    """One /contact form submission. Read back only by the vgai2admin portal --
    vgAI itself never lists these, so there's no per-user "my tickets" view.
    """

    id: str
    user_id: str | None = None

    name: str
    contact: str
    issue_description: str
    screenshot_url: str | None = None

    status: str
    admin_note: str | None = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContactSubmissionResponse(BaseModel):
    """What the form gets back on success -- deliberately not the whole row.

    The submitter has no way to look a submission up again (there's no
    per-user list and no lookup endpoint), so returning the id would imply a
    tracking feature that doesn't exist. Only enough to render a confirmation.
    """

    success: bool = True
    message: str
