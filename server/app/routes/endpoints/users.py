"""User profile management API endpoints."""

import httpx
import logging
from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DBSession, CurrentUser
from app.core.security import verify_password, get_password_hash, encrypt_api_key
from app.core.exceptions import BadRequestError
from app.schemas.user import UserUpdate, PasswordChange, UserResponse, NotionApiKeyUpdate, NotionPagesUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


async def validate_notion_api_key(api_key: str) -> tuple[bool, str]:
    """
    Validate a Notion API key by making a test request to Notion API.
    
    Returns:
        tuple of (is_valid, error_message)
    """
    if not api_key or not api_key.strip():
        return False, "Notion API key cannot be empty"
    
    api_key = api_key.strip()
    
    # Basic format validation - Notion API keys can start with "secret_" (older format) or "ntn_" (newer format)
    if not (api_key.startswith("secret_") or api_key.startswith("ntn_")):
        return False, "Invalid Notion API key format. Notion API keys should start with 'secret_' or 'ntn_'. Please check the link below for help."
    
    # Test the key by making a request to Notion API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try to list users (a simple endpoint that requires valid auth)
            response = await client.get(
                "https://api.notion.com/v1/users/me",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Notion-Version": "2022-06-28",
                },
            )
            
            if response.status_code == 200:
                return True, "Notion API key is valid and connected successfully!"
            elif response.status_code == 401:
                return False, "Invalid or expired Notion API key. Please check your key and try again. Use the link below for help."
            elif response.status_code == 403:
                return False, "Notion API key doesn't have required permissions. Please check your integration settings in Notion."
            else:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("message", f"Notion API returned status {response.status_code}")
                return False, f"Failed to connect to Notion: {error_msg}. Please check your key and try again."
                
    except httpx.TimeoutException:
        return False, "Connection to Notion API timed out. Please check your internet connection and try again."
    except httpx.RequestError as e:
        return False, f"Failed to connect to Notion API: {str(e)}. Please check your internet connection and try again."
    except Exception as e:
        logger.error(f"Unexpected error validating Notion API key: {e}", exc_info=True)
        return False, f"An unexpected error occurred while validating the key: {str(e)}"


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: CurrentUser) -> UserResponse:
    """Get the current user's profile."""
    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        username=current_user.username,
        notion_api_key_configured=bool(current_user.notion_api_key),
        notion_workspace_name=current_user.notion_workspace_name,
        notion_pages=current_user.notion_pages or [],
        google_api_key_configured=bool(current_user.google_access_token),
        google_account_email=current_user.google_account_email,
        google_files=current_user.google_files or [],
    )


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> UserResponse:
    """Update the current user's profile."""
    # Update fields if provided
    if data.name is not None:
        current_user.name = data.name
    
    if data.email is not None:
        # Check if email is already taken
        from app.models.user import User
        result = await db.execute(
            select(User).where(User.email == data.email, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise BadRequestError("Email already in use")
        current_user.email = data.email
    
    if data.username is not None:
        # Check if username is already taken
        from app.models.user import User
        result = await db.execute(
            select(User).where(User.username == data.username, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise BadRequestError("Username already taken")
        current_user.username = data.username
    
    await db.commit()
    await db.refresh(current_user)
    
    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        username=current_user.username,
        notion_api_key_configured=bool(current_user.notion_api_key),
        notion_workspace_name=current_user.notion_workspace_name,
        notion_pages=current_user.notion_pages or [],
        google_api_key_configured=bool(current_user.google_access_token),
        google_account_email=current_user.google_account_email,
        google_files=current_user.google_files or [],
    )


@router.post("/me/password")
async def change_password(
    data: PasswordChange,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Change the current user's password."""
    # Verify current password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise BadRequestError("Current password is incorrect")
    
    # Validate new password
    if len(data.new_password) < 6:
        raise BadRequestError("New password must be at least 6 characters")
    
    if data.new_password == data.current_password:
        raise BadRequestError("New password must be different from current password")
    
    # Update password
    current_user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    
    return {"message": "Password updated successfully"}


@router.post("/me/notion-api-key")
async def update_notion_api_key(
    data: NotionApiKeyUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Update the current user's Notion API key with validation."""
    if data.api_key:
        # Validate the API key before saving
        is_valid, message = await validate_notion_api_key(data.api_key)
        
        if not is_valid:
            raise BadRequestError(message)
        
        # Encrypt and store the validated API key
        current_user.notion_api_key = encrypt_api_key(data.api_key.strip())
    else:
        # Clear the API key if empty string is provided
        current_user.notion_api_key = None
    
    await db.commit()
    
    return {
        "message": "Notion API key validated and saved successfully!",
        "validated": True
    }


@router.post("/me/notion-api-key/validate")
async def validate_notion_api_key_endpoint(
    data: NotionApiKeyUpdate,
) -> dict:
    """Validate a Notion API key without saving it."""
    if not data.api_key:
        raise BadRequestError("Please provide a Notion API key to validate")
    
    is_valid, message = await validate_notion_api_key(data.api_key)
    
    return {
        "valid": is_valid,
        "message": message
    }


@router.post("/me/notion-pages")
async def update_notion_pages(
    data: NotionPagesUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Update the selected Notion pages for the current user."""
    current_user.notion_pages = data.pages
    await db.commit()
    
    return {
        "message": "Notion pages updated successfully",
        "pages": data.pages
    }


@router.delete("/me")
async def delete_account(
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Delete the current user's account and all data."""
    await db.delete(current_user)
    await db.commit()
    
    return {"message": "Account deleted successfully"}

