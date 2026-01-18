"""Draft schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class DraftResponse(BaseModel):
    """Schema for draft response."""
    id: int
    conversation_id: int | None = None
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DraftUpdate(BaseModel):
    """Schema for updating a draft."""
    content: str = Field(..., min_length=0)
