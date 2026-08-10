"""AGY Agent with Notion memory integration."""

import logging
from typing import AsyncGenerator
import httpx

from google.antigravity import Agent, LocalAgentConfig

from app.core.config import settings
from app.core.security import decrypt_api_key
from app.models.user import User

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an intelligent AI assistant with access to a Notion workspace as your memory.

You can use the provided tools to:
- Search for information you've stored before
- Create new pages to remember important information

When the user shares important information (preferences, facts, context about themselves or their work), 
proactively save it to Notion using the `create_notion_page` tool so you can recall it later.

When answering questions, first check if you have relevant information stored in Notion.
Be helpful, concise, and make good use of your memory capabilities."""


class AGYAgent:
    """AGY agent utilizing the google-antigravity SDK."""

    def __init__(self):
        pass

    async def chat_stream(
        self,
        message: str,
        conversation_history: list[dict],
        user: User,
    ) -> AsyncGenerator[tuple[str, str | None], None]:
        """
        Process a chat message with streaming response using AGY SDK.
        
        Yields:
            tuple of (chunk_text, memory_context) for each token
        """
        decrypted_key = None
        if user.notion_api_key:
            decrypted_key = decrypt_api_key(user.notion_api_key)

        parent_id = None
        if user.notion_pages and len(user.notion_pages) > 0:
            parent_id = user.notion_pages[0].get("id")

        tools = []
        
        if decrypted_key:
            async def search_notion(query: str) -> dict:
                """Search for pages and databases in the user's Notion workspace."""
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/search",
                            headers={
                                "Authorization": f"Bearer {decrypted_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={
                                "query": query,
                                "sort": {
                                    "direction": "descending",
                                    "timestamp": "last_edited_time"
                                }
                            }
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}

            async def create_notion_page(title: str) -> dict:
                """Create a new Notion page to store memory/facts about the user."""
                if not parent_id:
                    return {"error": "No Notion parent page configured."}
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/pages",
                            headers={
                                "Authorization": f"Bearer {decrypted_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={
                                "parent": {"type": "page_id", "page_id": parent_id},
                                "properties": {
                                    "title": {
                                        "title": [{"text": {"content": title}}]
                                    }
                                }
                            }
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}

            tools = [search_notion, create_notion_page]

        # Prepare config
        config = LocalAgentConfig(
            system_instructions=SYSTEM_PROMPT,
            tools=tools,
        )

        try:
            async with Agent(config) as agent:
                # Provide conversation history
                # AGY supports sending a list of dicts directly or we can format it
                formatted_history = ""
                for msg in conversation_history:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    formatted_history += f"{role.upper()}: {content}\n"
                
                full_prompt = f"Previous conversation history:\n{formatted_history}\n\nUSER: {message}"
                
                response = await agent.chat(full_prompt)
                
                # Stream the response
                async for token in response:
                    yield token, None
                    
        except Exception as e:
            logger.error(f"Error in AGY agent stream: {e}", exc_info=True)
            yield f"Error generating response: {str(e)}", None


# Singleton instance
gemini_agent = AGYAgent()
