import razorpay

from app.config import settings


def get_razorpay_client() -> razorpay.Client | None:
    """Returns a Razorpay client, or None if credentials aren't configured yet."""
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return None
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


razorpay_client = get_razorpay_client()
