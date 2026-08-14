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


SYSTEM_PROMPT = """You are an intelligent AI assistant with access to structured memory layers (Notion and/or Google Drive).

You have access to specialized databases/documents:
- Facts & Notes: For storing facts, preferences, and long-term knowledge about the user.
- Skills: For instructions on how you should behave or perform tasks.
- Projects & Tasks: For tracking actionable items.

When the user shares important information, proactively save it to the appropriate memory layer using your tools.
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
        decrypted_notion_key = None
        if user.notion_api_key:
            decrypted_notion_key = decrypt_api_key(user.notion_api_key)

        decrypted_google_access = None
        decrypted_google_refresh = None
        if user.google_access_token:
            decrypted_google_access = decrypt_api_key(user.google_access_token)
        if user.google_refresh_token:
            decrypted_google_refresh = decrypt_api_key(user.google_refresh_token)

        notion_dashboard_id = None
        notion_facts_db_id = None
        notion_projects_db_id = None
        notion_skills_db_id = None
        
        if user.notion_pages:
            for page in user.notion_pages:
                role = page.get("role")
                if role == "dashboard":
                    notion_dashboard_id = page.get("id")
                elif role == "facts":
                    notion_facts_db_id = page.get("id")
                elif role == "projects":
                    notion_projects_db_id = page.get("id")
                elif role == "skills":
                    notion_skills_db_id = page.get("id")
                elif not notion_dashboard_id:
                    notion_dashboard_id = page.get("id")

        google_facts_doc_id = None
        google_projects_doc_id = None
        
        if user.google_files:
            for page in user.google_files:
                role = page.get("role")
                if role == "facts":
                    google_facts_doc_id = page.get("id")
                elif role == "projects":
                    google_projects_doc_id = page.get("id")

        tools = []
        
        if decrypted_notion_key:
            async def search_notion(query: str) -> dict:
                """Search across the entire Notion workspace for any information."""
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/search",
                            headers={
                                "Authorization": f"Bearer {decrypted_notion_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={"query": query}
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}

            async def save_fact_to_notion(fact_title: str, category: str = "General") -> dict:
                """Save a fact or note about the user to the Notion Facts database."""
                if not notion_facts_db_id:
                    return {"error": "Notion Facts database not configured."}
                try:
                    import datetime
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.post(
                            "https://api.notion.com/v1/pages",
                            headers={
                                "Authorization": f"Bearer {decrypted_notion_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={
                                "parent": {"type": "database_id", "database_id": notion_facts_db_id},
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
                    
            async def save_task_to_notion(task_title: str, due_date_iso: str = None) -> dict:
                """Save a task to the Notion Projects database."""
                if not notion_projects_db_id:
                    return {"error": "Notion Projects database not configured."}
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
                                "Authorization": f"Bearer {decrypted_notion_key}",
                                "Notion-Version": "2022-06-28",
                                "Content-Type": "application/json",
                            },
                            json={
                                "parent": {"type": "database_id", "database_id": notion_projects_db_id},
                                "properties": props
                            }
                        )
                        return response.json()
                except Exception as e:
                    return {"error": str(e)}

            tools.extend([search_notion, save_fact_to_notion, save_task_to_notion])

        if decrypted_google_access:
            def _get_google_creds():
                from google.oauth2.credentials import Credentials
                from app.core.config import settings
                return Credentials(
                    token=decrypted_google_access,
                    refresh_token=decrypted_google_refresh,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_CLIENT_ID,
                    client_secret=settings.GOOGLE_CLIENT_SECRET,
                )

            async def save_fact_to_google(fact_text: str) -> dict:
                """Save a fact or note about the user to the Google Drive Facts Document."""
                if not google_facts_doc_id:
                    return {"error": "Google Facts document not configured."}
                try:
                    import datetime
                    from googleapiclient.discovery import build
                    docs_service = build('docs', 'v1', credentials=_get_google_creds())
                    
                    text_to_insert = f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}] {fact_text}\n"
                    requests = [{'insertText': {'location': {'index': 1}, 'text': text_to_insert}}]
                    docs_service.documents().batchUpdate(documentId=google_facts_doc_id, body={'requests': requests}).execute()
                    
                    return {"status": "success"}
                except Exception as e:
                    return {"error": str(e)}

            async def save_task_to_google(task_text: str, due_date: str = "") -> dict:
                """Save an actionable task to the Google Drive Projects Document."""
                if not google_projects_doc_id:
                    return {"error": "Google Projects document not configured."}
                try:
                    from googleapiclient.discovery import build
                    docs_service = build('docs', 'v1', credentials=_get_google_creds())
                    
                    text_to_insert = f"[TODO] {task_text} "
                    if due_date:
                        text_to_insert += f"(Due: {due_date})"
                    text_to_insert += "\n"
                    
                    requests = [{'insertText': {'location': {'index': 1}, 'text': text_to_insert}}]
                    docs_service.documents().batchUpdate(documentId=google_projects_doc_id, body={'requests': requests}).execute()
                    
                    return {"status": "success"}
                except Exception as e:
                    return {"error": str(e)}
            
            tools.extend([save_fact_to_google, save_task_to_google])

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
