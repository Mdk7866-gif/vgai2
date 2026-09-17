from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "FastAPI Backend Template"

    SUPABASE_URL: str
    SUPABASE_PUBLISHABLE_KEY: str | None = None
    SUPABASE_SECRET_KEY: str

    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: str | None = None
    CLOUDINARY_API_KEY: str | None = None
    CLOUDINARY_API_SECRET: str | None = None
    CLOUDINARY_FOLDER_NAME: str | None = None

    # OpenAI — character sheet / style template "Generate with AI" (see app/openai_client.py)
    CHATGPT_PAID_API_KEY: str | None = None

    # OpenRouter — gateway for Perplexity (viral topic research) and Claude (script
    # generation/improvise) used by /generate_script (see app/openrouter_client.py)
    OPENROUTER_PAID_API_KEY: str | None = None

    # Reserved for a possible future Gemini integration. No current route uses
    # this key; automatic scene splitting uses OpenAI and manual splitting asks
    # the user to run the prompt in ChatGPT.
    GEMINI_PAID_API_KEY: str | None = None

    # Razorpay — credit top-ups (see app/routes/payments/). RAZORPAY_WEBHOOK_SECRET
    # is required by the registered webhook in every deployed environment.
    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None
    RAZORPAY_WEBHOOK_SECRET: str | None = None

    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
