from openai import AsyncOpenAI

from app.config import settings

# One source of truth for the active OpenAI model mapping. Text routes use
# LangChain's ChatOpenAI with OPENAI_TEXT_MODEL; image routes use the official
# AsyncOpenAI Images API because it supports the multi-reference edit payloads
# this app needs.
OPENAI_TEXT_MODEL = "gpt-5.6-luna"
OPENAI_IMAGE_BASE_MODEL = "gpt-image-2.5-flare"
OPENAI_IMAGE_PRO_MODEL = "gpt-image-2.5-sunburst"


def get_openai_client() -> AsyncOpenAI | None:
    """Returns an async OpenAI client, or None if the API key isn't configured yet."""
    if not settings.CHATGPT_PAID_API_KEY:
        return None
    return AsyncOpenAI(api_key=settings.CHATGPT_PAID_API_KEY)


openai_client = get_openai_client()
