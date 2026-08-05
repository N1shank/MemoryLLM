import asyncio
import os
import sys

# Add the server directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.web_search import execute_web_search

async def main():
    print("Testing Web Search...")
    result = await execute_web_search("What is the latest version of Next.js?", 2)
    print("Search Result:\n", result)

if __name__ == "__main__":
    asyncio.run(main())
