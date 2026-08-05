"""Notion proxy endpoints for UI integration."""

import httpx
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import CurrentUser
from app.core.security import decrypt_api_key
from app.core.exceptions import BadRequestError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notion", tags=["notion"])


@router.post("/search")
async def search_notion(
    current_user: CurrentUser,
) -> dict:
    """Search for pages and databases in the user's Notion workspace."""
    if not current_user.notion_api_key:
        raise BadRequestError("Notion API key not configured")
        
    api_key = decrypt_api_key(current_user.notion_api_key)
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.notion.com/v1/search",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                json={
                    "sort": {
                        "direction": "descending",
                        "timestamp": "last_edited_time"
                    }
                }
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise BadRequestError(f"Failed to fetch from Notion: {response.text}")
                
    except Exception as e:
        logger.error(f"Error fetching Notion pages: {e}", exc_info=True)
        raise BadRequestError(f"Error connecting to Notion API: {str(e)}")

