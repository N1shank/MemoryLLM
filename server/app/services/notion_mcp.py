"""Notion MCP Client for memory operations."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.core.config import settings

logger = logging.getLogger(__name__)


class NotionMCPClient:
    """Client for interacting with Notion via MCP protocol."""

    def __init__(self, api_key: str | None = None):
        """
        Initialize Notion MCP client.
        
        Args:
            api_key: Notion API key. If None, falls back to global settings.NOTION_API_KEY.
        """
        self.api_key = api_key or settings.NOTION_API_KEY
        self.session: ClientSession | None = None
        self._tools: list[dict] = []

    @asynccontextmanager
    async def connect(self):
        """Connect to the Notion MCP server."""
        if not self.api_key:
            logger.warning("Notion API key not configured, skipping Notion connection")
            yield self
            return
        
        try:
            server_params = StdioServerParameters(
                command=settings.NOTION_MCP_SERVER_PATH,
                args=settings.NOTION_MCP_SERVER_ARGS,
                env={"OPENAPI_MCP_HEADERS": json.dumps({
                    "Authorization": f"Bearer {self.api_key}",
                    "Notion-Version": "2022-06-28"
                })}
            )

            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    self.session = session
                    
                    # Cache available tools
                    try:
                        tools_response = await session.list_tools()
                        self._tools = [
                            {
                                "name": tool.name,
                                "description": tool.description,
                                "input_schema": tool.inputSchema,
                            }
                            for tool in tools_response.tools
                        ]
                    except Exception as e:
                        logger.error(f"Error listing Notion tools: {e}", exc_info=True)
                        self._tools = []
                    
                    yield self
                    
                    self.session = None
        except Exception as e:
            logger.error(f"Error connecting to Notion MCP: {e}", exc_info=True)
            self.session = None
            self._tools = []
            yield self

    def get_tools_for_gemini(self) -> list[dict]:
        """Get tools formatted for Gemini function calling."""
        gemini_tools = []
        for tool in self._tools:
            gemini_tools.append({
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            })
        return gemini_tools

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        """Call a Notion MCP tool."""
        if not self.session:
            raise RuntimeError("Not connected to Notion MCP server")

        try:
            result = await self.session.call_tool(name, arguments)
            
            # Extract text content from the result
            if result.content:
                texts = []
                for content in result.content:
                    if hasattr(content, "text"):
                        texts.append(content.text)
                return "\n".join(texts) if texts else str(result)
            return str(result)
        except Exception as e:
            logger.error(f"Error calling Notion tool {name}: {e}")
            raise


# Factory function to create client instances
def create_notion_client(api_key: str | None = None) -> NotionMCPClient:
    """Create a Notion MCP client instance with optional API key."""
    return NotionMCPClient(api_key=api_key)

# Default singleton instance (for backward compatibility)
notion_client = NotionMCPClient()

