# MemoryLLM

An AI chat application with persistent memory using Google Gemini and Notion. The app features a ChatGPT-like interface built with Next.js, backed by a Python FastAPI server that connects Gemini to Notion via MCP (Model Context Protocol) for conversation memory storage.

## Features

- 🤖 **Gemini AI Integration**: Powered by Google's Gemini 1.5 Pro model
- 📝 **Notion Memory**: Conversations are stored in Notion for persistent memory
- 💬 **Modern Chat UI**: Beautiful ChatGPT-like interface with dark mode support
- 🔄 **Conversation Context**: AI can reference previous conversations stored in Notion
- ⚡ **Real-time Responses**: Fast and responsive chat experience

## Project Structure

```
MemoryLLM/
├── frontend/                 # Next.js frontend application
│   ├── app/
│   │   ├── layout.tsx       # Root layout with metadata
│   │   ├── page.tsx         # Main chat interface
│   │   └── globals.css      # Global styles with Tailwind
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── next.config.js
├── backend/                  # Python FastAPI backend
│   ├── main.py              # FastAPI server with chat endpoint
│   ├── notion_mcp_client.py # Notion MCP integration
│   └── requirements.txt     # Python dependencies
└── README.md
```

## Prerequisites

- Node.js 18+ and npm/yarn
- Python 3.9+
- Google Gemini API key
- Notion API key and database

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment and activate it:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file from the example:
```bash
cp .env.example .env
```

5. Edit `.env` and add your API keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_notion_database_id_here
```

6. Start the backend server:
```bash
uvicorn main:app --reload --port 8000
```

The backend will be running at `http://localhost:8000`

### 2. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file:
```bash
cp .env.example .env.local
```

4. Start the development server:
```bash
npm run dev
```

The frontend will be running at `http://localhost:3000`

## Getting API Keys

### Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the key to your `.env` file

### Notion Setup
1. Go to [Notion Developers](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the Internal Integration Token (this is your `NOTION_API_KEY`)
4. Create a database in Notion with the following properties:
   - **User Message** (Title)
   - **Assistant Response** (Text)
   - **Timestamp** (Date)
5. Share the database with your integration
6. Copy the database ID from the URL (32-character string)
7. Add both values to your `.env` file

## Usage

1. Open your browser to `http://localhost:3000`
2. Start chatting with the AI
3. Your conversations will be automatically stored in Notion
4. The AI can reference previous conversations for context

## MCP Integration

The backend uses the Model Context Protocol (MCP) to communicate with Notion. The `NotionMCPClient` class handles:

- **Reading context**: Searches previous conversations for relevant context
- **Writing conversations**: Stores each chat turn in the Notion database
- **Memory retrieval**: Provides conversation history to Gemini for more informed responses

## Tech Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **React Markdown**: Markdown rendering for AI responses
- **Lucide React**: Beautiful icon set
- **Axios**: HTTP client for API calls

### Backend
- **FastAPI**: Modern Python web framework
- **Google Generative AI**: Gemini integration
- **MCP**: Model Context Protocol for Notion
- **Pydantic**: Data validation
- **python-dotenv**: Environment variable management

## API Endpoints

### POST `/api/chat`
Send a message to the AI and get a response.

**Request:**
```json
{
  "message": "Hello, how are you?",
  "history": [
    {"role": "user", "content": "Previous message"},
    {"role": "assistant", "content": "Previous response"}
  ]
}
```

**Response:**
```json
{
  "response": "I'm doing well, thank you for asking!"
}
```

### GET `/api/health`
Check the health status of the backend services.

**Response:**
```json
{
  "status": "healthy",
  "gemini": "connected",
  "notion": "connected"
}
```

## Development

### Running Tests
```bash
# Backend tests (when implemented)
cd backend
pytest

# Frontend tests (when implemented)
cd frontend
npm test
```

### Building for Production

**Frontend:**
```bash
cd frontend
npm run build
npm start
```

**Backend:**
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Troubleshooting

### Backend Issues
- **Import errors**: Make sure you're in the virtual environment
- **API key errors**: Verify your `.env` file has the correct keys
- **Notion connection**: Ensure your integration has access to the database

### Frontend Issues
- **Connection refused**: Make sure the backend is running on port 8000
- **CORS errors**: Check that CORS is properly configured in `main.py`

## Future Enhancements

- [ ] User authentication
- [ ] Multiple conversation threads
- [ ] Conversation search
- [ ] Export conversations
- [ ] Advanced memory search with embeddings
- [ ] File upload support
- [ ] Voice input/output

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues and questions, please open an issue on the GitHub repository.
