"""Gemini Agent with Notion MCP memory integration."""

import asyncio
import json
import logging
from typing import AsyncGenerator

import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

from app.core.config import settings
from app.core.security import decrypt_api_key
from app.services.notion_mcp import create_notion_client

logger = logging.getLogger(__name__)

# Configure Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)


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
        self.model = genai.GenerativeModel(settings.GEMINI_MODEL)

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
            async with notion_client_instance.connect() as client:
                # Get Notion tools for function calling
                notion_tools = client.get_tools_for_gemini()
                
                # Build conversation for Gemini
                gemini_history = []
                for msg in conversation_history:
                    gemini_history.append({
                        "role": "user" if msg["role"] == "user" else "model",
                        "parts": [msg["content"]],
                    })

                # Create chat with tools
                tools = None
                if notion_tools:
                    tools = self._convert_to_gemini_tools(notion_tools)

                chat = self.model.start_chat(history=gemini_history)
                
                # Send message with system prompt context
                full_message = f"{SYSTEM_PROMPT}\n\nUser: {message}"
                
                response, actions = await self._generate_with_tools(
                    chat, full_message, tools, client
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
                gemini_history = []
                for msg in conversation_history:
                    gemini_history.append({
                        "role": "user" if msg["role"] == "user" else "model",
                        "parts": [msg["content"]],
                    })
                
                chat = self.model.start_chat(history=gemini_history)
                response = chat.send_message(
                    f"{SYSTEM_PROMPT}\n\n(Note: Notion memory is currently unavailable)\n\nUser: {message}",
                    generation_config=genai.GenerationConfig(
                        temperature=0.7,
                        max_output_tokens=2048,
                    ),
                )
                
                if response.candidates and response.candidates[0].content.parts:
                    return response.candidates[0].content.parts[0].text, "Notion unavailable"
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
                async with notion_client_instance.connect() as client:
                    # Get Notion tools
                    notion_tools = client.get_tools_for_gemini()
                    
                    # Build conversation history
                    gemini_history = []
                    for msg in conversation_history:
                        gemini_history.append({
                            "role": "user" if msg["role"] == "user" else "model",
                            "parts": [msg["content"]],
                        })

                    tools = None
                    if notion_tools:
                        tools = self._convert_to_gemini_tools(notion_tools)

                    chat = self.model.start_chat(history=gemini_history)
                    full_message = f"{SYSTEM_PROMPT}\n\nUser: {message}"
                    
                    # First, handle any tool calls (non-streaming)
                    response, actions = await self._generate_with_tools(
                        chat, full_message, tools, client
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
            gemini_history = []
            for msg in conversation_history:
                gemini_history.append({
                    "role": "user" if msg["role"] == "user" else "model",
                    "parts": [msg["content"]],
                })
            
            chat = self.model.start_chat(history=gemini_history)
            full_message = f"{SYSTEM_PROMPT}\n\n(Note: Notion memory is currently unavailable)\n\nUser: {message}"
            
            generation_config = genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=2048,
            )
            
            try:
                response = await self._send_message_with_retry(
                    chat, full_message, generation_config
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
            
            if response.candidates and response.candidates[0].content.parts:
                response_text = response.candidates[0].content.parts[0].text
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

    def _convert_to_gemini_tools(self, mcp_tools: list[dict]) -> list:
        """Convert MCP tools to Gemini tool format."""
        function_declarations = []
        
        for tool in mcp_tools:
            # Clean up the schema for Gemini
            parameters = tool.get("parameters", {})
            if not parameters:
                parameters = {"type": "object", "properties": {}}
            
            function_declarations.append(
                genai.protos.FunctionDeclaration(
                    name=tool["name"],
                    description=tool.get("description", ""),
                    parameters=self._clean_schema(parameters),
                )
            )
        
        return [genai.protos.Tool(function_declarations=function_declarations)]

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
    
    async def _send_message_with_retry(
        self,
        chat,
        message: str,
        generation_config: genai.GenerationConfig,
        tools: list | None = None,
        max_retries: int = 3,
    ):
        """Send message with retry logic for rate limits."""
        last_error = None
        
        for attempt in range(max_retries):
            try:
                # Run synchronous send_message in thread pool
                if tools:
                    return await asyncio.to_thread(
                        chat.send_message,
                        message,
                        generation_config=generation_config,
                        tools=tools,
                    )
                else:
                    return await asyncio.to_thread(
                        chat.send_message,
                        message,
                        generation_config=generation_config,
                    )
            except google_exceptions.ResourceExhausted as e:
                last_error = e
                # Check if error has retry delay
                retry_delay = 20  # Default 20 seconds
                error_str = str(e)
                if "retry in" in error_str.lower():
                    # Try to extract retry delay (usually in seconds)
                    import re
                    match = re.search(r'retry in ([\d.]+)s', error_str.lower())
                    if match:
                        retry_delay = max(20, int(float(match.group(1))) + 5)
                
                if attempt < max_retries - 1:
                    logger.warning(f"Rate limit hit, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(retry_delay)
                else:
                    raise
            except Exception as e:
                # For other errors, raise immediately
                raise
        
        raise last_error

    async def _generate_with_tools(
        self,
        chat,
        message: str,
        tools: list | None,
        mcp_client,
        max_iterations: int = 10,
    ) -> tuple[str, list[str]]:
        """
        Generate response, handling tool calls iteratively.
        
        Returns:
            tuple of (response_text, list of memory actions)
        """
        memory_actions: list[str] = []
        
        generation_config = genai.GenerationConfig(
            temperature=0.7,
            max_output_tokens=2048,
        )
        
        current_message = message
        
        for _ in range(max_iterations):
            try:
                response = await self._send_message_with_retry(
                    chat, current_message, generation_config, tools
                )
            except google_exceptions.ResourceExhausted as e:
                error_msg = self._handle_rate_limit_error(e)
                logger.error(f"Rate limit error: {e}")
                return error_msg, memory_actions
            except Exception as e:
                logger.error(f"Error generating response: {e}", exc_info=True)
                return f"Error: {str(e)[:200]}", memory_actions
            
            if not response.candidates:
                return "I apologize, but I couldn't generate a response.", memory_actions
            
            candidate = response.candidates[0]
            
            # Check for function calls
            function_calls = []
            for part in candidate.content.parts:
                if hasattr(part, "function_call") and part.function_call:
                    function_calls.append(part.function_call)
            
            if not function_calls:
                # No function calls, return text response
                text = ""
                for part in candidate.content.parts:
                    if hasattr(part, "text") and part.text:
                        text += part.text
                return text, memory_actions
            
            # Execute function calls
            function_responses = []
            for fc in function_calls:
                try:
                    args = dict(fc.args) if fc.args else {}
                    result = await mcp_client.call_tool(fc.name, args)
                    function_responses.append({
                        "name": fc.name,
                        "response": {"result": result},
                    })
                    
                    # Track memory action
                    action_desc = f"📝 {fc.name}"
                    if "search" in fc.name.lower():
                        action_desc = f"🔍 Searched Notion"
                    elif "create" in fc.name.lower():
                        action_desc = f"✏️ Created in Notion"
                    elif "update" in fc.name.lower():
                        action_desc = f"📝 Updated Notion"
                    memory_actions.append(action_desc)
                    
                    logger.info(f"Called tool {fc.name} with args {args}")
                except Exception as e:
                    logger.error(f"Tool call failed: {e}")
                    function_responses.append({
                        "name": fc.name,
                        "response": {"error": str(e)},
                    })
                    memory_actions.append(f"❌ {fc.name} failed")
            
            # Send function responses back
            current_message = genai.protos.Content(
                parts=[
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=fr["name"],
                            response=fr["response"],
                        )
                    )
                    for fr in function_responses
                ]
            )
        
        return "I apologize, but I reached the maximum number of tool calls.", memory_actions


# Singleton instance
gemini_agent = GeminiAgent()
