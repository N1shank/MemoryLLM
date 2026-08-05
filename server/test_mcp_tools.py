import asyncio
from app.services.notion_mcp import create_notion_client
from app.core.config import settings
import json

async def main():
    client = create_notion_client(settings.NOTION_API_KEY)
    async with client.connect():
        print(json.dumps(client.get_tools_for_gemini(), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
