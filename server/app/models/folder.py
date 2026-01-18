"""Folder model for organizing conversations."""

from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Folder(Base):
    """Folder model to organize conversations."""
    
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # For UI color coding
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id"), nullable=True)  # For nested folders
    
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
    user: Mapped["User"] = relationship("User", back_populates="folders")
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation",
        back_populates="folder",
    )
    parent: Mapped["Folder | None"] = relationship(
        "Folder",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list["Folder"]] = relationship(
        "Folder",
        back_populates="parent",
    )

    def __repr__(self) -> str:
        return f"<Folder {self.id}: {self.name}>"
