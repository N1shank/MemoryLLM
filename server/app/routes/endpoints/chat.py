"""Chat API endpoints with streaming support."""

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError, ServiceUnavailableError
from app.models.conversation import Conversation, Message
from fastapi import Query
from app.schemas.chat import (
    PaginatedResponse,
    ChatRequest, 
    ChatResponse, 
    MessageFeedbackUpdate, 
    RegenerateRequest,
    MessageResponse,
    MessageEdit,
)
from app.services.gemini_agent import gemini_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: DBSession,
    current_user: CurrentUser,
) -> ChatResponse:
    """
    Send a message to the Gemini agent with Notion memory.
    
    If conversation_id is provided, adds to existing conversation.
    Otherwise, creates a new conversation.
    """
    conversation: Conversation | None = None
    
    # Get or create conversation
    if request.conversation_id:
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == request.conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise NotFoundError("Conversation not found")
        
        if conversation.user_id != current_user.id:
            raise ForbiddenError("You don't have access to this conversation")
    else:
        # Create new conversation
        title = request.message[:50] + ("..." if len(request.message) > 50 else "")
        conversation = Conversation(
            user_id=current_user.id,
            title=title,
        )
        db.add(conversation)
        await db.flush()  # Get the ID without committing
    
    # Build conversation history for the agent
    history = []
    if request.conversation_id and conversation.messages:
        for msg in conversation.messages:
            history.append({"role": msg.role, "content": msg.content})

    # Save user message
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )
    db.add(user_message)
    await db.flush()
    
    # Get AI response
    try:
        response_text, memory_context = await gemini_agent.chat(
            message=request.message,
            conversation_history=history,
            notion_api_key=current_user.notion_api_key,
        )
    except Exception as e:
        logger.error(f"Gemini agent error: {e}", exc_info=True)
        raise ServiceUnavailableError("AI service is temporarily unavailable. Please try again.")
    
    # Save assistant message
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=response_text,
        memory_context=memory_context,
    )
    db.add(assistant_message)
    
    await db.commit()
    await db.refresh(assistant_message)
    
    return ChatResponse(
        message=response_text,
        message_id=assistant_message.id,
        conversation_id=conversation.id,
        memory_context=memory_context,
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: DBSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    """
    Send a message and stream the response using Server-Sent Events.
    
    This endpoint streams tokens as they're generated for a more
    responsive user experience.
    """
    conversation: Conversation | None = None
    
    # Get or create conversation
    if request.conversation_id:
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == request.conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise NotFoundError("Conversation not found")
        
        if conversation.user_id != current_user.id:
            raise ForbiddenError("You don't have access to this conversation")
    else:
        # Create new conversation
        title = request.message[:50] + ("..." if len(request.message) > 50 else "")
        conversation = Conversation(
            user_id=current_user.id,
            title=title,
        )
        db.add(conversation)
        await db.flush()
    
    # Build conversation history
    history = []
    if request.conversation_id and conversation.messages:
        for msg in conversation.messages:
            history.append({"role": msg.role, "content": msg.content})

    # Save user message
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )
    db.add(user_message)
    await db.commit()
    await db.refresh(conversation)
    
    conversation_id = conversation.id
    
    # Capture user's notion_api_key before the response starts, because
    # the DB session will be closed by the time the generator runs
    user_notion_api_key = current_user.notion_api_key
    
    async def generate_stream() -> AsyncGenerator[str, None]:
        """Generate SSE stream of response tokens."""
        full_response = ""
        memory_context = None
        
        try:
            async for chunk, context in gemini_agent.chat_stream(
                message=request.message,
                conversation_history=history,
                notion_api_key=user_notion_api_key,
            ):
                full_response += chunk
                if context:
                    memory_context = context
                
                # Send chunk as SSE
                data = json.dumps({"type": "chunk", "content": chunk})
                yield f"data: {data}\n\n"
            
            # Save the complete response to database using a new session
            async with async_session() as new_db:
                async with new_db.begin():
                    assistant_message = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response,
                        memory_context=memory_context,
                    )
                    new_db.add(assistant_message)
                    await new_db.flush()
                    await new_db.refresh(assistant_message)
                    
                    message_id = assistant_message.id
                
                # Send completion event with message ID
                done_data = json.dumps({
                    "type": "done",
                    "message_id": message_id,
                    "conversation_id": conversation_id,
                    "memory_context": memory_context,
                })
                yield f"data: {done_data}\n\n"
        
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            error_data = json.dumps({"type": "error", "message": "An error occurred while generating the response. Please try again."})
            yield f"data: {error_data}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.patch("/messages/{message_id}/feedback", response_model=MessageResponse)
async def update_message_feedback(
    message_id: int,
    feedback_data: MessageFeedbackUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> MessageResponse:
    """
    Update feedback for a message (thumbs up/down).
    """
    result = await db.execute(
        select(Message)
        .options(selectinload(Message.conversation))
        .where(Message.id == message_id)
    )
    message = result.scalar_one_or_none()
    
    if not message:
        raise NotFoundError("Message not found")
    
    if message.conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this message")
    
    message.feedback = feedback_data.feedback
    await db.commit()
    await db.refresh(message)
    
    return MessageResponse.model_validate(message)


@router.post("/regenerate", response_model=ChatResponse)
async def regenerate_response(
    request: RegenerateRequest,
    db: DBSession,
    current_user: CurrentUser,
) -> ChatResponse:
    """
    Regenerate the last AI response in a conversation.
    """
    # Get conversation with messages
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == request.conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")
    
    if not conversation.messages:
        raise NotFoundError("No messages in conversation")
    
    # Find the last user message and its corresponding assistant message
    messages = sorted(conversation.messages, key=lambda m: m.created_at)
    last_user_msg = None
    last_assistant_msg = None
    
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].role == "assistant" and not last_assistant_msg:
            last_assistant_msg = messages[i]
        elif messages[i].role == "user" and not last_user_msg:
            last_user_msg = messages[i]
            break
    
    if not last_user_msg or not last_assistant_msg:
        raise NotFoundError("Cannot regenerate: need both user and assistant messages")
    
    # Delete the last assistant message
    await db.delete(last_assistant_msg)
    await db.flush()
    
    # Build conversation history up to (but not including) the last user message
    history = []
    for msg in messages:
        if msg.id == last_user_msg.id:
            break
        history.append({"role": msg.role, "content": msg.content})
    
    # Regenerate AI response
    try:
        response_text, memory_context = await gemini_agent.chat(
            message=last_user_msg.content,
            conversation_history=history,
            notion_api_key=current_user.notion_api_key,
        )
    except Exception as e:
        logger.error(f"Gemini agent error during regenerate: {e}")
        raise ServiceUnavailableError(f"AI service error: {str(e)}")
    
    # Save new assistant message
    new_assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=response_text,
        memory_context=memory_context,
    )
    db.add(new_assistant_message)
    
    await db.commit()
    await db.refresh(new_assistant_message)
    
    return ChatResponse(
        message=response_text,
        message_id=new_assistant_message.id,
        conversation_id=conversation.id,
        memory_context=memory_context,
    )


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: int,
    edit_data: MessageEdit,
    db: DBSession,
    current_user: CurrentUser,
) -> MessageResponse:
    """
    Edit a message (both user and assistant messages can be edited).
    """
    result = await db.execute(
        select(Message)
        .options(selectinload(Message.conversation))
        .where(Message.id == message_id)
    )
    message = result.scalar_one_or_none()
    
    if not message:
        raise NotFoundError("Message not found")
    
    if message.conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this message")
    
    message.content = edit_data.content
    await db.commit()
    await db.refresh(message)
    
    return MessageResponse.model_validate(message)



@router.get("/conversations/{conversation_id}/messages", response_model=PaginatedResponse[MessageResponse])
async def get_messages(
    conversation_id: int,
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> PaginatedResponse[MessageResponse]:
    """
    Get paginated messages for a conversation.
    """
    # Verify conversation ownership
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        raise NotFoundError("Conversation not found")
        
    if conversation.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this conversation")

    # Get total count
    count_query = select(func.count(Message.id)).where(Message.conversation_id == conversation_id)
    total_count = (await db.execute(count_query)).scalar() or 0

    # Get messages (order by created_at descending for infinite scroll, or ascending? 
    # Usually we want newest messages, but client appends. Let's return descending to easily get older messages,
    # wait, infinite scroll loads older messages, so order by id desc, then client reverses.
    # The client expects messages in chronological order (oldest first). If we want to paginate,
    # it's usually ordered by created_at DESC, limit, offset, and then the client reverses it.
    # Let's order by created_at DESC.
    messages_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    messages = []
    for msg in messages_result.scalars():
        messages.append(MessageResponse.model_validate(msg))
        
    return PaginatedResponse(items=messages, total_count=total_count)

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
