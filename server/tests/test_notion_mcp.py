import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.notion_mcp import NotionMCPClient, create_notion_client

@pytest.fixture
def mock_notion_client():
    client = NotionMCPClient(api_key="fake-test-key")
    return client

@pytest.mark.asyncio
async def test_notion_client_initialization():
    client = create_notion_client(api_key="fake-key")
    assert client.api_key == "fake-key"
    assert client.session is None

@pytest.mark.asyncio
@patch("app.services.notion_mcp.stdio_client")
@patch("app.services.notion_mcp.ClientSession")
async def test_notion_client_connect_and_list_tools(mock_session_cls, mock_stdio_client, mock_notion_client):
    # Setup mocks
    mock_stdio_context = AsyncMock()
    mock_stdio_client.return_value = mock_stdio_context
    mock_stdio_context.__aenter__.return_value = (AsyncMock(), AsyncMock())
    
    mock_session_instance = AsyncMock()
    mock_session_cls.return_value = mock_session_instance
    mock_session_context = AsyncMock()
    mock_session_instance.__aenter__.return_value = mock_session_context
    
    # Mock tools response
    mock_tool = MagicMock()
    mock_tool.name = "search"
    mock_tool.description = "Search Notion"
    mock_tool.inputSchema = {"type": "object", "properties": {"query": {"type": "string"}}}
    
    mock_tools_response = MagicMock()
    mock_tools_response.tools = [mock_tool]
    mock_session_context.list_tools.return_value = mock_tools_response

    async with mock_notion_client.connect() as connected_client:
        assert connected_client.session is not None
        tools = connected_client.get_tools_for_gemini()
        
        assert len(tools) == 1
        assert tools[0]["name"] == "search"
        assert tools[0]["description"] == "Search Notion"

@pytest.mark.asyncio
@patch("app.services.notion_mcp.stdio_client")
@patch("app.services.notion_mcp.ClientSession")
async def test_notion_client_call_tool(mock_session_cls, mock_stdio_client, mock_notion_client):
    # Setup mocks
    mock_stdio_context = AsyncMock()
    mock_stdio_client.return_value = mock_stdio_context
    mock_stdio_context.__aenter__.return_value = (AsyncMock(), AsyncMock())
    
    mock_session_instance = AsyncMock()
    mock_session_cls.return_value = mock_session_instance
    mock_session_context = AsyncMock()
    mock_session_instance.__aenter__.return_value = mock_session_context
    
    mock_session_context.list_tools.return_value = MagicMock(tools=[])
    
    # Mock tool response
    mock_result = MagicMock()
    mock_content = MagicMock()
    mock_content.text = "Result from Notion"
    mock_result.content = [mock_content]
    mock_session_context.call_tool.return_value = mock_result
    
    async with mock_notion_client.connect() as connected_client:
        result = await connected_client.call_tool("search", {"query": "test"})
        assert result == "Result from Notion"
        mock_session_context.call_tool.assert_called_once_with("search", {"query": "test"})
