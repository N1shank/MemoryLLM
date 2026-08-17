"""Folder API endpoints."""

import logging
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from fastapi import APIRouter

from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.folder import Folder
from app.models.conversation import Conversation
from app.schemas.folder import FolderCreate, FolderUpdate, FolderResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("", response_model=list[FolderResponse])
async def list_folders(
    db: DBSession,
    current_user: CurrentUser,
) -> list[FolderResponse]:
    """List all folders for the current user."""
    result = await db.execute(
        select(
            Folder,
            func.count(Conversation.id).label("conversation_count"),
        )
        .outerjoin(Conversation, Conversation.folder_id == Folder.id)
        .where(Folder.user_id == current_user.id)
        .group_by(Folder.id)
        .order_by(Folder.created_at.desc())
    )
    
    folders = []
    for row in result.all():
        folder = row[0]
        folder_response = FolderResponse(
            id=folder.id,
            name=folder.name,
            color=folder.color,
            parent_id=folder.parent_id,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
            conversation_count=row[1] or 0,
        )
        folders.append(folder_response)
    
    return folders


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    data: FolderCreate,
    db: DBSession,
    current_user: CurrentUser,
) -> FolderResponse:
    """Create a new folder."""
    # Validate parent folder if provided
    if data.parent_id:
        parent_result = await db.execute(
            select(Folder).where(
                Folder.id == data.parent_id,
                Folder.user_id == current_user.id,
            )
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise NotFoundError("Parent folder not found")
    
    folder = Folder(
        user_id=current_user.id,
        name=data.name,
        color=data.color,
        parent_id=data.parent_id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        color=folder.color,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        conversation_count=0,
    )


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(
    folder_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> FolderResponse:
    """Get a specific folder."""
    result = await db.execute(
        select(
            Folder,
            func.count(Conversation.id).label("conversation_count"),
        )
        .outerjoin(Conversation, Conversation.folder_id == Folder.id)
        .where(
            Folder.id == folder_id,
            Folder.user_id == current_user.id,
        )
        .group_by(Folder.id)
    )
    
    row = result.first()
    if not row:
        raise NotFoundError("Folder not found")
    
    folder = row[0]
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        color=folder.color,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        conversation_count=row[1] or 0,
    )


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    data: FolderUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> FolderResponse:
    """Update a folder."""
    result = await db.execute(
        select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == current_user.id,
        )
    )
    folder = result.scalar_one_or_none()
    
    if not folder:
        raise NotFoundError("Folder not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Validate parent folder if provided
    if "parent_id" in update_data:
        if data.parent_id == folder.id:
            raise ForbiddenError("Folder cannot be its own parent")
        if data.parent_id:
            curr_parent_id = data.parent_id
            while curr_parent_id:
                if curr_parent_id == folder.id:
                    raise ForbiddenError("Circular folder dependency detected")
                
                parent_result = await db.execute(
                    select(Folder).where(
                        Folder.id == curr_parent_id,
                        Folder.user_id == current_user.id,
                    )
                )
                parent = parent_result.scalar_one_or_none()
                
                if not parent:
                    if curr_parent_id == data.parent_id:
                        raise NotFoundError("Parent folder not found")
                    break
                
                curr_parent_id = parent.parent_id
        folder.parent_id = data.parent_id
    
    if "name" in update_data:
        folder.name = data.name
    if "color" in update_data:
        folder.color = data.color
    
    await db.commit()
    await db.refresh(folder)
    
    # Get conversation count
    count_result = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.folder_id == folder.id)
    )
    conversation_count = count_result.scalar() or 0
    
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        color=folder.color,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        conversation_count=conversation_count,
    )


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> None:
    """Delete a folder."""
    result = await db.execute(
        select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == current_user.id,
        )
    )
    folder = result.scalar_one_or_none()
    
    if not folder:
        raise NotFoundError("Folder not found")
    
    # Remove folder_id from conversations in this folder
    await db.execute(
        Conversation.__table__.update()
        .where(Conversation.folder_id == folder_id)
        .values(folder_id=None)
    )
    
    await db.delete(folder)
    await db.commit()
