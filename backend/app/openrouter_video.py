import asyncio

import httpx
from fastapi import Request

from app.config import settings
from app.openrouter_client import OPENROUTER_BASE_URL

# animation_model_id tiers, resolved here to OpenRouter model ids — "base" is a
# cheaper/shorter 5s clip, "pro" a pricier/longer 6s clip (see
# animationgeneration.py for the credit-cost pairing). Video-modality models on
# OpenRouter (https://openrouter.ai/docs/guides/overview/multimodal/video-generation),
# not Gemini/Veo directly — that raw-SDK path was removed in favor of routing
# every provider through OpenRouter like the rest of the app's AI calls.
ANIMATION_BASE_MODEL = "alibaba/wan-2.6"
ANIMATION_PRO_MODEL = "google/veo-3.1-lite"
ANIMATION_BASE_DURATION_SECONDS = 5
ANIMATION_PRO_DURATION_SECONDS = 6

# How often to poll a running video job, and how long to wait before giving up.
VIDEO_POLL_INTERVAL_SECONDS = 5
VIDEO_POLL_TIMEOUT_SECONDS = 300

_HEADERS = {
    "Authorization": f"Bearer {settings.OPENROUTER_PAID_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://vgai.app",
    "X-Title": "vgAI",
}


class OpenRouterVideoGenerationCancelled(Exception):
    """Raised when the client disconnects while a video job is still polling."""


async def generate_video_from_image_url(
    request: Request,
    image_url: str,
    prompt: str,
    model: str,
    duration: int,
    aspect_ratio: str,
) -> bytes:
    """Runs OpenRouter image-to-video generation and returns the finished clip's
    raw bytes.

    Submits the job with the scene's already-hosted Cloudinary image URL as the
    first frame (no need to download/re-upload it), then polls the returned
    polling_url, checking `request.is_disconnected()` between polls so
    animationgeneration.py can bail out (raising OpenRouterVideoGenerationCancelled)
    without saving or charging credits if the user cancels — the one generation
    path in this app where that's worth doing, since a clip can take minutes.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        create_response = await client.post(
            f"{OPENROUTER_BASE_URL}/videos",
            headers=_HEADERS,
            json={
                "model": model,
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "duration": duration,
                "frame_images": [
                    {"type": "image_url", "image_url": {"url": image_url}, "frame_type": "first_frame"}
                ],
            },
        )
        create_response.raise_for_status()
        job = create_response.json()
        polling_url = job.get("polling_url") or f"{OPENROUTER_BASE_URL}/videos/{job['id']}"

        elapsed = 0
        status = job.get("status")
        while status not in ("completed", "succeeded"):
            if status in ("failed", "error"):
                raise RuntimeError(f"Video generation failed: {job.get('error')}")
            if await request.is_disconnected():
                raise OpenRouterVideoGenerationCancelled()
            if elapsed >= VIDEO_POLL_TIMEOUT_SECONDS:
                raise TimeoutError("Animation generation timed out.")
            await asyncio.sleep(VIDEO_POLL_INTERVAL_SECONDS)
            elapsed += VIDEO_POLL_INTERVAL_SECONDS
            poll_response = await client.get(polling_url, headers=_HEADERS)
            poll_response.raise_for_status()
            job = poll_response.json()
            status = job.get("status")

        video_urls = job.get("unsigned_urls") or []
        if not video_urls:
            raise RuntimeError("Video generation returned no video.")

        video_response = await client.get(video_urls[0])
        video_response.raise_for_status()
        return video_response.content
