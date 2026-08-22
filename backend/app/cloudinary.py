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

def _upload_bytes(content: bytes, folder: str, public_id_prefix: str, resource_type: str) -> str:
    """Shared upload path for raw bytes (as opposed to an UploadFile) — used for
    OpenAI's base64 scene/thumbnail images and OpenRouter's raw video bytes, neither of
    which arrive as an UploadFile the way character-sheet uploads do.
    """
    if not settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
        raise HTTPException(status_code=500, detail="Cloudinary is not configured on the backend.")

    try:
        root = settings.CLOUDINARY_FOLDER_NAME or "vgAI"
        response = cloudinary.uploader.upload(
            content,
            folder=f"{root}/{folder}",
            public_id=f"{public_id_prefix}_{uuid.uuid4().hex[:8]}",
            resource_type=resource_type,
        )
        return response.get('secure_url')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload {resource_type} to Cloudinary: {str(e)}")


async def upload_image(file: UploadFile, folder: str, public_id_prefix: str = "img") -> str:
    """Uploads to <CLOUDINARY_FOLDER_NAME>/<folder>/<public_id_prefix>_<random>.

    `folder` is the path *under* the root folder, e.g. f"{user_id}/characters" or
    f"{user_id}/{project_id}/scene_images" — see README.md's "Media Storage" section
    for the full per-user / per-project layout.
    """
    file_content = await file.read()
    return _upload_bytes(file_content, folder, public_id_prefix, resource_type="image")


def upload_image_bytes(content: bytes, folder: str, public_id_prefix: str = "img") -> str:
    """Same as upload_image() but for raw bytes already in hand (e.g. a decoded
    base64 image from OpenAI), used by scene/thumbnail image generation."""
    return _upload_bytes(content, folder, public_id_prefix, resource_type="image")


async def upload_video(file: UploadFile, folder: str, public_id_prefix: str = "video") -> str:
    """Same as upload_image() but for a video UploadFile — e.g. a scene animation
    the user generated outside vgAI and is attaching by hand, as opposed to
    upload_video_bytes() for raw bytes already in hand (an OpenRouter clip)."""
    file_content = await file.read()
    return _upload_bytes(file_content, folder, public_id_prefix, resource_type="video")


def upload_video_bytes(content: bytes, folder: str, public_id_prefix: str = "video") -> str:
    """Uploads raw video bytes (e.g. an OpenRouter-generated animation clip) as a Cloudinary video asset."""
    return _upload_bytes(content, folder, public_id_prefix, resource_type="video")


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


def delete_project_media(user_id: str, project_id: str) -> None:
    """Best-effort teardown of everything Cloudinary holds for one project --
    scene images/animations, the thumbnail, and any orphaned upload from a
    cancelled/superseded generation that was never referenced by a DB row --
    then removes the now-empty project folder(s) themselves so nothing lingers
    once the project row is gone.

    Deletes by prefix rather than replaying tracked scene/thumbnail URLs, so it
    also catches anything not currently on a row. Scoped to
    <root>/<user_id>/<project_id>/, which never overlaps with
    <root>/<user_id>/characters/ -- project_characters.snapshot_character_sheet_url
    points at the still-live character-library asset, not a per-project copy, so
    this prefix can never reach it.
    """
    if not settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
        return

    root = settings.CLOUDINARY_FOLDER_NAME or "vgAI"
    folder = f"{root}/{user_id}/{project_id}"

    for resource_type in ("image", "video"):
        try:
            cloudinary.api.delete_resources_by_prefix(folder, resource_type=resource_type)
        except Exception:
            pass

    # delete_folder only removes an empty folder, so subfolders (scene_images/
    # scene_animation/thumbnail_image) have to go before the project folder itself.
    try:
        for sub in cloudinary.api.subfolders(folder).get("folders", []):
            try:
                cloudinary.api.delete_folder(sub["path"])
            except Exception:
                pass
    except Exception:
        pass

    try:
        cloudinary.api.delete_folder(folder)
    except Exception:
        pass


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
