"""Razorpay webhook — PLACEHOLDER, not wired up yet.

Why this exists but isn't active: Razorpay refuses "localhost" as a webhook
URL, so there's nothing to point it at until this app is deployed with a real
domain. The primary credit-top-up path (app/routes/payments/crud.py's
/payments/verify) already works without this — it verifies the payment
signature returned by Razorpay Checkout directly in the browser flow. This
webhook is only a *backup*: it covers the case where a payment succeeds but
the user closes the tab before the frontend can call /verify.

To activate once you have a domain:
  1. Uncomment the code below.
  2. Register the router in app/routes/router.py:
       from app.routes.payments import webhook as payments_webhook
       api_router.include_router(payments_webhook.router)
  3. In the Razorpay Dashboard -> Settings -> Webhooks, add:
       URL:    https://<your-domain>/payments/webhook
       Secret: generate one, put it in RAZORPAY_WEBHOOK_SECRET in backend/.env
       Events: payment.captured, payment.failed (order.paid optional)
"""

# import razorpay
# from fastapi import APIRouter, HTTPException, Request
#
# from app.config import settings
# from app.razorpay_client import razorpay_client
# from app.supabase import supabase
#
# router = APIRouter(prefix="/payments", tags=["payments"])
#
#
# @router.post("/webhook")
# async def razorpay_webhook(request: Request):
#     body = await request.body()
#     signature = request.headers.get("X-Razorpay-Signature", "")
#
#     if razorpay_client is None or not settings.RAZORPAY_WEBHOOK_SECRET:
#         raise HTTPException(status_code=500, detail="Webhook not configured.")
#
#     try:
#         razorpay_client.utility.verify_webhook_signature(
#             body.decode(), signature, settings.RAZORPAY_WEBHOOK_SECRET
#         )
#     except razorpay.errors.SignatureVerificationError:
#         raise HTTPException(status_code=400, detail="Invalid webhook signature")
#
#     event = await request.json()
#     event_type = event.get("event")
#
#     if event_type == "payment.captured":
#         payment_entity = event["payload"]["payment"]["entity"]
#         order_id = payment_entity["order_id"]
#         payment_id = payment_entity["id"]
#
#         topup_result = (
#             supabase.table("credit_topups").select("*").eq("razorpay_order_id", order_id).execute()
#         )
#         if not topup_result.data:
#             return {"status": "ignored"}  # unknown order, nothing to do
#         topup = topup_result.data[0]
#
#         # Idempotency: /verify (the browser-side path) may have already
#         # applied this top-up — only apply it here if it's still pending.
#         if topup["payment_status"] != "pending":
#             return {"status": "already_processed"}
#
#         user_result = (
#             supabase.table("users").select("current_credit_balance").eq("id", topup["user_id"]).execute()
#         )
#         current_balance = float(user_result.data[0]["current_credit_balance"])
#         new_balance = current_balance + float(topup["credits_added"])
#
#         supabase.table("users").update({"current_credit_balance": new_balance}).eq(
#             "id", topup["user_id"]
#         ).execute()
#         supabase.table("credit_topups").update(
#             {
#                 "payment_status": "success",
#                 "razorpay_payment_id": payment_id,
#                 "credits_balance_after": new_balance,
#             }
#         ).eq("id", topup["id"]).execute()
#
#     elif event_type == "payment.failed":
#         payment_entity = event["payload"]["payment"]["entity"]
#         order_id = payment_entity["order_id"]
#         supabase.table("credit_topups").update({"payment_status": "failed"}).eq(
#             "razorpay_order_id", order_id
#         ).execute()
#
#     return {"status": "ok"}
