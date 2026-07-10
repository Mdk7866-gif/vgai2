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
