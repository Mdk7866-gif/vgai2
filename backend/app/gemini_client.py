import asyncio

from fastapi import Request
from google import genai
from google.genai import types
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings

# Model ids — see CLAUDE.md's AI-generation pattern notes for why these are kept
# as small server-side constants rather than raw strings scattered across callers.
GEMINI_PRO_TEXT_MODEL = "gemini-3-pro-preview"
VEO_ANIMATION_MODEL = "veo-3.0-fast-generate-001"

# How often to poll a running Veo operation, and how long to wait before giving up.
VEO_POLL_INTERVAL_SECONDS = 10
VEO_POLL_TIMEOUT_SECONDS = 360


def get_gemini_chat_model(model: str = GEMINI_PRO_TEXT_MODEL, temperature: float = 0.7) -> ChatGoogleGenerativeAI:
    """Returns a LangChain chat model for Gemini, used for the "pro" llm_model_id
    tier's structured scene-splitting output (see paidscripttoscenesplitter.py)."""
    return ChatGoogleGenerativeAI(model=model, google_api_key=settings.GEMINI_PAID_API_KEY, temperature=temperature)


def get_genai_client() -> genai.Client:
    return genai.Client(api_key=settings.GEMINI_PAID_API_KEY)


class VeoGenerationCancelled(Exception):
    """Raised when the client disconnects while a Veo operation is still polling."""


async def generate_video_from_image(
    request: Request,
    image_bytes: bytes,
    image_mime_type: str,
    prompt: str,
    aspect_ratio: str,
) -> bytes:
    """Runs Veo image-to-video generation and returns the finished clip's raw bytes.

    Polls the long-running operation, checking `request.is_disconnected()` between
    polls so animationgeneration.py can bail out (raising VeoGenerationCancelled)
    without saving or charging credits if the user cancels — the one generation
    path in this app where that's worth doing, since a Veo clip can take minutes
    and costs a flat 40 credits (see the plan's cancellation-semantics note).
    """
    client = get_genai_client()

    operation = await client.aio.models.generate_videos(
        model=VEO_ANIMATION_MODEL,
        prompt=prompt,
        image=types.Image(image_bytes=image_bytes, mime_type=image_mime_type),
        config=types.GenerateVideosConfig(aspect_ratio=aspect_ratio, number_of_videos=1),
    )

    elapsed = 0
    while not operation.done:
        if await request.is_disconnected():
            raise VeoGenerationCancelled()
        if elapsed >= VEO_POLL_TIMEOUT_SECONDS:
            raise TimeoutError("Animation generation timed out.")
        await asyncio.sleep(VEO_POLL_INTERVAL_SECONDS)
        elapsed += VEO_POLL_INTERVAL_SECONDS
        operation = await client.aio.operations.get(operation)

    if operation.error:
        raise RuntimeError(f"Veo generation failed: {operation.error}")

    if not operation.response or not operation.response.generated_videos:
        raise RuntimeError("Veo generation returned no video.")

    video = operation.response.generated_videos[0].video
    if video is None:
        raise RuntimeError("Veo generation returned no video.")

    if video.video_bytes:
        return video.video_bytes

    return await client.aio.files.download(file=video)
