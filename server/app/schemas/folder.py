"""Folder schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    """Schema for creating a folder."""
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)
    parent_id: int | None = None


class FolderUpdate(BaseModel):
    """Schema for updating a folder."""
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)
    parent_id: int | None = None


class FolderResponse(BaseModel):
    """Schema for folder response."""
    id: int
    name: str
    color: str | None = None
    parent_id: int | None = None
    created_at: datetime
    updated_at: datetime
    conversation_count: int = 0

    class Config:
        from_attributes = True
