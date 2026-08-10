"""Conversation management API endpoints."""

from fastapi import APIRouter

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.conversation import Conversation, Message
from app.schemas.chat import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationWithMessages,
    PaginatedResponse,
)
from fastapi import Query

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=PaginatedResponse[ConversationResponse])
async def list_conversations(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> PaginatedResponse[ConversationResponse]:
    """
    List all conversations for the current user.
    
    Returns conversations sorted by last updated (most recent first).
    """
    # Get total count
    count_query = select(func.count(Conversation.id)).where(
        Conversation.user_id == current_user.id,
        Conversation.is_archived.is_(False)
    )
    total_count = (await db.execute(count_query)).scalar() or 0

    # Get conversations with message count
    # Sort by pinned first, then by updated_at
    result = await db.execute(
        select(
            Conversation,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.is_archived.is_(False)
        )
        .group_by(Conversation.id)
        .order_by(Conversation.is_pinned.desc(), Conversation.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    conversations = []
    for row in result:
        conv = row[0]
        conversations.append(ConversationResponse(
            id=conv.id,
            title=conv.title,
            is_pinned=conv.is_pinned,
            is_archived=conv.is_archived,
            folder_id=conv.folder_id,
            tags=conv.tags or [],
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=row[1],
        ))
    
    return PaginatedResponse(items=conversations, total_count=total_count)


@router.get("/search", response_model=list[ConversationResponse])
async def search_conversations(
    query: str,
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
) -> list[ConversationResponse]:
    """Search conversations by title or message content."""
    search_term = f"%{query}%"

    # First, find IDs of conversations that match
    matching_ids_stmt = (
        select(Conversation.id)
        .outerjoin(Message, Conversation.id == Message.conversation_id)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.is_archived.is_(False),
            (Conversation.title.ilike(search_term)) | (Message.content.ilike(search_term))
        )
    )
    
    # Then fetch those conversations with their message counts
    stmt = (
        select(
            Conversation,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Conversation.id == Message.conversation_id)
        .where(
            Conversation.id.in_(matching_ids_stmt)
        )
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    
    conversations = []
    for row in result:
        conv = row[0]
        conversations.append(ConversationResponse(
            id=conv.id,
            title=conv.title,
            is_pinned=conv.is_pinned,
            is_archived=conv.is_archived,
            folder_id=conv.folder_id,
            tags=conv.tags or [],
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=row[1],
        ))
        
    return conversations


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    data: ConversationCreate,
    db: DBSession,
    current_user: CurrentUser,
) -> ConversationResponse:
    """Create a new conversation."""
    conversation = Conversation(
        user_id=current_user.id,
        title=data.title,
    )
    
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    
    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        is_pinned=conversation.is_pinned,
        is_archived=conversation.is_archived,
        folder_id=conversation.folder_id,
        tags=conversation.tags or [],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=0,
    )


@router.get("/{conversation_id}", response_model=ConversationWithMessages)
async def get_conversation(
    conversation_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> ConversationWithMessages:
    """
    Get a conversation with all its messages.
    """
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")
    
    return ConversationWithMessages.model_validate(conversation)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: int,
    data: ConversationUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> ConversationResponse:
    """
    Update a conversation (rename).
    """
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")
    
    update_data = data.model_dump(exclude_unset=True)
    if "title" in update_data:
        conversation.title = data.title
    if "is_pinned" in update_data:
        conversation.is_pinned = data.is_pinned
    if "is_archived" in update_data:
        conversation.is_archived = data.is_archived
    if "folder_id" in update_data:
        # Validate folder belongs to user if provided
        if data.folder_id:
            from app.models.folder import Folder
            folder_result = await db.execute(
                select(Folder).where(
                    Folder.id == data.folder_id,
                    Folder.user_id == current_user.id,
                )
            )
            folder = folder_result.scalar_one_or_none()
            if not folder:
                raise NotFoundError("Folder not found")
        conversation.folder_id = data.folder_id
    if "tags" in update_data:
        conversation.tags = data.tags
    
    await db.commit()
    await db.refresh(conversation)
    
    # Get message count
    count_result = await db.execute(
        select(func.count(Message.id)).where(Message.conversation_id == conversation_id)
    )
    message_count = count_result.scalar() or 0
    
    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        is_pinned=conversation.is_pinned,
        is_archived=conversation.is_archived,
        folder_id=conversation.folder_id,
        tags=conversation.tags or [],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=message_count,
    )


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> None:
    """
    Delete a conversation and all its messages.
    """
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")
    
    await db.delete(conversation)
    await db.commit()

