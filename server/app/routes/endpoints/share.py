"""Conversation sharing API endpoints."""

import secrets
from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.conversation import Conversation, Message

router = APIRouter(prefix="/share", tags=["share"])


class SharedConversationResponse:
    """Response for shared conversation."""
    pass


@router.post("/conversations/{conversation_id}")
async def toggle_sharing(
    conversation_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """
    Toggle sharing for a conversation.
    
    If not shared, generates a share token and enables sharing.
    If already shared, disables sharing and removes the token.
    """
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")
    
    if conversation.is_shared:
        # Disable sharing
        conversation.is_shared = False
        conversation.share_token = None
        await db.commit()
        
        return {
            "is_shared": False,
            "share_token": None,
            "share_url": None,
        }
    else:
        # Enable sharing with new token
        share_token = secrets.token_urlsafe(32)
        conversation.is_shared = True
        conversation.share_token = share_token
        await db.commit()
        
        return {
            "is_shared": True,
            "share_token": share_token,
            "share_url": f"/shared/{share_token}",
        }


@router.get("/conversations/{conversation_id}/status")
async def get_share_status(
    conversation_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Get the sharing status of a conversation."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")
    
    return {
        "is_shared": conversation.is_shared,
        "share_token": conversation.share_token if conversation.is_shared else None,
        "share_url": f"/shared/{conversation.share_token}" if conversation.is_shared else None,
    }


@router.get("/public/{share_token}")
async def get_shared_conversation(
    share_token: str,
    db: DBSession,
) -> dict:
    """
    Get a shared conversation by its token.
    
    This is a PUBLIC endpoint - no authentication required.
    """
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            Conversation.share_token == share_token,
            Conversation.is_shared.is_(True),
        )
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Shared conversation not found or sharing has been disabled")
    
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat(),
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "memory_context": msg.memory_context,
                "created_at": msg.created_at.isoformat(),
            }
            for msg in conversation.messages
        ],
    }

