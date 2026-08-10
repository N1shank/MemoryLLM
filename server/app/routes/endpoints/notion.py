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

class CreatePageRequest(BaseModel):
    title: str

@router.post("/pages")
async def create_notion_page(
    request: CreatePageRequest,
    current_user: CurrentUser,
) -> dict:
    """Create a new Notion page as a child of the first configured Notion page."""
    if not current_user.notion_api_key:
        raise BadRequestError("Notion API key not configured")
    if not current_user.notion_pages or len(current_user.notion_pages) == 0:
        raise BadRequestError("No Notion pages selected to use as a parent. Please share a page in Notion and add it in Settings.")
        
    api_key = decrypt_api_key(current_user.notion_api_key)
    parent_id = current_user.notion_pages[0]["id"]
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.notion.com/v1/pages",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                json={
                    "parent": {"type": "page_id", "page_id": parent_id},
                    "properties": {
                        "title": {
                            "title": [{"text": {"content": request.title}}]
                        }
                    }
                }
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise BadRequestError(f"Failed to create page: {response.text}")
                
    except Exception as e:
        logger.error(f"Error creating Notion page: {e}", exc_info=True)
        raise BadRequestError(f"Error connecting to Notion API: {str(e)}")

class UpdatePageRequest(BaseModel):
    title: str

@router.delete("/pages/{page_id}")
async def delete_notion_page(
    page_id: str,
    current_user: CurrentUser,
) -> dict:
    """Archive a Notion page (effectively deleting it)."""
    if not current_user.notion_api_key:
        raise BadRequestError("Notion API key not configured")
        
    api_key = decrypt_api_key(current_user.notion_api_key)
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.patch(
                f"https://api.notion.com/v1/pages/{page_id}",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                json={"archived": True}
            )
            
            if response.status_code == 200:
                return {"status": "success"}
            else:
                raise BadRequestError(f"Failed to delete page: {response.text}")
                
    except Exception as e:
        logger.error(f"Error deleting Notion page: {e}", exc_info=True)
        raise BadRequestError(f"Error connecting to Notion API: {str(e)}")

@router.patch("/pages/{page_id}")
async def update_notion_page(
    page_id: str,
    request: UpdatePageRequest,
    current_user: CurrentUser,
) -> dict:
    """Update a Notion page's title."""
    if not current_user.notion_api_key:
        raise BadRequestError("Notion API key not configured")
        
    api_key = decrypt_api_key(current_user.notion_api_key)
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # We assume it's a standard page with a 'title' property. 
            # If it's a database row, the property name might differ, but 'title' is standard for pages.
            response = await client.patch(
                f"https://api.notion.com/v1/pages/{page_id}",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                json={
                    "properties": {
                        "title": {
                            "title": [{"text": {"content": request.title}}]
                        }
                    }
                }
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise BadRequestError(f"Failed to update page: {response.text}")
                
    except Exception as e:
        logger.error(f"Error updating Notion page: {e}", exc_info=True)
        raise BadRequestError(f"Error connecting to Notion API: {str(e)}")


