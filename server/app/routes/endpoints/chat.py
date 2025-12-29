"""Chat API endpoints with streaming support."""

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError, ServiceUnavailableError
from app.models.conversation import Conversation, Message
from app.schemas.chat import ChatRequest, ChatResponse
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
    
    # Save user message
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )
    db.add(user_message)
    await db.flush()
    
    # Build conversation history for the agent
    history = []
    if request.conversation_id and conversation.messages:
        for msg in conversation.messages:
            history.append({"role": msg.role, "content": msg.content})
    
    # Get AI response
    try:
        response_text, memory_context = await gemini_agent.chat(
            message=request.message,
            conversation_history=history,
        )
    except Exception as e:
        logger.error(f"Gemini agent error: {e}")
        raise ServiceUnavailableError(f"AI service error: {str(e)}")
    
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
    
    # Build conversation history
    history = []
    if request.conversation_id and conversation.messages:
        for msg in conversation.messages[:-1]:  # Exclude the message we just added
            history.append({"role": msg.role, "content": msg.content})
    
    async def generate_stream() -> AsyncGenerator[str, None]:
        """Generate SSE stream of response tokens."""
        full_response = ""
        memory_context = None
        
        try:
            async for chunk, context in gemini_agent.chat_stream(
                message=request.message,
                conversation_history=history,
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
            logger.error(f"Streaming error: {e}")
            error_data = json.dumps({"type": "error", "message": str(e)})
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


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
