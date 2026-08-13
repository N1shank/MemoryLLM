"""Integration OAuth endpoints."""

import base64
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.core.config import settings
from app.core.deps import get_current_user, get_db, CurrentUser
from app.core.security import encrypt_api_key
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/integrations", tags=["integrations"])
logger = logging.getLogger(__name__)

@router.get("/notion/authorize")
async def notion_authorize(
    current_user: CurrentUser,
):
    """
    Get the Notion OAuth authorization URL.
    The client will redirect the user to this URL.
    """
    if not settings.NOTION_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Notion integration not configured.")
        
    url = (
        f"https://api.notion.com/v1/oauth/authorize?"
        f"client_id={settings.NOTION_CLIENT_ID}&"
        f"response_type=code&"
        f"owner=user&"
        f"redirect_uri={settings.NOTION_REDIRECT_URI}"
    )
    return {"url": url}


@router.post("/notion/callback")
async def notion_callback(
    code: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle the Notion OAuth callback, exchange the code for an access token.
    """
    if not settings.NOTION_CLIENT_ID or not settings.NOTION_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Notion integration not configured.")
        
    auth_string = f"{settings.NOTION_CLIENT_ID}:{settings.NOTION_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_string.encode()).decode()
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.notion.com/v1/oauth/token",
                headers={
                    "Authorization": f"Basic {b64_auth}",
                    "Content-Type": "application/json",
                },
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.NOTION_REDIRECT_URI,
                },
                timeout=15.0
            )
            
            if response.status_code != 200:
                logger.error(f"Notion OAuth error: {response.text}")
                raise HTTPException(status_code=400, detail="Failed to authenticate with Notion")
                
            data = response.json()
            access_token = data.get("access_token")
            workspace_id = data.get("workspace_id")
            workspace_name = data.get("workspace_name")
            
            # Encrypt and save token
            current_user.notion_api_key = encrypt_api_key(access_token)
            current_user.notion_workspace_id = workspace_id
            current_user.notion_workspace_name = workspace_name
            
            db.add(current_user)
            await db.commit()
            await db.refresh(current_user)
            
            # Setup structured memory layer asynchronously
            import asyncio
            from app.services.memory_layer import initialize_memory_layer
            asyncio.create_task(initialize_memory_layer(access_token, current_user.id))
            
            return {"status": "success", "workspace_name": workspace_name}
    except Exception as e:
        logger.error(f"Error in Notion callback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
