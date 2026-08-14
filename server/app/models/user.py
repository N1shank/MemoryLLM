"""User database model."""

from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    """User model for authentication."""
    
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    notion_api_key: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    notion_workspace_id: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    notion_workspace_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    notion_pages: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True, default=list)  # Selected Notion pages
    
    # Google Integration
    google_access_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    google_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    google_account_email: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    google_files: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True, default=list)  # Stored memory files
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    templates: Mapped[list["ConversationTemplate"]] = relationship(
        "ConversationTemplate",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    folders: Mapped[list["Folder"]] = relationship(
        "Folder",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    drafts: Mapped[list["Draft"]] = relationship(
        "Draft",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User {self.username}>"

