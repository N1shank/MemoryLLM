import asyncio
import json
import os
import sys

# Add the server directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.notion_mcp import create_notion_client

async def main():
    api_key = os.environ.get("NOTION_API_KEY")
    client = create_notion_client(api_key)
    
    parent_page_id = "30ae2706-4d1d-80e5-8a7b-ebee56361211"
    
    async with client.connect() as mcp:
        print("1. CREATE: Creating a new child page...")
        create_payload = {
            "parent": {"type": "page_id", "page_id": parent_page_id},
            "properties": {
                "title": {
                    "title": [{"type": "text", "text": {"content": "Test CRUD Page"}}]
                }
            }
        }
        new_page = await mcp.call_tool("API-post-page", create_payload)
        new_page_json = json.loads(new_page)
        new_page_id = new_page_json.get("id")
        print(f"   -> Created page with ID: {new_page_id}")
        
        print("\n2. READ: Retrieving the created page...")
        read_page = await mcp.call_tool("API-retrieve-a-page", {"page_id": new_page_id})
        print(f"   -> Read page title successfully.")
        
        print("\n3. UPDATE: Adding a block (text) to the page...")
        update_payload = {
            "block_id": new_page_id,
            "children": [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": "This is a test block created by MemoryLLM!"}}]
                    }
                }
            ]
        }
        await mcp.call_tool("API-patch-block-children", update_payload)
        print("   -> Successfully added text block to the page.")
        
        print("\n4. DELETE: Archiving (deleting) the page...")
        delete_payload = {
            "page_id": new_page_id,
            "archived": True
        }
        await mcp.call_tool("API-patch-page", delete_payload)
        print("   -> Successfully archived the page.")
        
        print("\n🎉 CRUD Test Completed Successfully!")

if __name__ == "__main__":
    asyncio.run(main())
