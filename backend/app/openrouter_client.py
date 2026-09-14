from langchain_openai import ChatOpenAI

from app.config import settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Model ids as published by OpenRouter (see https://openrouter.ai/perplexity and
# https://openrouter.ai/anthropic) — used by app/routes/scriptgenerationtemplate/
# viralscripttopicresearch.py for the two AI calls behind /generate_script.
PERPLEXITY_RESEARCH_MODEL = "perplexity/sonar-pro"
CLAUDE_SCRIPT_MODEL = "anthropic/claude-sonnet-5"


def get_openrouter_chat_model(model: str, temperature: float = 0.7) -> ChatOpenAI:
    """Returns a LangChain ChatOpenAI client pointed at OpenRouter instead of OpenAI.

    OpenRouter exposes an OpenAI-compatible API, so this is the same ChatOpenAI class
    used for the OpenAI-backed generation flows (characters/generatecharacter.py,
    styletemplates/generatetemplate.py) — only base_url/api_key differ.
    """
    return ChatOpenAI(
        model=model,
        api_key=settings.OPENROUTER_PAID_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        temperature=temperature,
        default_headers={
            "HTTP-Referer": "https://vgai2.com",
            "X-Title": "vgAI2",
        },
    )
