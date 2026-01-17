"""Chat schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """Schema for a chat message."""
    role: str  # "user" or "assistant"
    content: str


class MessageResponse(BaseModel):
    """Schema for a message in responses."""
    id: int
    role: str
    content: str
    memory_context: str | None = None
    feedback: str | None = None  # 'thumbs_up' or 'thumbs_down'
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    """Schema for creating a conversation."""
    title: str = Field(default="New Chat", max_length=255)


class ConversationUpdate(BaseModel):
    """Schema for updating a conversation."""
    title: str | None = Field(None, min_length=1, max_length=255)
    is_pinned: bool | None = None
    is_archived: bool | None = None


class ConversationResponse(BaseModel):
    """Schema for conversation response."""
    id: int
    title: str
    is_pinned: bool = False
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    class Config:
        from_attributes = True


class ConversationWithMessages(BaseModel):
    """Schema for conversation with all messages."""
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse] = []

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    """Schema for sending a chat message."""
    message: str = Field(..., min_length=1)
    conversation_id: int | None = None  # If None, creates new conversation


class ChatResponse(BaseModel):
    """Schema for chat response."""
    message: str
    message_id: int
    conversation_id: int
    memory_context: str | None = None


class MessageFeedbackUpdate(BaseModel):
    """Schema for updating message feedback."""
    feedback: str | None = Field(None, pattern="^(thumbs_up|thumbs_down)$")


class RegenerateRequest(BaseModel):
    """Schema for regenerating the last AI response."""
    conversation_id: int
