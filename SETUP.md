# 🚀 Local Setup Guide

Quick guide to get MemoryLLM running on your machine.

## Prerequisites

- **Python 3.11+** - Check with: `python3 --version`
- **Node.js 18+** - Check with: `node --version`
- **npm** - Usually comes with Node.js
- **API Keys**:
  - Google Gemini API key: https://makersuite.google.com/app/apikey
  - Notion Integration Token: https://www.notion.so/my-integrations

---

## Step 1: Backend Setup

### 1.1 Navigate to server directory
```bash
cd server
```

### 1.2 Create Python virtual environment
```bash
# macOS/Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 1.3 Install dependencies
```bash
pip install -e .
```

### 1.4 Create environment file
```bash
cp env.example .env
```

### 1.5 Edit `.env` file

Open `server/.env` and fill in:

```bash
# Generate a secure key (run this command):
# openssl rand -hex 32
JWT_SECRET_KEY=paste-your-generated-key-here

# Get from https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Get from https://www.notion.so/my-integrations
NOTION_API_KEY=your_notion_integration_token_here
```

**Quick JWT key generation:**
```bash
openssl rand -hex 32
```
Copy the output and paste it as `JWT_SECRET_KEY` in your `.env` file.

### 1.6 Start the backend server
```bash
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

✅ **Backend is running!** Keep this terminal open.

---

## Step 2: Frontend Setup

### 2.1 Open a NEW terminal window

Keep the backend running in the first terminal.

### 2.2 Navigate to client directory
```bash
cd client
```

### 2.3 Install dependencies
```bash
npm install
```

This will install all required packages including the new ones (react-syntax-highlighter, etc.).

### 2.4 Create environment file
```bash
cp env.example .env.local
```

### 2.5 Edit `.env.local` file

Open `client/.env.local` - it should already have:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If it's correct, you don't need to change anything.

### 2.6 Start the frontend server
```bash
npm run dev
```

You should see:
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
```

✅ **Frontend is running!**

---

## Step 3: Access the Application

1. **Open your browser** and go to: http://localhost:3000
2. **Sign up** for a new account
3. **Start chatting!**

---

## Step 4: Verify Everything Works

### Check Backend API
- Visit: http://localhost:8000/docs
- You should see the Swagger API documentation

### Check Frontend
- Visit: http://localhost:3000
- You should see the login/signup page

---

## 🔑 Getting API Keys

### Google Gemini API Key

1. Go to: https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key
5. Paste it in `server/.env` as `GEMINI_API_KEY`

### Notion Integration Token

1. Go to: https://www.notion.so/my-integrations
2. Click "New integration"
3. Give it a name (e.g., "MemoryLLM")
4. Select your workspace
5. Click "Submit"
6. Copy the "Internal Integration Token"
7. Paste it in `server/.env` as `NOTION_API_KEY`

**Important:** After creating the Notion integration:
- Go to the Notion pages/databases you want the AI to access
- Click the "..." menu → "Add connections" → Select your integration

---

## 🐛 Troubleshooting

### Backend Issues

**Problem:** `ModuleNotFoundError` or import errors
```bash
# Make sure you're in the virtual environment
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Reinstall dependencies
pip install -e .
```

**Problem:** Database errors
```bash
# Delete the database file and restart
rm server/memoryllm.db
# Restart the server - it will recreate the database
```

**Problem:** Port 8000 already in use
```bash
# Use a different port
uvicorn app.main:app --reload --port 8001
# Then update client/.env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8001
```

### Frontend Issues

**Problem:** `npm install` fails
```bash
# Clear cache and try again
npm cache clean --force
npm install
```

**Problem:** Can't connect to backend
- Make sure backend is running on port 8000
- Check `client/.env.local` has correct URL
- Check browser console for CORS errors

**Problem:** Syntax highlighting not working
```bash
# Make sure you installed all dependencies
npm install
# The package.json includes react-syntax-highlighter
```

### General Issues

**Problem:** "Notion unavailable" in chat
- Check your `NOTION_API_KEY` is correct
- Make sure you shared pages with your integration
- Check backend logs for errors

**Problem:** Authentication errors
- Make sure `JWT_SECRET_KEY` is set in `.env`
- Try signing up again with a new account

---

## 📁 Project Structure

```
MemoryLLM/
├── server/
│   ├── .env              # ← Create this (copy from env.example)
│   ├── memoryllm.db      # ← Auto-created on first run
│   ├── uploads/          # ← Auto-created for file uploads
│   └── app/
├── client/
│   ├── .env.local        # ← Create this (copy from env.example)
│   └── src/
└── README.md
```

---

## 🎯 Quick Start Checklist

- [ ] Python 3.11+ installed
- [ ] Node.js 18+ installed
- [ ] Backend virtual environment created and activated
- [ ] Backend dependencies installed (`pip install -e .`)
- [ ] `server/.env` created with API keys
- [ ] Backend running on port 8000
- [ ] Frontend dependencies installed (`npm install`)
- [ ] `client/.env.local` created
- [ ] Frontend running on port 3000
- [ ] Browser opened to http://localhost:3000
- [ ] Account created and ready to chat!

---

## 🚀 Next Steps

Once everything is running:

1. **Sign up** for an account
2. **Create a conversation**
3. **Start chatting** - the AI will use Notion as memory!
4. **Try features:**
   - Voice input (microphone icon)
   - File attachments (paperclip icon)
   - Share conversations (share icon)
   - Export conversations (download icon)
   - Theme toggle (sun/moon icon)

---

## 💡 Tips

- **Keep both terminals open** - one for backend, one for frontend
- **Check terminal logs** if something doesn't work
- **API docs** are at http://localhost:8000/docs
- **Database** is automatically created - no setup needed!
- **File uploads** are stored in `server/uploads/`

---

Happy chatting! 🎉

