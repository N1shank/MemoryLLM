"""Notion MCP Client for memory operations."""

import asyncio
import json
import logging
import atexit
from contextlib import AsyncExitStack, asynccontextmanager
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
        
        self._exit_stack = AsyncExitStack()
        self._lock = asyncio.Lock()
        self._connected = False

    async def _do_connect(self):
        if not self.api_key:
            logger.warning("Notion API key not configured, skipping Notion connection")
            return
            
        async with self._lock:
            if self._connected:
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

                read, write = await self._exit_stack.enter_async_context(stdio_client(server_params))
                self.session = await self._exit_stack.enter_async_context(ClientSession(read, write))
                await self.session.initialize()
                
                # Cache available tools
                try:
                    tools_response = await self.session.list_tools()
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
                
                self._connected = True
            except Exception as e:
                logger.error(f"Error connecting to Notion MCP: {e}", exc_info=True)
                self.session = None
                self._tools = []
                self._connected = False

    @asynccontextmanager
    async def connect(self):
        """Connect to the Notion MCP server and yield the client. Reuses existing connection."""
        await self._do_connect()
        yield self

    async def close(self):
        """Cleanly close the MCP connection."""
        async with self._lock:
            if self._connected:
                try:
                    await self._exit_stack.aclose()
                except Exception as e:
                    logger.error(f"Error closing Notion MCP connection: {e}")
                finally:
                    self._connected = False
                    self.session = None
                    self._tools = []

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


# Global pool of active NotionMCPClient instances, keyed by API key
_client_pool: dict[str, NotionMCPClient] = {}

def create_notion_client(api_key: str | None = None) -> NotionMCPClient:
    """Create or retrieve a Notion MCP client instance from the pool."""
    key = api_key or settings.NOTION_API_KEY
    if not key:
        return NotionMCPClient(api_key=None)
        
    if key not in _client_pool:
        _client_pool[key] = NotionMCPClient(api_key=key)
        
    return _client_pool[key]

async def close_all_clients():
    """Close all active Notion MCP clients in the pool."""
    close_tasks = [client.close() for client in _client_pool.values()]
    if close_tasks:
        await asyncio.gather(*close_tasks, return_exceptions=True)
    _client_pool.clear()

def _cleanup_sync():
    """Synchronous cleanup hook for atexit."""
    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            loop.create_task(close_all_clients())
            return
    except RuntimeError:
        pass
    
    # If there's no running event loop, create a new one to run cleanup
    if _client_pool:
        try:
            asyncio.run(close_all_clients())
        except Exception as e:
            logger.debug(f"Error during atexit cleanup of MCP clients: {e}")

atexit.register(_cleanup_sync)

# Default singleton instance (for backward compatibility)
notion_client = create_notion_client()
