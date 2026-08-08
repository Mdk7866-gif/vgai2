from openai import AsyncOpenAI

from app.config import settings


def get_openai_client() -> AsyncOpenAI | None:
    """Returns an async OpenAI client, or None if the API key isn't configured yet."""
    if not settings.CHATGPT_PAID_API_KEY:
        return None
    return AsyncOpenAI(api_key=settings.CHATGPT_PAID_API_KEY)


openai_client = get_openai_client()
