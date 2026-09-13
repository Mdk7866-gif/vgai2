import asyncio

import httpx
from fastapi import Request

from app.config import settings
from app.openrouter_client import OPENROUTER_BASE_URL

# animation_model_id tiers, resolved here to OpenRouter model ids — "base" is a
# cheaper/shorter 5s clip, "pro" a pricier/longer 6s clip (see
# animationgeneration.py for the credit-cost pairing). Video-modality models on
# OpenRouter (https://openrouter.ai/docs/guides/overview/multimodal/video-generation),
# through OpenRouter's video API, rather than a direct provider SDK, so the
# job submission and polling flow stays consistent with the rest of the app.
ANIMATION_BASE_MODEL = "alibaba/wan-2.6"
ANIMATION_PRO_MODEL = "google/veo-3.1-lite"
ANIMATION_BASE_DURATION_SECONDS = 5
ANIMATION_PRO_DURATION_SECONDS = 6

# How often to poll a running video job, and how long to wait before giving up.
VIDEO_POLL_INTERVAL_SECONDS = 5
VIDEO_POLL_TIMEOUT_SECONDS = 300

# Job states that mean "stop polling, this will never complete".
VIDEO_TERMINAL_FAILURE_STATES = ("failed", "error", "cancelled", "expired")
VIDEO_SUCCESS_STATES = ("completed", "succeeded")

# The clip is already paid for by the time we download it, so a transient blip on
# the fetch must not throw the whole generation away — see _download_video().
VIDEO_DOWNLOAD_ATTEMPTS = 3

_HEADERS = {
    "Authorization": f"Bearer {settings.OPENROUTER_PAID_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://vgai.app",
    "X-Title": "vgAI",
}


class OpenRouterVideoGenerationCancelled(Exception):
    """Raised when the client disconnects while a video job is still polling."""


async def _download_video(client: httpx.AsyncClient, url: str) -> bytes:
    """Fetches a finished clip from OpenRouter's `/videos/{id}/content` endpoint.

    Two non-obvious requirements, both learned the hard way (a missing auth header
    here 401s *after* the provider has already generated and billed the clip):

    1. The URL in `unsigned_urls` is an authenticated API endpoint despite the
       "unsigned" name — it needs the same bearer token as every other call.
    2. It redirects to object storage, which rejects a forwarded Authorization
       header. So don't auto-follow: send the token to OpenRouter only, then
       follow the redirect bare. This mirrors curl's default `-L` behavior of
       dropping auth on a cross-host hop.
    """
    last_error: Exception | None = None
    for attempt in range(VIDEO_DOWNLOAD_ATTEMPTS):
        try:
            response = await client.get(url, headers=_HEADERS, follow_redirects=False)
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise RuntimeError("Video download redirected without a target.")
                response = await client.get(location, follow_redirects=True)
            response.raise_for_status()
            return response.content
        except Exception as e:
            last_error = e
            if attempt < VIDEO_DOWNLOAD_ATTEMPTS - 1:
                await asyncio.sleep(2)

    raise RuntimeError(f"Video was generated but could not be downloaded: {last_error}")


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
        while status not in VIDEO_SUCCESS_STATES:
            if status in VIDEO_TERMINAL_FAILURE_STATES:
                raise RuntimeError(f"Video generation {status}: {job.get('error')}")
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

        # Past this point the clip exists and has been billed by the provider, so
        # every remaining step is best-effort-with-retry rather than fail-fast.
        video_urls = job.get("unsigned_urls") or []
        content_url = video_urls[0] if video_urls else f"{OPENROUTER_BASE_URL}/videos/{job['id']}/content?index=0"
        return await _download_video(client, content_url)
