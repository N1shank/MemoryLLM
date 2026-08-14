"""User schemas."""

from pydantic import BaseModel, EmailStr, Field


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    name: str
    email: str
    username: str
    notion_api_key_configured: bool = False
    notion_workspace_name: str | None = None
    notion_pages: list[dict] = []
    google_api_key_configured: bool = False
    google_account_email: str | None = None
    google_files: list[dict] = []

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Schema for updating user profile."""
    name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = None
    username: str | None = Field(None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")


class PasswordChange(BaseModel):
    """Schema for changing password."""
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


class NotionApiKeyUpdate(BaseModel):
    """Schema for updating Notion API key."""
    api_key: str | None = Field(None, description="Notion API key. Set to empty string to remove.")


class NotionPagesUpdate(BaseModel):
    """Schema for updating selected Notion pages."""
    pages: list[dict] = Field(default_factory=list, description="List of selected Notion pages with id, title, etc.")

