"""Main API router."""

from fastapi import APIRouter

from app.routes.endpoints.auth import router as auth_router
from app.routes.endpoints.chat import router as chat_router
from app.routes.endpoints.conversations import router as conversations_router
from app.routes.endpoints.users import router as users_router
from app.routes.endpoints.files import router as files_router
from app.routes.endpoints.share import router as share_router
from app.routes.endpoints.templates import router as templates_router
from app.routes.endpoints.folders import router as folders_router
from app.routes.endpoints.drafts import router as drafts_router
from app.routes.endpoints.notion import router as notion_router
from app.routes.endpoints.integrations import router as integrations_router

router = APIRouter()

# Public routes
router.include_router(auth_router)

# Protected routes
router.include_router(chat_router)
router.include_router(conversations_router)
router.include_router(users_router)
router.include_router(files_router)
router.include_router(share_router)
router.include_router(templates_router)
router.include_router(folders_router)
router.include_router(drafts_router)
router.include_router(notion_router)
router.include_router(integrations_router)