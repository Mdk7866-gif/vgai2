"""Credit-usage history for the /profile page's Usage tab.

Reads `project_expence_tracker` — one running-total row per project, written by
app/credits.py's `add_project_expense` RPC — plus `users.miscellaneous_credit_spent`
for the spend that isn't tied to any project (character sheets, style templates,
script generation, per README §2's project-vs-miscellaneous split).

The other half of that page, payment history, deliberately lives in
app/routes/payments/crud.py instead: that router already owns the credit_topups
table and its CreditTopup schema, so splitting by resource rather than by which
page consumes it keeps this file to a single concern.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.schemas.profile import ProjectUsageRecord, UsageHistoryResponse
from app.supabase import supabase

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/usage-history", response_model=UsageHistoryResponse)
async def get_usage_history(current_user: SupabaseUser = Depends(get_current_user)):
    """Every project the user has spent credits on, most recently active first."""
    expense_result = (
        supabase.table("project_expence_tracker")
        .select("*")
        .eq("user_id", current_user.id)
        .order("updated_at", desc=True)
        .execute()
    )
    expenses = expense_result.data or []

    # project_expence_tracker has no FK to projects (that's what keeps a deleted
    # project's spend queryable), so "is this project still around?" can't come
    # from a join. One lookup covering every row, not one per row.
    live_project_dates: dict[str, str] = {}
    if expenses:
        projects_result = (
            supabase.table("projects")
            .select("id, created_at")
            .eq("user_id", current_user.id)
            .in_("id", [expense["project_id"] for expense in expenses])
            .execute()
        )
        live_project_dates = {
            project["id"]: project["created_at"] for project in (projects_result.data or [])
        }

    records: list[ProjectUsageRecord] = []
    for expense in expenses:
        llm = float(expense["llm_credit_spent"])
        image = float(expense["image_credit_spent"])
        animation = float(expense["animation_credit_spent"])
        voiceover = float(expense["voiceover_credit_spent"])

        records.append(
            ProjectUsageRecord(
                project_id=expense["project_id"],
                project_name=expense["project_name"],
                project_exists=expense["project_id"] in live_project_dates,
                llm_credit_spent=llm,
                image_credit_spent=image,
                animation_credit_spent=animation,
                voiceover_credit_spent=voiceover,
                total_credit_spent=llm + image + animation + voiceover,
                project_created_at=live_project_dates.get(expense["project_id"]),
                first_spend_at=expense["created_at"],
            )
        )

    user_result = (
        supabase.table("users")
        .select("miscellaneous_credit_spent")
        .eq("id", current_user.id)
        .execute()
    )
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    total_miscellaneous = float(user_result.data[0]["miscellaneous_credit_spent"])

    total_llm = sum(record.llm_credit_spent for record in records)
    total_image = sum(record.image_credit_spent for record in records)
    total_animation = sum(record.animation_credit_spent for record in records)
    total_voiceover = sum(record.voiceover_credit_spent for record in records)

    return UsageHistoryResponse(
        projects=records,
        total_credit_spent=(
            total_llm + total_image + total_animation + total_voiceover + total_miscellaneous
        ),
        total_llm_credit_spent=total_llm,
        total_image_credit_spent=total_image,
        total_animation_credit_spent=total_animation,
        total_voiceover_credit_spent=total_voiceover,
        total_miscellaneous_credit_spent=total_miscellaneous,
    )
