"""Gemini Agent with Notion MCP memory integration."""

import json
import logging
from typing import Any

import google.generativeai as genai

from app.core.config import settings
from app.schemas.chat import ChatMessage
from app.services.notion_mcp import notion_client

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
        conversation_history: list[ChatMessage],
    ) -> tuple[str, str | None]:
        """
        Process a chat message with memory capabilities.
        
        Returns:
            tuple of (response_text, memory_context)
        """
        memory_context = None

        async with notion_client.connect() as client:
            # Get Notion tools for function calling
            notion_tools = client.get_tools_for_gemini()
            
            # Build conversation for Gemini
            gemini_history = []
            for msg in conversation_history:
                gemini_history.append({
                    "role": "user" if msg.role == "user" else "model",
                    "parts": [msg.content],
                })

            # Create chat with tools
            tools = None
            if notion_tools:
                tools = self._convert_to_gemini_tools(notion_tools)

            chat = self.model.start_chat(history=gemini_history)
            
            # Send message with system prompt context
            full_message = f"{SYSTEM_PROMPT}\n\nUser: {message}"
            
            response = await self._generate_with_tools(
                chat, full_message, tools, client
            )
            
            return response, memory_context

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
        # Gemini expects a specific format
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
            # Handle union types - take first non-null
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

    async def _generate_with_tools(
        self,
        chat,
        message: str,
        tools: list | None,
        mcp_client,
        max_iterations: int = 10,
    ) -> str:
        """Generate response, handling tool calls iteratively."""
        
        generation_config = genai.GenerationConfig(
            temperature=0.7,
            max_output_tokens=2048,
        )
        
        current_message = message
        
        for _ in range(max_iterations):
            if tools:
                response = chat.send_message(
                    current_message,
                    generation_config=generation_config,
                    tools=tools,
                )
            else:
                response = chat.send_message(
                    current_message,
                    generation_config=generation_config,
                )
            
            # Check if there are function calls
            if not response.candidates:
                return "I apologize, but I couldn't generate a response."
            
            candidate = response.candidates[0]
            
            # Check for function calls in the response
            function_calls = []
            for part in candidate.content.parts:
                if hasattr(part, "function_call") and part.function_call:
                    function_calls.append(part.function_call)
            
            if not function_calls:
                # No function calls, return the text response
                return candidate.content.parts[0].text if candidate.content.parts else ""
            
            # Execute function calls
            function_responses = []
            for fc in function_calls:
                try:
                    # Convert protobuf to dict
                    args = dict(fc.args) if fc.args else {}
                    result = await mcp_client.call_tool(fc.name, args)
                    function_responses.append({
                        "name": fc.name,
                        "response": {"result": result},
                    })
                    logger.info(f"Called tool {fc.name} with args {args}")
                except Exception as e:
                    logger.error(f"Tool call failed: {e}")
                    function_responses.append({
                        "name": fc.name,
                        "response": {"error": str(e)},
                    })
            
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
        
        return "I apologize, but I reached the maximum number of tool calls."


# Singleton instance
gemini_agent = GeminiAgent()

