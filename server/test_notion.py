import asyncio
import os
import sys

# Add the server directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.notion_mcp import create_notion_client

async def main():
    api_key = os.environ.get("NOTION_API_KEY")
    if not api_key:
        print("Please set NOTION_API_KEY environment variable")
        return
    
    print("Testing Notion MCP connection...")
    client = create_notion_client(api_key)
    async with client.connect() as mcp:
        tools = mcp.get_tools_for_gemini()
        print("Available tools:")
        for t in tools:
            print(f"- {t['name']}")
        
if __name__ == "__main__":
    asyncio.run(main())
