"""Template schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class TemplateCreate(BaseModel):
    """Schema for creating a template."""
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)


class TemplateUpdate(BaseModel):
    """Schema for updating a template."""
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = Field(None, min_length=1)


class TemplateResponse(BaseModel):
    """Schema for template response."""
    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

