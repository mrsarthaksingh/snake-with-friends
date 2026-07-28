#!/usr/bin/env bash
# Free public URL — no signup, no credit card.
# URL changes each run. Keep this terminal open while friends play.

set -euo pipefail
cd "$(dirname "$0")"

PORT="${SNAKE_PORT:-3848}"
export PORT

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Install cloudflared: brew install cloudflared"
  exit 1
fi

echo "Starting Snake With Friends on port ${PORT}…"
node server.js &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1

echo ""
echo "Opening free public tunnel (trycloudflare.com)…"
echo "Copy the https://….trycloudflare.com URL below and share: ?room=YOURCODE"
echo ""

cloudflared tunnel --url "http://127.0.0.1:${PORT}"
