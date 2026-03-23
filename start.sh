#!/bin/bash
# NineHertz Homepage — Start Script
# Requires Node 20+ (uses ~/.nvm/versions/node/v20.19.6/)

NODE20="$HOME/.nvm/versions/node/v20.19.6/bin/node"

echo ""
echo "🚀 Starting NineHertz Homepage..."
echo ""

# Check .env
if ! grep -qE '^ANTHROPIC_API_KEY=.+$' .env 2>/dev/null; then
  echo "⚠  ANTHROPIC_API_KEY not set in .env"
  echo "   The chatbot will show a config error until you add your key."
  echo "   Edit .env and set ANTHROPIC_API_KEY (from console.anthropic.com)."
  echo ""
fi

# Kill any existing processes on our ports
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Start backend
$NODE20 server.js &
SERVER_PID=$!
echo "✓ API server started (pid $SERVER_PID)"

sleep 1

# Start frontend
$NODE20 node_modules/.bin/vite &
VITE_PID=$!
echo "✓ Vite dev server started (pid $VITE_PID)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend → http://localhost:5173"
echo "  API      → http://localhost:3001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait and handle shutdown
trap "kill $SERVER_PID $VITE_PID 2>/dev/null; echo 'Servers stopped.'" SIGINT SIGTERM
wait
