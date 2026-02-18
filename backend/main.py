from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
from dotenv import load_dotenv
import google.generativeai as genai
from notion_mcp_client import NotionMCPClient

load_dotenv()

app = FastAPI(title="MemoryLLM Backend")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment variables")

genai.configure(api_key=GEMINI_API_KEY)

# Initialize Notion MCP Client
notion_client = NotionMCPClient(
    notion_api_key=os.getenv("NOTION_API_KEY"),
    database_id=os.getenv("NOTION_DATABASE_ID")
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []

class ChatResponse(BaseModel):
    response: str

@app.get("/")
async def root():
    return {"message": "MemoryLLM Backend API", "status": "running"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        # Get relevant context from Notion
        context = await notion_client.get_relevant_context(request.message)
        
        # Build conversation history for Gemini
        conversation_history = []
        for msg in request.history:
            conversation_history.append({
                "role": msg.role,
                "parts": [msg.content]
            })
        
        # Add system context from Notion
        system_prompt = f"""You are a helpful AI assistant with access to a Notion database for memory.
        
Context from previous conversations:
{context}

Use this context to provide more informed and personalized responses. If the context is relevant, reference it naturally in your response."""

        # Create Gemini model
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=system_prompt
        )
        
        # Start chat with history
        chat = model.start_chat(history=conversation_history)
        
        # Send message and get response
        response = chat.send_message(request.message)
        assistant_response = response.text
        
        # Store the conversation in Notion
        await notion_client.store_conversation(
            user_message=request.message,
            assistant_response=assistant_response
        )
        
        return ChatResponse(response=assistant_response)
    
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "gemini": "connected" if GEMINI_API_KEY else "not configured",
        "notion": "connected" if notion_client.is_connected() else "not configured"
    }






