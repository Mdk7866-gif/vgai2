from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings

# "pro" llm_model_id tier's structured scene-splitting output (see
# paidscripttoscenesplitter.py) — see CLAUDE.md's AI-generation pattern notes for
# why this is kept as a small server-side constant rather than a raw string
# scattered across callers. Animation generation does NOT use Gemini/Veo — see
# app/openrouter_video.py.
GEMINI_PRO_TEXT_MODEL = "gemini-3-pro-preview"


def get_gemini_chat_model(model: str = GEMINI_PRO_TEXT_MODEL, temperature: float = 0.7) -> ChatGoogleGenerativeAI:
    """Returns a LangChain chat model for Gemini, used for the "pro" llm_model_id
    tier's structured scene-splitting output (see paidscripttoscenesplitter.py)."""
    return ChatGoogleGenerativeAI(model=model, google_api_key=settings.GEMINI_PAID_API_KEY, temperature=temperature)
