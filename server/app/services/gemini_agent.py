"""AGY Agent with Notion memory integration."""

import logging
from typing import AsyncGenerator
import httpx
from pathlib import Path
import mimetypes

from google.antigravity import Agent, LocalAgentConfig
from google.antigravity.types import Image

from app.core.config import settings
from app.core.security import decrypt_api_key
from app.models.user import User

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an intelligent AI assistant with access to a structured Notion workspace as your memory layer.

You have access to specialized databases:
- Facts & Notes: For storing facts, preferences, and long-term knowledge about the user.
- Skills: For instructions on how you should behave or perform tasks.
- Projects & Tasks: For tracking actionable items.

When the user shares important information, proactively save it to the appropriate database.
Always query your memory before answering personalized questions.
Be helpful, concise, and leverage your structured memory capabilities."""


class AGYAgent:
    """AGY agent utilizing the google-antigravity SDK."""

    def __init__(self):
        pass

    async def chat_stream(
        self,
        message: str,
        conversation_history: list[dict],
        user: User,
        files: list[str] | None = None,
    ) -> AsyncGenerator[tuple[str, str | None], None]:
        """
        Process a chat message with streaming response using AGY SDK.
        
        Yields:
            tuple of (chunk_text, memory_context) for each token
        """
        decrypted_key = None
        if user.notion_api_key:
            decrypted_key = decrypt_api_key(user.notion_api_key)

        dashboard_id = None
        facts_db_id = None
        projects_db_id = None
        skills_db_id = None
        
        if user.notion_pages:
            for page in user.notion_pages:
                role = page.get("role")
                if role == "dashboard":
                    dashboard_id = page.get("id")
                elif role == "facts":
                    facts_db_id = page.get("id")
                elif role == "projects":
                    projects_db_id = page.get("id")
                elif role == "skills":
                    skills_db_id = page.get("id")
                elif not dashboard_id:
                    # Fallback to first page if no roles defined
                    dashboard_id = page.get("id")

        tools = []
        
        if decrypted_key:
            async def search_workspace(query: str) -> dict:
                """Search across the entire Notion workspace for any information."""
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/search",
                            headers={
                                "Authorization": f"Bearer {decrypted_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={"query": query}
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}

            async def save_fact(fact_title: str, category: str = "General") -> dict:
                """Save a fact or note about the user to the Facts & Notes database."""
                if not facts_db_id:
                    # Fallback to standard page creation if DB not set up
                    if not dashboard_id:
                        return {"error": "No Notion integration configured."}
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            res = await client.post(
                                "https://api.notion.com/v1/pages",
                                headers={
                                    "Authorization": f"Bearer {decrypted_key}",
                                    "Notion-Version": "2022-06-28",
                                    "Content-Type": "application/json",
                                },
                                json={
                                    "parent": {"type": "page_id", "page_id": dashboard_id},
                                    "properties": {"title": {"title": [{"text": {"content": f"[{category}] {fact_title}"}}]}}
                                }
                            )
                            return res.json()
                    except Exception as e:
                        return {"error": str(e)}
                        
                try:
                    import datetime
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/pages",
                            headers={
                                "Authorization": f"Bearer {decrypted_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={
                                "parent": {"type": "database_id", "database_id": facts_db_id},
                                "properties": {
                                    "Title": {"title": [{"text": {"content": fact_title}}]},
                                    "Category": {"select": {"name": category}},
                                    "Date Added": {"date": {"start": datetime.datetime.now().isoformat()}}
                                }
                            }
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}
                    
            async def save_task(task_title: str, due_date_iso: str = None) -> dict:
                """Save a task to the Projects & Tasks database."""
                if not projects_db_id:
                    return {"error": "Projects database not configured."}
                try:
                    props = {
                        "Project": {"title": [{"text": {"content": task_title}}]},
                        "Status": {"select": {"name": "Not started"}}
                    }
                    if due_date_iso:
                        props["Due Date"] = {"date": {"start": due_date_iso}}
                        
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/pages",
                            headers={
                                "Authorization": f"Bearer {decrypted_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={
                                "parent": {"type": "database_id", "database_id": projects_db_id},
                                "properties": props
                            }
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}

            tools = [search_workspace, save_fact, save_task]

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
                
                parts = [full_prompt]
                if files:
                    for filename in files:
                        file_path = Path(settings.UPLOAD_DIR) / Path(filename).name
                        if file_path.exists():
                            mime_type, _ = mimetypes.guess_type(str(file_path))
                            if mime_type and mime_type.startswith("image/"):
                                image_data = file_path.read_bytes()
                                parts.append(Image(data=image_data, mime_type=mime_type))
                
                response = await agent.chat(parts)
                
                # Stream the response
                async for token in response:
                    yield token, None
                    
        except Exception as e:
            logger.error(f"Error in AGY agent stream: {e}", exc_info=True)
            yield f"Error generating response: {str(e)}", None


# Singleton instance
gemini_agent = AGYAgent()
