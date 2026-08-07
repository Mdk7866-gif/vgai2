import razorpay
from fastapi import APIRouter, Depends, HTTPException
from supabase_auth.types import User as SupabaseUser

from app.auth import get_current_user
from app.config import settings
from app.razorpay_client import razorpay_client
from app.schemas.payment import CreateOrderRequest, CreateOrderResponse, VerifyPaymentRequest
from app.schemas.user import User
from app.supabase import supabase

router = APIRouter(prefix="/payments", tags=["payments"])

# Approximate USD->INR rate used to price credits (README: 100 credits = $1).
# Razorpay is INR-only until international payments are approved on the
# account, so credits are priced in INR using this fixed rate for now.
# Revisit with a real/live FX rate (or a fixed INR price list) before launch.
USD_TO_INR_RATE = 83
PAISE_PER_CREDIT = USD_TO_INR_RATE  # 100 credits = $1 = USD_TO_INR_RATE rupees = USD_TO_INR_RATE * 100 paise, so 1 credit = USD_TO_INR_RATE paise


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
    handler). See routes/payments/webhook.py for the server-side backup path
    that will also need to call this same apply-credits logic once deployed.
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
        supabase.table("credit_topups").update(
            {"payment_status": "failed", "razorpay_payment_id": payload.razorpay_payment_id}
        ).eq("id", topup["id"]).execute()
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    current_balance = _get_current_balance(current_user.id)
    new_balance = current_balance + float(topup["credits_added"])

    supabase.table("users").update({"current_credit_balance": new_balance}).eq(
        "id", current_user.id
    ).execute()

    supabase.table("credit_topups").update(
        {
            "payment_status": "success",
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
            "credits_balance_after": new_balance,
        }
    ).eq("id", topup["id"]).execute()

    result = supabase.table("users").select("*").eq("id", current_user.id).execute()
    return result.data[0]
