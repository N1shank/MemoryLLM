"""Chat API endpoints."""

from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.gemini_agent import gemini_agent

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a message to the Gemini agent with Notion memory.
    """
    try:
        response_text, memory_context = await gemini_agent.chat(
            message=request.message,
            conversation_history=request.conversation_history,
        )
        
        return ChatResponse(
            message=response_text,
            memory_context=memory_context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

