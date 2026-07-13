#!/bin/bash
# Health check script for MemoryLLM Server

SERVER_URL=${1:-"http://localhost:8000"}

echo "Checking backend health at $SERVER_URL..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health")

if [ "$STATUS" -eq 200 ]; then
    echo "✅ Backend is healthy and responding!"
    exit 0
else
    echo "❌ Backend is not reachable (HTTP $STATUS)"
    exit 1
fi
