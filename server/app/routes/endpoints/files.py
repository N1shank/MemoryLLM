"""File upload API endpoints."""

import asyncio
import os
import uuid
import mimetypes
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse

from app.core.deps import CurrentUser
from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError

router = APIRouter(prefix="/files", tags=["files"])

# Allowed file types
ALLOWED_EXTENSIONS = {
    # Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    # Documents
    '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.json',
    # Code
    '.py', '.js', '.ts', '.html', '.css', '.yaml', '.yml',
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def get_upload_dir() -> Path:
    """Get or create the upload directory."""
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
) -> dict:
    """
    Upload a file.
    
    Returns the file URL that can be used in messages.
    """
    if not file.filename:
        raise BadRequestError("No filename provided")
    
    # Check file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise BadRequestError(f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise BadRequestError(f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    safe_filename = f"{timestamp}_{unique_id}{ext}"
    
    # Save file
    upload_dir = get_upload_dir()
    file_path = upload_dir / safe_filename
    
    await asyncio.to_thread(file_path.write_bytes, content)
    
    # Get mime type
    mime_type, _ = mimetypes.guess_type(file.filename)
    
    return {
        "filename": safe_filename,
        "original_name": file.filename,
        "url": f"/api/v1/files/{safe_filename}",
        "size": len(content),
        "mime_type": mime_type or "application/octet-stream",
        "is_image": mime_type and mime_type.startswith("image/"),
    }


@router.get("/{filename}")
async def get_file(
    filename: str,
    current_user: CurrentUser,
) -> FileResponse:
    """
    Retrieve an uploaded file. Requires authentication.
    """
    # Sanitize filename to prevent directory traversal
    safe_filename = Path(filename).name
    file_path = get_upload_dir() / safe_filename
    
    if not file_path.exists():
        raise NotFoundError("File not found")
    
    mime_type, _ = mimetypes.guess_type(str(file_path))
    
    return FileResponse(
        path=file_path,
        media_type=mime_type or "application/octet-stream",
        filename=safe_filename,
    )


@router.delete("/{filename}")
async def delete_file(
    filename: str,
    current_user: CurrentUser,
) -> dict:
    """
    Delete an uploaded file.
    """
    safe_filename = Path(filename).name
    file_path = get_upload_dir() / safe_filename
    
    if not file_path.exists():
        raise NotFoundError("File not found")
    
    await asyncio.to_thread(os.remove, file_path)
    
    return {"message": "File deleted successfully"}

