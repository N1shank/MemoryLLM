import asyncio
import os
import sys

# Add the server directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.notion_mcp import create_notion_client

async def main():
    api_key = os.environ.get("NOTION_API_KEY")
    
    print("Testing Notion MCP Search...")
    client = create_notion_client(api_key)
    async with client.connect() as mcp:
        print("Searching for shared pages...")
        result = await mcp.call_tool("API-post-search", {})
        print("Search Results:", result)
        
if __name__ == "__main__":
    asyncio.run(main())
