"""Authentication API endpoints."""

from sqlalchemy import select, or_

from app.core.deps import DBSession, CurrentUser
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_refresh_token
from app.core.exceptions import ConflictError, UnauthorizedError, BadRequestError
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, Token, UserResponse, RefreshRequest

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=Token, status_code=201)
async def signup(user_data: UserCreate, db: DBSession) -> Token:
    """
    Register a new user.
    
    Returns a JWT token on successful registration.
    """
    # Check if email already exists
    result = await db.execute(
        select(User).where(
            or_(User.email == user_data.email, User.username == user_data.username)
        )
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        if existing_user.email == user_data.email:
            raise ConflictError("Email already registered")
        raise ConflictError("Username already taken")
    
    # Create new user
    user = User(
        name=user_data.name,
        email=user_data.email,
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            username=user.username,
            notion_api_key_configured=bool(user.notion_api_key),
            notion_workspace_name=user.notion_workspace_name,
            notion_pages=user.notion_pages or [],
            google_api_key_configured=bool(user.google_access_token),
            google_account_email=user.google_account_email,
            google_files=user.google_files or [],
        ),
    )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: DBSession) -> Token:
    """
    Authenticate a user.
    
    Accepts username or email for login.
    Returns a JWT token on successful authentication.
    """
    # Find user by username or email
    result = await db.execute(
        select(User).where(
            or_(
                User.username == credentials.username,
                User.email == credentials.username,
            )
        )
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise UnauthorizedError("Invalid username or password")
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            username=user.username,
            notion_api_key_configured=bool(user.notion_api_key),
            notion_workspace_name=user.notion_workspace_name,
            notion_pages=user.notion_pages or [],
            google_api_key_configured=bool(user.google_access_token),
            google_account_email=user.google_account_email,
            google_files=user.google_files or [],
        ),
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(request: RefreshRequest, db: DBSession) -> Token:
    """
    Refresh an access token using a refresh token.
    """
    payload = decode_refresh_token(request.refresh_token)
    if not payload or "sub" not in payload:
        raise UnauthorizedError("Invalid or expired refresh token")
    
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid refresh token")
        
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    if not user:
        raise UnauthorizedError("User not found")
        
    access_token = create_access_token(data={"sub": str(user.id)})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            username=user.username,
            notion_api_key_configured=bool(user.notion_api_key),
            notion_workspace_name=user.notion_workspace_name,
            notion_pages=user.notion_pages or [],
            google_api_key_configured=bool(user.google_access_token),
            google_account_email=user.google_account_email,
            google_files=user.google_files or [],
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: CurrentUser,
) -> UserResponse:
    """
    Get the current authenticated user's profile.
    """
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

