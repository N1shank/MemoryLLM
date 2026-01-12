"""Authentication API endpoints."""

from typing import Annotated
from sqlalchemy import select, or_

from app.core.deps import DBSession
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.exceptions import ConflictError, UnauthorizedError, BadRequestError
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, Token, UserResponse

from fastapi import APIRouter, Header

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
    
    return Token(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            username=user.username,
            notion_api_key_configured=bool(user.notion_api_key),
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
    
    return Token(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            username=user.username,
            notion_api_key_configured=bool(user.notion_api_key),
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    db: DBSession,
    authorization: Annotated[str | None, Header()] = None,
) -> UserResponse:
    """
    Get the current authenticated user's profile.
    """
    from app.core.security import decode_access_token
    
    if not authorization:
        raise UnauthorizedError("Missing authorization header")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedError("Invalid authorization header format")
    
    token = parts[1]
    payload = decode_access_token(token)
    
    if payload is None:
        raise UnauthorizedError("Invalid or expired token")
    
    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Invalid token payload")
    
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise UnauthorizedError("User not found")
    
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        username=user.username,
        notion_api_key_configured=bool(user.notion_api_key),
    )

