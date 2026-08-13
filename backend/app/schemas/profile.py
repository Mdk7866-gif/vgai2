from datetime import datetime

from pydantic import BaseModel


class ProjectUsageRecord(BaseModel):
    """One project's running credit spend, read from project_expence_tracker.

    Those rows deliberately have no foreign key back to `projects` so spend
    history outlives the project (README §2) — which means a row can name a
    project the user has since deleted. `project_exists` says whether
    `project_id` still resolves to something the frontend can link to, and
    `project_created_at` is null for the ones it doesn't; `first_spend_at`
    (the tracker row's own created_at) is the only date always available.
    """

    project_id: str
    project_name: str
    project_exists: bool

    llm_credit_spent: float
    image_credit_spent: float
    animation_credit_spent: float
    voiceover_credit_spent: float
    total_credit_spent: float

    project_created_at: datetime | None = None
    first_spend_at: datetime


class UsageHistoryResponse(BaseModel):
    """Per-project spend plus lifetime totals for the /profile Usage tab.

    `total_credit_spent` covers everything the user has ever spent — the four
    project-scoped totals *and* miscellaneous — so the five sub-totals below it
    add up to exactly that number.
    """

    projects: list[ProjectUsageRecord]

    total_credit_spent: float
    total_llm_credit_spent: float
    total_image_credit_spent: float
    total_animation_credit_spent: float
    total_voiceover_credit_spent: float
    total_miscellaneous_credit_spent: float
