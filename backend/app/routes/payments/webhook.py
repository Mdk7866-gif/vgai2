"""Server-to-server Razorpay payment reconciliation.

Checkout's signed browser response gives immediate feedback, while this route
ensures captured payments are credited if that browser callback never returns.
It deliberately accepts no user session. Razorpay's HMAC is checked against
the exact raw request bytes before JSON is parsed, and settlement is atomic in
Postgres so duplicate or concurrent deliveries cannot grant credits twice.
"""

import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.routes.payments.crud import mark_credit_topup_failed, settle_credit_topup

router = APIRouter(prefix="/payments", tags=["payments"])


def _is_valid_signature(body: bytes, signature: str) -> bool:
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Payment webhook is not configured.")

    body = await request.body()
    if not _is_valid_signature(body, request.headers.get("x-razorpay-signature", "")):
        raise HTTPException(status_code=400, detail="Invalid Razorpay webhook signature.")

    try:
        event = json.loads(body)
        payment = event["payload"]["payment"]["entity"]
        order_id = payment["order_id"]
        payment_id = payment["id"]
    except (KeyError, TypeError, json.JSONDecodeError):
        # A signed event that is not a payment event is outside this endpoint's
        # scope; acknowledge it rather than causing Razorpay retries.
        return {"status": "ignored"}

    if event.get("event") == "payment.captured":
        settle_credit_topup(order_id, payment_id)
        return {"status": "settled"}

    if event.get("event") == "payment.failed":
        mark_credit_topup_failed(order_id, payment_id)
        return {"status": "failed_recorded"}

    return {"status": "ignored"}
