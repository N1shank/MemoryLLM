# MemoryLLM

An AI chat application with persistent memory powered by Gemini and Notion MCP.

## Architecture

- **Client**: Next.js 14 with a modern chat interface
- **Server**: FastAPI with Gemini AI and Notion MCP integration
- **Database**: SQLite (file-based, no setup required!)
- **Auth**: JWT-based authentication
- **Memory**: Notion workspace acts as persistent memory for the AI agent

## Features

- **User Authentication**: Sign up, login, and secure sessions with JWT
- **Real-time Streaming**: Responses stream token-by-token for instant feedback
- **Conversation Management**: Create, rename, and delete chat sessions
- **Persistent Memory**: AI can read/write to your Notion workspace
- **Memory Activity Display**: See when the AI accesses Notion
- **Mobile Responsive**: Works great on all devices

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm or pnpm
- A Google AI (Gemini) API key
- A Notion integration token

## Setup

### 1. Database Setup (SQLite - Zero Configuration!)

**Good news!** MemoryLLM uses SQLite, which requires **no setup**. The database file (`memoryllm.db`) is created automatically when you start the server for the first time.

If you want to use a different location, you can set the `DATABASE_URL` in your `.env` file:

```bash
# Default (created in server directory)
DATABASE_URL=sqlite+aiosqlite:///./memoryllm.db

# Custom location example
DATABASE_URL=sqlite+aiosqlite:////path/to/your/database.db
```

### 2. Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the "Internal Integration Token"
4. Share the pages/databases you want the AI to access with your integration

### 3. Server Setup

```bash
cd server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e .

# Copy and configure environment
cp env.example .env
```

Edit `.env` with your API keys:

```bash
# REQUIRED: Generate a secure key for production
JWT_SECRET_KEY=your-secure-random-key-here

# REQUIRED: Get from https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key

# REQUIRED: Get from https://www.notion.so/my-integrations
NOTION_API_KEY=your_notion_integration_token
```

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

### 4. Client Setup

```bash
cd client

# Install dependencies
npm install

# Copy and configure environment
cp env.example .env.local
```

Edit `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the development server:

```bash
npm run dev
```

### 5. Access the App

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/signup` | Register a new user |
| POST | `/api/v1/auth/login` | Login and get JWT token |
| GET | `/api/v1/auth/me` | Get current user profile |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/conversations` | List all conversations |
| POST | `/api/v1/conversations` | Create a new conversation |
| GET | `/api/v1/conversations/{id}` | Get conversation with messages |
| PATCH | `/api/v1/conversations/{id}` | Rename a conversation |
| DELETE | `/api/v1/conversations/{id}` | Delete a conversation |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat` | Send a message (returns complete response) |
| POST | `/api/v1/chat/stream` | Send a message (streams response via SSE) |
| GET | `/api/v1/chat/health` | Health check |

## Environment Variables

### Server (`server/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `DEBUG` | Enable debug mode | No (default: false) |
| `DATABASE_URL` | SQLite database URL | No (default: `sqlite+aiosqlite:///./memoryllm.db`) |
| `JWT_SECRET_KEY` | Secret key for JWT tokens | **Yes** (change in production!) |
| `JWT_ALGORITHM` | JWT algorithm | No (default: HS256) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry in minutes | No (default: 10080 = 7 days) |
| `GEMINI_API_KEY` | Google AI API key for Gemini | **Yes** |
| `GEMINI_MODEL` | Gemini model to use | No (default: `gemini-2.0-flash`) |
| `NOTION_API_KEY` | Notion integration token | **Yes** |
| `CORS_ORIGINS` | Allowed frontend origins | No (default: `["http://localhost:3000"]`) |

### Client (`client/.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | **Yes** |

## Security Notes

1. **Generate a secure JWT secret** for production:
   ```bash
   openssl rand -hex 32
   ```

2. **Never commit `.env` files** to version control

3. **Use HTTPS** in production

4. **Update CORS_ORIGINS** to match your production frontend URL

## Development

### Running Tests

```bash
# Backend
cd server
pip install -e ".[dev]"
pytest

# Frontend
cd client
npm run lint
```

### Project Structure

```
MemoryLLM/
├── client/                 # Next.js frontend
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── contexts/      # React contexts (Auth)
│   │   └── lib/           # API client, config
│   └── ...
├── server/                 # FastAPI backend
│   ├── app/
│   │   ├── core/          # Config, DB, security, deps
│   │   ├── models/        # SQLAlchemy models
│   │   ├── routes/        # API endpoints
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/      # Business logic (Gemini, Notion)
│   └── ...
└── README.md
```

## License

MIT
