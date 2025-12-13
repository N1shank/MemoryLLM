"""Main API router."""

from fastapi import APIRouter

from app.routes.endpoints.auth import router as auth_router
from app.routes.endpoints.chat import router as chat_router
from app.routes.endpoints.conversations import router as conversations_router
from app.routes.endpoints.users import router as users_router
from app.routes.endpoints.files import router as files_router

router = APIRouter()

# Public routes
router.include_router(auth_router)

# Protected routes
router.include_router(chat_router)
router.include_router(conversations_router)
router.include_router(users_router)
router.include_router(files_router)
