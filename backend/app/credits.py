"""Credit reservation, refunds, and spend tracking.

Every paid action **reserves** its credits before calling the provider, rather
than deducting them after the call succeeds. The provider bills us the moment the
work starts, so a user who kicks off a generation and then cancels has already
cost us money — charging only on success meant eating that cost. Credits go back
only via an explicit `refund_*` call, for the narrow case where the provider never
produced anything (it errored out, or we failed before reaching it).

Deliberately NOT refunded:
  - the user cancelling mid-flight (the whole point of reserving up front)
  - the provider succeeding but the result being discarded as stale (see the
    generation-token guard in app/routes/project/imagegeneration.py)

Both spend paths go through Postgres functions (see vgaidatabase.sql) so that
concurrent generations — a user clicking Generate on several scene cards at once —
serialize on a row lock instead of each reading the same starting balance and
overwriting one another.
"""

from typing import Literal

from fastapi import HTTPException

from app.supabase import supabase

# Which project_expence_tracker column a project-scoped spend lands in. Mirrors
# the p_kind guard inside the add_project_expense() SQL function.
ProjectExpenseKind = Literal["llm", "image", "animation", "voiceover"]


def get_balance(user_id: str) -> float:
    """Reads the user's current balance. Only for display/error messages — never
    check-then-spend against this, that's the race spend_credits() exists to fix."""
    result = supabase.table("users").select("current_credit_balance").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return float(result.data[0]["current_credit_balance"])


def _spend(user_id: str, amount: float, track_miscellaneous: bool, label: str) -> float:
    try:
        result = supabase.rpc(
            "spend_credits",
            {
                "p_user_id": user_id,
                "p_amount": amount,
                "p_track_miscellaneous": track_miscellaneous,
            },
        ).execute()
    except Exception as e:
        if "INSUFFICIENT_CREDITS" not in str(e):
            raise HTTPException(status_code=500, detail=f"Failed to reserve credits: {e}")
        # The guard inside spend_credits() is authoritative; re-read only to say
        # what the balance actually is in the error the user sees.
        raise HTTPException(
            status_code=402,
            detail=(
                f"Not enough credits — {label} costs {amount:g} credits, "
                f"you have {get_balance(user_id):g}."
            ),
        )
    return float(result.data)


def _refund(user_id: str, amount: float, track_miscellaneous: bool) -> float:
    result = supabase.rpc(
        "refund_credits",
        {"p_user_id": user_id, "p_amount": amount, "p_track_miscellaneous": track_miscellaneous},
    ).execute()
    return float(result.data)


def _track_project_expense(
    user_id: str, project_id: str, project_name: str, kind: ProjectExpenseKind, amount: float
) -> None:
    supabase.rpc(
        "add_project_expense",
        {
            "p_user_id": user_id,
            "p_project_id": project_id,
            "p_project_name": project_name,
            "p_kind": kind,
            "p_amount": amount,
        },
    ).execute()


def reserve_misc_credits(user_id: str, amount: float, label: str) -> float:
    """Reserves credits for a one-off generation not tied to a project (character
    sheet, style template, script) — tracked on users.miscellaneous_credit_spent
    per README §2. Returns the new balance; raises 402 if the user can't afford it."""
    return _spend(user_id, amount, track_miscellaneous=True, label=label)


def refund_misc_credits(user_id: str, amount: float) -> float:
    return _refund(user_id, amount, track_miscellaneous=True)


def reserve_project_credits(
    user_id: str,
    project_id: str,
    project_name: str,
    kind: ProjectExpenseKind,
    amount: float,
    label: str,
) -> float:
    """Reserves credits for project-scoped work, tracked against the project's
    running project_expence_tracker row rather than miscellaneous spend. Returns
    the new balance; raises 402 if the user can't afford it."""
    new_balance = _spend(user_id, amount, track_miscellaneous=False, label=label)
    try:
        _track_project_expense(user_id, project_id, project_name, kind, amount)
    except Exception:
        # Don't charge for work we failed to book — put it back before bailing.
        _refund(user_id, amount, track_miscellaneous=False)
        raise
    return new_balance


def refund_project_credits(
    user_id: str, project_id: str, project_name: str, kind: ProjectExpenseKind, amount: float
) -> float:
    """Reverses reserve_project_credits, backing the spend out of both the balance
    and the project's expense row (a negative increment)."""
    new_balance = _refund(user_id, amount, track_miscellaneous=False)
    _track_project_expense(user_id, project_id, project_name, kind, -amount)
    return new_balance
