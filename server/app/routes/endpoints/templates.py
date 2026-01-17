"""Template management API endpoints."""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DBSession, CurrentUser
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.template import ConversationTemplate
from app.schemas.template import (
    TemplateCreate,
    TemplateUpdate,
    TemplateResponse,
)

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateResponse])
async def list_templates(
    db: DBSession,
    current_user: CurrentUser,
) -> list[TemplateResponse]:
    """
    List all templates for the current user.
    """
    result = await db.execute(
        select(ConversationTemplate)
        .where(ConversationTemplate.user_id == current_user.id)
        .order_by(ConversationTemplate.updated_at.desc())
    )
    templates = result.scalars().all()
    return [TemplateResponse.model_validate(t) for t in templates]


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(
    data: TemplateCreate,
    db: DBSession,
    current_user: CurrentUser,
) -> TemplateResponse:
    """Create a new template."""
    template = ConversationTemplate(
        user_id=current_user.id,
        title=data.title,
        content=data.content,
    )
    
    db.add(template)
    await db.commit()
    await db.refresh(template)
    
    return TemplateResponse.model_validate(template)


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> TemplateResponse:
    """
    Get a template by ID.
    """
    result = await db.execute(
        select(ConversationTemplate).where(ConversationTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise NotFoundError("Template not found")
    
    if template.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this template")
    
    return TemplateResponse.model_validate(template)


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> TemplateResponse:
    """
    Update a template.
    """
    result = await db.execute(
        select(ConversationTemplate).where(ConversationTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise NotFoundError("Template not found")
    
    if template.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this template")
    
    if data.title is not None:
        template.title = data.title
    if data.content is not None:
        template.content = data.content
    
    await db.commit()
    await db.refresh(template)
    
    return TemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: DBSession,
    current_user: CurrentUser,
) -> None:
    """
    Delete a template.
    """
    result = await db.execute(
        select(ConversationTemplate).where(ConversationTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise NotFoundError("Template not found")
    
    if template.user_id != current_user.id:
        raise ForbiddenError("You don't have access to this template")
    
    await db.delete(template)
    await db.commit()

