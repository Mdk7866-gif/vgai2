from collections.abc import Mapping

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.razorpay_client import razorpay_client
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    AdminCreditGrant,
    PaymentHistoryResponse,
    VerifyPaymentRequest,
)
from app.schemas.user import User
from app.supabase import supabase

router = APIRouter(prefix="/payments", tags=["payments"])

# Fixed USD->INR rate used to price credits (README: 100 credits = $1).
# Razorpay is INR-only until international payments are approved on the
# account, so credits are priced in INR using this fixed rate for now.
USD_TO_INR_RATE = 100
PAISE_PER_CREDIT = USD_TO_INR_RATE  # 100 credits = $1 = USD_TO_INR_RATE rupees = USD_TO_INR_RATE * 100 paise, so 1 credit = USD_TO_INR_RATE paise


def settle_credit_topup(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str | None = None,
) -> None:
    """Atomically mark a captured order successful and add its credits once.

    Checkout verification and Razorpay webhooks can arrive in either order (or
    at the same time). The database function locks the order row, so they can
    never each add the same credits.
    """
    supabase.rpc(
        "settle_credit_topup",
        {
            "p_order_id": razorpay_order_id,
            "p_payment_id": razorpay_payment_id,
            "p_signature": razorpay_signature,
        },
    ).execute()


def mark_credit_topup_failed(
    razorpay_order_id: str, razorpay_payment_id: str | None = None
) -> None:
    """Record a failed attempt without ever overwriting a captured payment."""
    (
        supabase.table("credit_topups")
        .update({"payment_status": "failed", "razorpay_payment_id": razorpay_payment_id})
        .eq("razorpay_order_id", razorpay_order_id)
        .eq("payment_status", "pending")
        .execute()
    )


@router.get("/history", response_model=PaymentHistoryResponse)
async def get_payment_history(current_user: SupabaseUser = Depends(get_current_user)):
    """Every top-up the user has attempted, newest first.

    Unsuccessful attempts are included rather than filtered out: /create-order
    writes a `pending` row *before* Checkout opens, so dismissing the Razorpay
    modal without paying leaves one behind. Showing them means an abandoned
    attempt reads as abandoned instead of looking like a payment that went
    missing — but only `success` rows count toward the totals, since nothing was
    actually charged for the rest.
    """
    result = (
        supabase.table("credit_topups")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    topups = result.data or []
    successful = [topup for topup in topups if topup["payment_status"] == "success"]
    grants_result = (
        supabase.table("admin_credit_grants")
        .select("id, credits_granted, credits_balance_after, reason, grant_kind, created_at")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    grants = [
        AdminCreditGrant.model_validate(grant)
        for grant in (grants_result.data or [])
        if isinstance(grant, Mapping)
    ]

    return PaymentHistoryResponse(
        topups=topups,
        grants=grants,
        total_amount_paid=sum(float(topup["amount_paid"]) for topup in successful),
        total_credits_purchased=sum(float(topup["credits_added"]) for topup in successful),
        total_credits_granted=sum(float(grant.credits_granted) for grant in grants),
    )


def _get_current_balance(user_id: str) -> float:
    result = supabase.table("users").select("current_credit_balance").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return float(result.data[0]["current_credit_balance"])


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    payload: CreateOrderRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Creates a Razorpay order for a credit top-up and a pending credit_topups row.

    The frontend takes the returned order_id/amount/key_id and opens Razorpay
    Checkout. On success it calls /payments/verify to actually add the credits.
    """
    if razorpay_client is None:
        raise HTTPException(status_code=500, detail="Razorpay is not configured on the backend.")

    amount_paise = payload.credits * PAISE_PER_CREDIT

    order = razorpay_client.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {"user_id": current_user.id, "credits": str(payload.credits)},
        }
    )

    current_balance = _get_current_balance(current_user.id)
    supabase.table("credit_topups").insert(
        {
            "user_id": current_user.id,
            "razorpay_order_id": order["id"],
            "amount_paid": amount_paise / 100,
            "currency": "INR",
            "credits_added": payload.credits,
            # Not applied yet — set to the pre-purchase balance and corrected
            # to the real post-purchase balance once /verify succeeds.
            "credits_balance_after": current_balance,
            "payment_status": "pending",
        }
    ).execute()

    return CreateOrderResponse(
        order_id=order["id"],
        amount=amount_paise,
        currency="INR",
        key_id=settings.RAZORPAY_KEY_ID,
        credits=payload.credits,
    )


@router.post("/verify", response_model=User)
async def verify_payment(
    payload: VerifyPaymentRequest,
    current_user: SupabaseUser = Depends(get_current_user),
):
    """Verifies the Razorpay Checkout signature and applies the credits.

    This is the primary path (called by the frontend's checkout success
    handler). The registered server-side webhook calls the same atomic
    settlement helper if this browser callback never returns.
    """
    if razorpay_client is None:
        raise HTTPException(status_code=500, detail="Razorpay is not configured on the backend.")

    topup_result = (
        supabase.table("credit_topups")
        .select("*")
        .eq("razorpay_order_id", payload.razorpay_order_id)
        .execute()
    )
    if not topup_result.data or topup_result.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    topup = topup_result.data[0]

    if topup["payment_status"] == "success":
        # Already verified (e.g. a duplicate call) — just return the current user.
        result = supabase.table("users").select("*").eq("id", current_user.id).execute()
        return result.data[0]

    try:
        razorpay_client.utility.verify_payment_signature(
            {
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            }
        )
    except razorpay.errors.SignatureVerificationError:
        # A webhook may have settled this order between our initial read and this
        # browser-side signature failure. Only transition a still-pending row so
        # a stale/tampered response can never overwrite a captured payment.
        mark_credit_topup_failed(payload.razorpay_order_id, payload.razorpay_payment_id)
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    settle_credit_topup(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    )

    result = supabase.table("users").select("*").eq("id", current_user.id).execute()
    return result.data[0]
