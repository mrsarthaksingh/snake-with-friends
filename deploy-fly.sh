#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Snake With Friends · Fly.io deploy ==="
echo ""
echo "Note: Fly.io requires a credit card on file even for the free tier"
echo "(you are not charged unless you exceed free limits)."
echo "For no-card hosting, use: ./start-public.sh or Belmo (see README)."
echo ""

if ! command -v flyctl >/dev/null 2>&1; then
  echo "Install flyctl: brew install flyctl"
  exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: fly auth login"
  exit 1
fi

if ! flyctl apps list 2>/dev/null | grep -q 'snake-with-friends'; then
  flyctl apps create snake-with-friends --org personal
fi

flyctl deploy --ha=false

echo ""
echo "Live at: https://snake-with-friends.fly.dev"
echo "Share:   https://snake-with-friends.fly.dev/?room=YOURCODE"
