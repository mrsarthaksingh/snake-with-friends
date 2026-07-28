# Snake With Friends

Multiplayer snake for up to **20 players per room**.

## Rules

- Steer with mouse / touch; hold click or Space to **boost**
- Eat glowing energy orbs to grow and raise your score
- Stay inside the **red arena border** — hit the wall and you die
- If your **head** hits another snake’s **body**, you die
- Dead snakes drop food; respawn anytime
- Live **leaderboard** shows top scores

## Rooms

Pick a **room code** (3–12 letters/numbers, e.g. `DELHI7`) so friends join the same arena.

Share a link:

```text
https://YOUR-HOST/?room=DELHI7
```

## Local play (same Wi‑Fi)

```bash
cd bingo/snake
npm install
npm start
```

- Local: `http://localhost:3848`
- LAN: `http://192.168.x.x:3848`

## Free public hosting (no credit card)

### Option A — Quick tunnel (instant, free, no signup)

One command starts the game + a public `https://….trycloudflare.com` link:

```bash
cd bingo/snake
chmod +x start-public.sh
./start-public.sh
```

Copy the URL from the terminal. Share `?room=YOURCODE`.  
Keep the terminal open while friends play. URL changes if you restart.

Requires: `brew install cloudflared` (or use `ngrok http 3848` if you already have ngrok).

### Option B — Belmo (permanent URL, free, no credit card)

Belmo offers a **free always-on** Node service with WebSockets, no card required:

1. Sign up at [belmo.io](https://belmo.io/deploy/nodejs)
2. Connect GitHub and deploy the `bingo/snake` folder
3. Set start command: `node server.js` (Belmo sets `PORT` automatically)
4. Pick a subdomain, e.g. `snake-with-friends`

### Option C — Render (permanent URL, free tier)

1. Push repo to GitHub.
2. [Render dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select `bingo/snake/render.yaml`.
3. Free tier sleeps after ~15 min idle (WebSockets disconnect until wake).

Render may ask for a card on some accounts; if so, use Option A or B.

## Fly.io (requires credit card)

Fly.io **requires a card on file** even for the $0 free tier. If you are OK adding a card (not charged unless you exceed limits):

```bash
fly auth login
cd bingo/snake
./deploy-fly.sh
```

Target URL: `https://snake-with-friends.fly.dev`

Port default is **3848** locally (`PORT` / `SNAKE_PORT` env overrides). Cloud hosts set `PORT` for you.
