"""Draft model for auto-saving message drafts."""

from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Draft(Base):
    """Draft model to store auto-saved message drafts."""
    
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    conversation_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversations.id"),
        nullable=True,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
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
    user: Mapped["User"] = relationship("User", back_populates="drafts")
    conversation: Mapped["Conversation | None"] = relationship(
        "Conversation",
        back_populates="draft",
    )

    def __repr__(self) -> str:
        return f"<Draft {self.id}>"
