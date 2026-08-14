"""Integration OAuth endpoints."""

import base64
import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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
    background_tasks: BackgroundTasks,
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
            from app.services.memory_layer import initialize_memory_layer
            background_tasks.add_task(initialize_memory_layer, access_token, current_user.id)
            
            return {"status": "success", "workspace_name": workspace_name}
    except Exception as e:
        logger.error(f"Error in Notion callback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/google/authorize")
async def google_authorize(
    current_user: CurrentUser,
):
    """
    Get the Google OAuth authorization URL.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google integration not configured.")
        
    scopes = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email"
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={settings.GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope={scopes}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return {"url": url}


@router.post("/google/callback")
async def google_callback(
    code: str,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle the Google OAuth callback.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google integration not configured.")
        
    try:
        async with httpx.AsyncClient() as client:
            # Exchange code for tokens
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                },
                timeout=15.0
            )
            
            if response.status_code != 200:
                logger.error(f"Google OAuth error: {response.text}")
                raise HTTPException(status_code=400, detail="Failed to authenticate with Google")
                
            data = response.json()
            access_token = data.get("access_token")
            refresh_token = data.get("refresh_token")
            
            # Get user email
            user_info_resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            email = "Connected Account"
            if user_info_resp.status_code == 200:
                email = user_info_resp.json().get("email", email)
            
            # Encrypt and save tokens
            current_user.google_access_token = encrypt_api_key(access_token)
            if refresh_token:
                current_user.google_refresh_token = encrypt_api_key(refresh_token)
            current_user.google_account_email = email
            
            db.add(current_user)
            await db.commit()
            await db.refresh(current_user)
            
            # Setup Google drive memory layer asynchronously
            from app.services.google_memory_layer import initialize_google_memory_layer
            background_tasks.add_task(
                initialize_google_memory_layer, 
                access_token, 
                refresh_token, 
                current_user.id
            )
            
            return {"status": "success", "account_email": email}
    except Exception as e:
        logger.error(f"Error in Google callback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/google")
async def google_disconnect(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """
    Disconnect Google Drive integration.
    """
    current_user.google_access_token = None
    current_user.google_refresh_token = None
    current_user.google_account_email = None
    current_user.google_files = []
    
    db.add(current_user)
    await db.commit()
    
    return {"status": "success", "message": "Google integration disconnected"}
