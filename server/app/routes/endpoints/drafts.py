"""Draft API endpoints."""

import logging
from sqlalchemy import select

from fastapi import APIRouter

from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.draft import Draft
from app.models.conversation import Conversation
from app.schemas.draft import DraftResponse, DraftUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.get("", response_model=list[DraftResponse])
async def list_drafts(
    db: DBSession,
    current_user: CurrentUser,
) -> list[DraftResponse]:
    """List all drafts for the current user."""
    result = await db.execute(
        select(Draft).where(Draft.user_id == current_user.id).order_by(Draft.updated_at.desc())
    )
    drafts = result.scalars().all()
    return [DraftResponse.model_validate(draft) for draft in drafts]


@router.get("/conversation/{conversation_id}", response_model=DraftResponse | None)
async def get_draft_for_conversation(
    conversation_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> DraftResponse | None:
    """Get draft for a specific conversation."""
    # Verify conversation belongs to user
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    result = await db.execute(
        select(Draft).where(
            Draft.conversation_id == conversation_id,
            Draft.user_id == current_user.id,
        )
    )
    draft = result.scalar_one_or_none()
    
    if draft:
        return DraftResponse.model_validate(draft)
    return None


@router.post("/conversation/{conversation_id}", response_model=DraftResponse)
async def create_or_update_draft(
    conversation_id: int,
    data: DraftUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> DraftResponse:
    """Create or update draft for a conversation."""
    # Verify conversation belongs to user
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise NotFoundError("Conversation not found")
    
    # Check if draft exists
    result = await db.execute(
        select(Draft).where(
            Draft.conversation_id == conversation_id,
            Draft.user_id == current_user.id,
        )
    )
    draft = result.scalar_one_or_none()
    
    if draft:
        draft.content = data.content
    else:
        draft = Draft(
            user_id=current_user.id,
            conversation_id=conversation_id,
            content=data.content,
        )
        db.add(draft)
    
    await db.commit()
    await db.refresh(draft)
    
    return DraftResponse.model_validate(draft)


@router.post("", response_model=DraftResponse)
async def create_global_draft(
    data: DraftUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> DraftResponse:
    """Create a draft without a conversation (global draft)."""
    draft = Draft(
        user_id=current_user.id,
        conversation_id=None,
        content=data.content,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    
    # Cleanup old global drafts, keeping only the 5 most recent
    old_drafts_result = await db.execute(
        select(Draft)
        .where(Draft.user_id == current_user.id, Draft.conversation_id.is_(None))
        .order_by(Draft.updated_at.desc())
        .offset(5)
    )
    old_drafts = old_drafts_result.scalars().all()
    if old_drafts:
        for old_draft in old_drafts:
            await db.delete(old_draft)
        await db.commit()
    
    return DraftResponse.model_validate(draft)


@router.patch("/{draft_id}", response_model=DraftResponse)
async def update_draft(
    draft_id: int,
    data: DraftUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> DraftResponse:
    """Update a draft."""
    result = await db.execute(
        select(Draft).where(
            Draft.id == draft_id,
            Draft.user_id == current_user.id,
        )
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise NotFoundError("Draft not found")
    
    draft.content = data.content
    await db.commit()
    await db.refresh(draft)
    
    return DraftResponse.model_validate(draft)


@router.delete("/{draft_id}", status_code=204)
async def delete_draft(
    draft_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> None:
    """Delete a draft."""
    result = await db.execute(
        select(Draft).where(
            Draft.id == draft_id,
            Draft.user_id == current_user.id,
        )
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise NotFoundError("Draft not found")
    
    await db.delete(draft)
    await db.commit()
