from datetime import datetime

from pydantic import BaseModel, Field


class CreateOrderRequest(BaseModel):
    credits: int = Field(
        ..., ge=10, le=50000, description="Number of credits the user wants to purchase."
    )


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int  # smallest currency unit (paise for INR)
    currency: str
    key_id: str  # Razorpay key_id — public, safe to expose to the frontend Checkout widget
    credits: int


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class CreditTopup(BaseModel):
    id: str
    user_id: str
    razorpay_order_id: str
    razorpay_payment_id: str | None = None
    amount_paid: float
    currency: str
    credits_added: float
    credits_balance_after: float
    payment_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentHistoryResponse(BaseModel):
    """Top-up history for the /profile page's Payment tab.

    `topups` includes unsuccessful attempts, but the totals count only
    `success` rows — see the endpoint docstring for why both matter.
    """

    topups: list[CreditTopup]
    total_amount_paid: float
    total_credits_purchased: float
