# MemoryLLM

An AI chat application with persistent memory powered by Gemini and Notion MCP.

## Architecture

- **Client**: Next.js 14 with a ChatGPT-style interface
- **Server**: FastAPI with Gemini AI and Notion MCP integration
- **Memory**: Notion workspace acts as persistent memory for the AI agent

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm or pnpm
- A Google AI (Gemini) API key
- A Notion integration token

## Setup

### 1. Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the "Internal Integration Token"
4. Share the pages/databases you want the AI to access with your integration

### 2. Server Setup

```bash
cd server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e .

# Copy and configure environment
cp env.example .env
# Edit .env with your API keys:
# - GEMINI_API_KEY=your_gemini_api_key
# - NOTION_API_KEY=your_notion_integration_token

# Run the server
uvicorn app.main:app --reload --port 8000
```

### 3. Client Setup

```bash
cd client

# Install dependencies
npm install

# Run the development server
npm run dev
```

### 4. Access the App

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs

## Features

- **ChatGPT-style Interface**: Clean, modern chat UI
- **Persistent Memory**: AI can read/write to your Notion workspace
- **Conversation History**: Multiple chat sessions with history
- **Markdown Support**: Rich text formatting in responses

## API Endpoints

- `POST /api/v1/chat` - Send a message and get a response
- `GET /api/v1/chat/health` - Health check

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI API key for Gemini |
| `GEMINI_MODEL` | Gemini model to use (default: `gemini-2.0-flash`) |
| `NOTION_API_KEY` | Notion integration token |
| `DEBUG` | Enable debug mode (default: `false`) |
