"""Memory Layer Initialization Service."""

import httpx
import logging
import json
from app.core.database import async_session
from app.models.user import User

logger = logging.getLogger(__name__)

async def create_notion_database(client: httpx.AsyncClient, parent_id: str, title: str, schema: dict) -> dict:
    """Create a Notion database under a specific page."""
    response = await client.post(
        "https://api.notion.com/v1/databases",
        json={
            "parent": {"type": "page_id", "page_id": parent_id},
            "title": [{"type": "text", "text": {"content": title}}],
            "properties": schema
        }
    )
    if response.status_code == 200:
        return response.json()
    else:
        logger.error(f"Failed to create database '{title}': {response.text}")
        return None


async def initialize_memory_layer(access_token: str, user_id: int):
    """
    Initialize the structured memory layer in the user's Notion workspace.
    """
    logger.info(f"Initializing Memory Layer for user {user_id}")
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    
    try:
        async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
            # 1. Search for any page shared with the integration to use as root
            search_res = await client.post("https://api.notion.com/v1/search", json={
                "filter": {"value": "page", "property": "object"},
                "page_size": 1
            })
            
            if search_res.status_code != 200:
                logger.error(f"Failed to search Notion: {search_res.text}")
                return
                
            results = search_res.json().get("results", [])
            if not results:
                logger.warning("No pages shared with the integration. Cannot initialize memory layer.")
                return
                
            root_page_id = results[0]["id"]
            
            # 2. Create the MemoryLLM Dashboard Page
            dash_res = await client.post("https://api.notion.com/v1/pages", json={
                "parent": {"type": "page_id", "page_id": root_page_id},
                "properties": {
                    "title": {"title": [{"text": {"content": "🧠 MemoryLLM Core Dashboard"}}]}
                }
            })
            
            if dash_res.status_code != 200:
                logger.error(f"Failed to create Dashboard: {dash_res.text}")
                return
                
            dashboard = dash_res.json()
            dashboard_id = dashboard["id"]
            
            # 3. Create Structured Databases
            facts_schema = {
                "Title": {"title": {}},
                "Category": {"select": {}},
                "Date Added": {"date": {}},
                "Confidence": {"number": {}}
            }
            facts_db = await create_notion_database(client, dashboard_id, "📚 Facts & Notes", facts_schema)
            
            skills_schema = {
                "Skill Name": {"title": {}},
                "Description": {"rich_text": {}},
                "Status": {"select": {}}
            }
            skills_db = await create_notion_database(client, dashboard_id, "🛠️ Skills & Capabilities", skills_schema)
            
            projects_schema = {
                "Project": {"title": {}},
                "Status": {"select": {}},
                "Due Date": {"date": {}}
            }
            projects_db = await create_notion_database(client, dashboard_id, "📋 Projects & Tasks", projects_schema)
            
            # 4. Save to User DB
            memory_pages = [
                {"role": "dashboard", "id": dashboard_id, "title": "MemoryLLM Dashboard"},
            ]
            
            if facts_db:
                memory_pages.append({"role": "facts", "id": facts_db["id"], "title": "Facts & Notes"})
            if skills_db:
                memory_pages.append({"role": "skills", "id": skills_db["id"], "title": "Skills"})
            if projects_db:
                memory_pages.append({"role": "projects", "id": projects_db["id"], "title": "Projects"})
            
            async with async_session() as db:
                user = await db.get(User, user_id)
                if user:
                    user.notion_pages = memory_pages
                    await db.commit()
                    logger.info(f"Successfully initialized Memory Layer for user {user_id}")
                    
    except Exception as e:
        logger.error(f"Error initializing Memory Layer: {e}", exc_info=True)
