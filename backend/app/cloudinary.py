import cloudinary
import cloudinary.uploader
import cloudinary.api
from fastapi import UploadFile, HTTPException
from app.config import settings
import uuid

# Configure Cloudinary if credentials are provided
if settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True
    )

async def upload_image(file: UploadFile) -> str:
    if not settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
        raise HTTPException(status_code=500, detail="Cloudinary is not configured on the backend.")

    try:
        file_content = await file.read()

        # Upload using the Cloudinary SDK
        response = cloudinary.uploader.upload(
            file_content,
            folder=settings.CLOUDINARY_FOLDER_NAME or "vgAI",
            public_id=f"character_{uuid.uuid4().hex[:8]}"
        )

        # Cloudinary returns 'secure_url' for https links
        return response.get('secure_url')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image to Cloudinary: {str(e)}")


def _public_id_from_url(secure_url: str) -> str | None:
    """Extracts the Cloudinary public_id (including folder) from a secure_url,
    e.g. https://res.cloudinary.com/<cloud>/image/upload/v169.../vgAI/character_ab12.jpg
    -> "vgAI/character_ab12".
    """
    if "/upload/" not in secure_url:
        return None

    after_upload = secure_url.split("/upload/", 1)[1]
    segments = after_upload.split("/")

    # Drop the version segment (e.g. "v1690000000") if present.
    if segments and segments[0].startswith("v") and segments[0][1:].isdigit():
        segments = segments[1:]

    path_with_ext = "/".join(segments)
    public_id, _, _ext = path_with_ext.rpartition(".")
    return public_id or path_with_ext or None


async def delete_media(secure_url: str | None, resource_type: str = "image") -> None:
    """Best-effort delete of an image/video/audio asset from Cloudinary given its
    secure_url. resource_type is "image", "video" (also covers audio/voiceovers),
    or "raw". Silently no-ops if the URL is missing/unparseable or Cloudinary isn't
    configured, so a Cloudinary hiccup never blocks the caller's own delete/update.
    """
    if not secure_url or not settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
        return

    public_id = _public_id_from_url(secure_url)
    if not public_id:
        return

    try:
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    except Exception:
        pass
