import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timedelta

from app.models.user import User
from app.models.conversation import Conversation, Message
from app.core.security import decrypt_api_key
from app.services.gemini_agent import get_gemini_client
import httpx

logger = logging.getLogger(__name__)

async def run_auto_organizer(db: AsyncSession, user: User):
    """
    Analyzes recent conversations for a user, extracts facts, 
    and automatically pushes them to their Notion memory.
    """
    if not user.notion_api_key or not user.notion_pages:
        logger.info(f"User {user.id} hasn't configured Notion, skipping auto-org.")
        return {"status": "skipped", "reason": "Notion not configured"}

    # 1. Fetch conversations from the last 24 hours
    since_time = datetime.utcnow() - timedelta(hours=24)
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(desc(Conversation.updated_at))
    )
    conversations = result.scalars().all()
    
    chat_logs = ""
    for conv in conversations:
        if conv.updated_at < since_time:
            continue
        msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at)
        )
        messages = msg_result.scalars().all()
        if not messages:
            continue
            
        chat_logs += f"\n--- Conversation: {conv.title} ---\n"
        for msg in messages:
            chat_logs += f"{msg.role.upper()}: {msg.content}\n"

    if not chat_logs.strip():
        logger.info(f"No recent conversations for user {user.id} to organize.")
        return {"status": "skipped", "reason": "No recent conversations"}

    # 2. Use Gemini to extract facts
    logger.info(f"Extracting facts for user {user.id} from {len(chat_logs)} bytes of logs...")
    
    prompt = f"""
    You are an AI Memory Organizer. 
    Analyze the following recent chat logs between a USER and an ASSISTANT.
    Extract any important new facts about the user, their preferences, their projects, or life events.
    Do NOT extract generic assistant responses, code snippets, or trivial chit-chat.
    Return ONLY a raw JSON array of strings, where each string is a distinct, concise fact.
    Example: ["The user prefers React over Vue", "The user's dog is named Max", "The user is working on a MemoryLLM project"]
    
    Chat Logs:
    {chat_logs}
    """
    
    try:
        client = get_gemini_client()
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        # Parse the JSON array
        response_text = response.text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:-3]
        elif response_text.startswith("```"):
            response_text = response_text[3:-3]
            
        import json
        facts = json.loads(response_text)
        
        if not facts or not isinstance(facts, list):
            return {"status": "skipped", "reason": "No facts extracted"}
            
    except Exception as e:
        logger.error(f"Failed to extract facts with Gemini: {e}")
        return {"status": "error", "error": str(e)}

    # 3. Push extracted facts to Notion
    api_key = decrypt_api_key(user.notion_api_key)
    parent_id = user.notion_pages[0]["id"]
    added_facts = []
    
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        for fact in facts:
            if not isinstance(fact, str):
                continue
            try:
                resp = await http_client.post(
                    "https://api.notion.com/v1/pages",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Notion-Version": "2022-06-28",
                        "Content-Type": "application/json",
                    },
                    json={
                        "parent": {"type": "page_id", "page_id": parent_id},
                        "properties": {
                            "title": {
                                "title": [{"text": {"content": fact}}]
                            }
                        }
                    }
                )
                if resp.status_code == 200:
                    added_facts.append(fact)
            except Exception as e:
                logger.error(f"Failed to push fact to Notion: {e}")
                
    return {
        "status": "success", 
        "facts_extracted": len(facts),
        "facts_added": len(added_facts),
        "facts": added_facts
    }
