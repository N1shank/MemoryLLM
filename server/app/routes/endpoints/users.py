"""User profile management API endpoints."""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DBSession, CurrentUser
from app.core.security import verify_password, get_password_hash, encrypt_api_key
from app.core.exceptions import BadRequestError
from app.schemas.user import UserUpdate, PasswordChange, UserResponse, NotionApiKeyUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: CurrentUser) -> UserResponse:
    """Get the current user's profile."""
    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        username=current_user.username,
        notion_api_key_configured=bool(current_user.notion_api_key),
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
    """Update the current user's Notion API key."""
    # Encrypt and store the API key
    if data.api_key:
        # Validate that it's not empty
        if not data.api_key.strip():
            raise BadRequestError("Notion API key cannot be empty")
        current_user.notion_api_key = encrypt_api_key(data.api_key.strip())
    else:
        # Clear the API key if empty string is provided
        current_user.notion_api_key = None
    
    await db.commit()
    
    return {"message": "Notion API key updated successfully"}


@router.delete("/me")
async def delete_account(
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Delete the current user's account and all data."""
    await db.delete(current_user)
    await db.commit()
    
    return {"message": "Account deleted successfully"}

