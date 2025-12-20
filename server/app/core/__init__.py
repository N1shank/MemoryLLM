"""Core module."""

from app.core.config import settings
from app.core.database import get_db, init_db, Base
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token,
)
from app.core.deps import get_current_user, CurrentUser, DBSession
from app.core.exceptions import (
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    TooManyRequestsError,
    InternalServerError,
    ServiceUnavailableError,
)
from app.core.rate_limit import (
    RateLimiter,
    RateLimitMiddleware,
    rate_limiter,
    RATE_LIMITS,
)

__all__ = [
    "settings",
    "get_db",
    "init_db",
    "Base",
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "decode_access_token",
    "get_current_user",
    "CurrentUser",
    "DBSession",
    "BadRequestError",
    "UnauthorizedError",
    "ForbiddenError",
    "NotFoundError",
    "ConflictError",
    "TooManyRequestsError",
    "InternalServerError",
    "ServiceUnavailableError",
    "RateLimiter",
    "RateLimitMiddleware",
    "rate_limiter",
    "RATE_LIMITS",
]
