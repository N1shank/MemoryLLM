"""Gemini Agent with Notion MCP memory integration."""

import asyncio
import json
import logging
from typing import AsyncGenerator

from google import genai
from google.api_core import exceptions as google_exceptions

from app.core.config import settings
from app.core.security import decrypt_api_key
from app.services.notion_mcp import create_notion_client

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an intelligent AI assistant with access to a Notion workspace as your memory.

You can use the Notion tools to:
- Search for information you've stored before
- Create new pages to remember important information
- Update existing pages with new details
- Organize information into databases

When the user shares important information (preferences, facts, context about themselves or their work), 
proactively save it to Notion so you can recall it later.

When answering questions, first check if you have relevant information stored in Notion.

Be helpful, concise, and make good use of your memory capabilities."""


class GeminiAgent:
    """Gemini agent with Notion MCP tools for memory."""

    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model_name = settings.GEMINI_MODEL

    def _get_client(self, api_key: str | None = None):
        """Get a client instance, optionally with a different API key."""
        if api_key:
            return genai.Client(api_key=api_key)
        return self.client

    async def chat(
        self,
        message: str,
        conversation_history: list[dict],
        notion_api_key: str | None = None,
    ) -> tuple[str, str | None]:
        """
        Process a chat message with memory capabilities.
        
        Returns:
            tuple of (response_text, memory_context)
        """
        memory_actions: list[str] = []

        # Decrypt API key if provided
        decrypted_key = None
        if notion_api_key:
            decrypted_key = decrypt_api_key(notion_api_key)

        try:
            notion_client_instance = create_notion_client(api_key=decrypted_key)
            async with notion_client_instance.connect() as mcp_client:
                # Get Notion tools for function calling
                notion_tools = mcp_client.get_tools_for_gemini()
                
                # Build conversation contents for Gemini
                contents = []
                for msg in conversation_history:
                    contents.append({
                        "role": "user" if msg["role"] == "user" else "model",
                        "parts": [{"text": msg["content"]}],
                    })

                # Add system instruction and current message
                full_message = f"{SYSTEM_PROMPT}\n\nUser: {message}"
                contents.append({
                    "role": "user",
                    "parts": [{"text": full_message}],
                })

                # Convert tools if available
                tools_config = None
                if notion_tools:
                    tools_config = self._convert_to_gemini_tools(notion_tools)

                # Get client (use async client if available)
                client = self._get_client()
                
                response, actions = await self._generate_with_tools(
                    client, contents, tools_config, mcp_client
                )
                memory_actions = actions
                
                # Build memory context string
                memory_context = None
                if memory_actions:
                    memory_context = " | ".join(memory_actions)
                
                return response, memory_context
        
        except Exception as e:
            logger.error(f"Error in chat: {e}")
            # Try without Notion tools as fallback
            try:
                contents = []
                for msg in conversation_history:
                    contents.append({
                        "role": "user" if msg["role"] == "user" else "model",
                        "parts": [{"text": msg["content"]}],
                    })
                
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"{SYSTEM_PROMPT}\n\n(Note: Notion memory is currently unavailable)\n\nUser: {message}"}],
                })
                
                client = self._get_client()
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=self.model_name,
                    contents=contents,
                    config={
                        "temperature": 0.7,
                        "max_output_tokens": 2048,
                    }
                )
                
                if response.text:
                    return response.text, "Notion unavailable"
                return "I apologize, but I couldn't generate a response.", None
            except google_exceptions.ResourceExhausted as e:
                error_msg = self._handle_rate_limit_error(e)
                logger.error(f"Rate limit error in fallback: {e}")
                return error_msg, None
            except Exception as fallback_error:
                logger.error(f"Fallback also failed: {fallback_error}", exc_info=True)
                error_msg = self._handle_rate_limit_error(fallback_error) if "429" in str(fallback_error) else f"Error: {str(fallback_error)[:200]}"
                return error_msg, None

    async def chat_stream(
        self,
        message: str,
        conversation_history: list[dict],
        notion_api_key: str | None = None,
    ) -> AsyncGenerator[tuple[str, str | None], None]:
        """
        Process a chat message with streaming response.
        
        Yields:
            tuple of (chunk_text, memory_context) for each token
        """
        memory_actions: list[str] = []
        memory_context = None

        # Decrypt API key if provided
        decrypted_key = None
        if notion_api_key:
            decrypted_key = decrypt_api_key(notion_api_key)

        try:
            # Try with Notion first
            try:
                notion_client_instance = create_notion_client(api_key=decrypted_key)
                async with notion_client_instance.connect() as mcp_client:
                    # Get Notion tools
                    notion_tools = mcp_client.get_tools_for_gemini()
                    
                    # Build conversation history
                    contents = []
                    for msg in conversation_history:
                        contents.append({
                            "role": "user" if msg["role"] == "user" else "model",
                            "parts": [{"text": msg["content"]}],
                        })

                    tools_config = None
                    if notion_tools:
                        tools_config = self._convert_to_gemini_tools(notion_tools)

                    full_message = f"{SYSTEM_PROMPT}\n\nUser: {message}"
                    contents.append({
                        "role": "user",
                        "parts": [{"text": full_message}],
                    })
                    
                    # First, handle any tool calls (non-streaming)
                    client = self._get_client()
                    response, actions = await self._generate_with_tools(
                        client, contents, tools_config, mcp_client
                    )
                    memory_actions = actions
                    
                    if memory_actions:
                        memory_context = " | ".join(memory_actions)
                    
                    # Stream the final response
                    # Since Gemini's streaming with tools is complex,
                    # we simulate streaming by chunking the response
                    words = response.split()
                    chunk_size = 3  # Send 3 words at a time
                    
                    for i in range(0, len(words), chunk_size):
                        chunk = " ".join(words[i:i + chunk_size])
                        if i > 0:
                            chunk = " " + chunk
                        yield chunk, memory_context if i == 0 else None
                    return
            except Exception as notion_error:
                logger.warning(f"Notion connection failed, falling back to direct Gemini: {notion_error}")
                # Fall through to fallback
        
            # Fallback: Use Gemini without Notion tools
            contents = []
            for msg in conversation_history:
                contents.append({
                    "role": "user" if msg["role"] == "user" else "model",
                    "parts": [{"text": msg["content"]}],
                })
            
            contents.append({
                "role": "user",
                "parts": [{"text": f"{SYSTEM_PROMPT}\n\n(Note: Notion memory is currently unavailable)\n\nUser: {message}"}],
            })
            
            client = self._get_client()
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=self.model_name,
                    contents=contents,
                    config={
                        "temperature": 0.7,
                        "max_output_tokens": 2048,
                    }
                )
            except google_exceptions.ResourceExhausted as e:
                error_msg = self._handle_rate_limit_error(e)
                yield error_msg, "Notion unavailable"
                return
            except Exception as e:
                logger.error(f"Error in fallback streaming: {e}", exc_info=True)
                error_msg = self._handle_rate_limit_error(e) if "429" in str(e) else f"Error: {str(e)[:200]}"
                yield error_msg, None
                return
            
            if response.text:
                response_text = response.text
                # Stream the response
                words = response_text.split()
                chunk_size = 3
                
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i:i + chunk_size])
                    if i > 0:
                        chunk = " " + chunk
                    yield chunk, "Notion unavailable" if i == 0 else None
            else:
                yield "I apologize, but I couldn't generate a response.", None
        
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"Error: {str(e)}", None

    def _convert_to_gemini_tools(self, mcp_tools: list[dict]) -> dict:
        """Convert MCP tools to Gemini tool format for new API."""
        function_declarations = []
        
        for tool in mcp_tools:
            # Clean up the schema for Gemini
            parameters = tool.get("parameters", {})
            if not parameters:
                parameters = {"type": "object", "properties": {}}
            
            function_declarations.append({
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": self._clean_schema(parameters),
            })
        
        return {"function_declarations": function_declarations}

    def _clean_schema(self, schema: dict) -> dict:
        """Clean JSON schema for Gemini compatibility."""
        cleaned = {}
        
        if "type" in schema:
            cleaned["type"] = schema["type"].upper()
        else:
            cleaned["type"] = "OBJECT"
            
        if "properties" in schema:
            cleaned["properties"] = {}
            for name, prop in schema["properties"].items():
                cleaned["properties"][name] = self._clean_property(prop)
                
        if "required" in schema:
            cleaned["required"] = schema["required"]
            
        return cleaned

    def _clean_property(self, prop: dict) -> dict:
        """Clean a property schema."""
        cleaned = {}
        
        prop_type = prop.get("type", "string")
        if isinstance(prop_type, list):
            prop_type = next((t for t in prop_type if t != "null"), "string")
        
        cleaned["type"] = prop_type.upper()
        
        if "description" in prop:
            cleaned["description"] = prop["description"]
            
        if prop_type == "array" and "items" in prop:
            cleaned["items"] = self._clean_property(prop["items"])
            
        if prop_type == "object" and "properties" in prop:
            cleaned["properties"] = {
                k: self._clean_property(v)
                for k, v in prop["properties"].items()
            }
            
        return cleaned

    def _handle_rate_limit_error(self, error: Exception) -> str:
        """Extract user-friendly message from rate limit error."""
        error_str = str(error)
        if "429" in error_str or "quota" in error_str.lower():
            if "retry in" in error_str.lower():
                # Extract retry delay if available
                return "⚠️ Rate limit exceeded. Please wait a moment and try again. If this persists, check your Gemini API quota at https://ai.dev/usage"
            return "⚠️ API rate limit exceeded. Please check your Gemini API quota and billing at https://ai.dev/usage"
        return f"API Error: {error_str[:200]}"
    
    async def _generate_with_tools(
        self,
        client,
        contents: list[dict],
        tools_config: dict | None,
        mcp_client,
        max_iterations: int = 10,
    ) -> tuple[str, list[str]]:
        """
        Generate response, handling tool calls iteratively.
        
        Returns:
            tuple of (response_text, list of memory actions)
        """
        memory_actions: list[str] = []
        
        config = {
            "temperature": 0.7,
            "max_output_tokens": 2048,
        }
        
        current_contents = contents.copy()
        
        for _ in range(max_iterations):
            try:
                # Prepare request - tools go in config, not as separate parameter
                request_config = config.copy()
                if tools_config:
                    request_config["tools"] = [tools_config]
                
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=self.model_name,
                    contents=current_contents,
                    config=request_config,
                )
            except google_exceptions.ResourceExhausted as e:
                error_msg = self._handle_rate_limit_error(e)
                logger.error(f"Rate limit error: {e}")
                return error_msg, memory_actions
            except Exception as e:
                logger.error(f"Error generating response: {e}", exc_info=True)
                return f"Error: {str(e)[:200]}", memory_actions
            
            if not response or not hasattr(response, 'text') and not hasattr(response, 'candidates'):
                return "I apologize, but I couldn't generate a response.", memory_actions
            
            # Check for function calls in the new API
            function_calls = []
            if hasattr(response, 'candidates') and response.candidates:
                for candidate in response.candidates:
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        for part in candidate.content.parts:
                            if hasattr(part, 'function_call') and part.function_call:
                                function_calls.append(part.function_call)
            elif hasattr(response, 'function_calls'):
                function_calls = response.function_calls
            
            if not function_calls:
                # No function calls, return text response
                if hasattr(response, 'text'):
                    return response.text, memory_actions
                elif hasattr(response, 'candidates') and response.candidates:
                    # Extract text from candidates
                    text_parts = []
                    for candidate in response.candidates:
                        if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                            for part in candidate.content.parts:
                                if hasattr(part, 'text'):
                                    text_parts.append(part.text)
                    return "".join(text_parts), memory_actions
                return "I apologize, but I couldn't generate a response.", memory_actions
            
            # Execute function calls
            function_responses = []
            for fc in function_calls:
                try:
                    # Extract function name and args from new API structure
                    if hasattr(fc, 'name'):
                        func_name = fc.name
                        func_args = dict(fc.args) if hasattr(fc, 'args') and fc.args else {}
                    elif isinstance(fc, dict):
                        func_name = fc.get("name", "")
                        func_args = fc.get("args", {})
                    else:
                        func_name = str(fc)
                        func_args = {}
                    
                    result = await mcp_client.call_tool(func_name, func_args)
                    function_responses.append({
                        "name": func_name,
                        "response": {"result": result},
                    })
                    
                    # Track memory action
                    action_desc = f"📝 {func_name}"
                    if "search" in func_name.lower():
                        action_desc = f"🔍 Searched Notion"
                    elif "create" in func_name.lower():
                        action_desc = f"✏️ Created in Notion"
                    elif "update" in func_name.lower():
                        action_desc = f"📝 Updated Notion"
                    memory_actions.append(action_desc)
                    
                    logger.info(f"Called tool {func_name} with args {func_args}")
                except Exception as e:
                    logger.error(f"Tool call failed: {e}")
                    func_name = fc.name if hasattr(fc, 'name') else str(fc)
                    function_responses.append({
                        "name": func_name,
                        "response": {"error": str(e)},
                    })
                    memory_actions.append(f"❌ {func_name} failed")
            
            # Add function response to contents for next iteration
            for fr in function_responses:
                current_contents.append({
                    "role": "model",
                    "parts": [{
                        "function_response": {
                            "name": fr["name"],
                            "response": fr["response"],
                        }
                    }],
                })
        
        return "I apologize, but I reached the maximum number of tool calls.", memory_actions


# Singleton instance
gemini_agent = GeminiAgent()
