from openai import AsyncOpenAI

from app.config import settings

# One source of truth for the active OpenAI model mapping. Text routes use
# LangChain's ChatOpenAI; image routes use the official
# AsyncOpenAI Images API because it supports the multi-reference edit payloads
# this app needs.
OPENAI_TEXT_MODEL = "gpt-5.6-luna"
OPENAI_PRO_SCENE_SPLIT_MODEL = "gpt-5.6-terra"

# Explicitly set every OpenAI text route's reasoning level rather than relying
# on the API default. Change these two constants to tune the whole product.
OPENAI_TEXT_REASONING_EFFORT = "low"
OPENAI_PRO_SCENE_SPLIT_REASONING_EFFORT = "medium"

OPENAI_IMAGE_BASE_MODEL = "gpt-image-2.5-flare"
OPENAI_IMAGE_PRO_MODEL = "gpt-image-2.5-sunburst"


def get_openai_client() -> AsyncOpenAI | None:
    """Returns an async OpenAI client, or None if the API key isn't configured yet."""
    if not settings.CHATGPT_PAID_API_KEY:
        return None
    return AsyncOpenAI(api_key=settings.CHATGPT_PAID_API_KEY)


openai_client = get_openai_client()
