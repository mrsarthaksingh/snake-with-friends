# Game Modes Design — Single / Multiplayer / Arena

Date: 2026-07-31  
Status: approved — implementing

## Goal

Split the current mixed freeroam+bots+optional-round experience into three clear modes chosen **before** joining, so players know what kind of game they are entering.

## Approach

**Mode on join (Approach A):** lobby shows Single / Multiplayer / Arena first. Each mode has its own room rules for bots, start button, and death.

## Mode definitions

| Mode | Who | Bots | Core loop |
|------|-----|------|-----------|
| **Single** | Only you (private room) | Always **10** bots (within 8–12 target; fixed at 10 for v1) | Freeroam. Die → Play again / respawn. No Start round. |
| **Multiplayer** | Friends via room code | Bots only while human count **&lt; 5**; target bot fill = `max(0, 5 - humans)` capped so room stays playable (max bots still respects `MAX_PLAYERS`) | Freeroam. Die → respawn. No forced match. |
| **Arena** | Friends only | **Zero bots always** | Waiting → host starts when **≥ 2 humans** → countdown → timed chaos round → death = spectate → podium → waiting. |

### Locked decisions

- Arena: friends together, **no bots**.
- Multiplayer: hybrid bots — only if fewer than **5** humans.
- Single: fuller lobby — **~8–12 bots** (v1 constant **10**).
- Arena start: same as today — **≥ 2** humans.
- Lobby: pick mode first, then name/skin/(room).

## Lobby UX

1. Mode picker (required): **Single** | **Multiplayer** | **Arena** with one-line blurbs:
   - Single — “Practice vs bots”
   - Multiplayer — “Play with friends”
   - Arena — “Timed match. Friends only. No bots.”
2. Shared fields: name, skin, SFX/Full.
3. Room code:
   - **Hidden** for Single (server assigns a private unique room id).
   - **Shown** for Multiplayer and Arena (default random/code; share `?room=` + `?mode=`).
4. Enter arena button joins with `{ mode, name, skinId, roomId? }`.

### Share links

- Multiplayer: `/?mode=multi&room=CODE`
- Arena: `/?mode=arena&room=CODE`
- Single: no share requirement; if someone opens a Single link they get a **new** private Single room (not joinable by friends).

If `?room=` is present without mode, default mode = **multi** (backward compatible with today’s friend links).

## Room rules (server)

Room is created with a sticky `mode` on first join. Later joins must match that mode or receive a clear error (“This room is Arena — pick Arena to join”).

### Bot maintenance

| Mode | Desired bots |
|------|----------------|
| `single` | `10` |
| `multi` | `humans < 5 ? min(4, 5 - humans) : 0` — v1: fill up to keep lobby feeling alive but never above 4 bots; remove all bots when humans ≥ 5 |
| `arena` | `0` (and strip any existing bots immediately) |

Notes:

- Bots never appear on the wire as bots (`isBot: false` remains).
- When Multiplayer crosses 5 humans, remove bots gracefully (prefer removing dead bots first).
- Single rooms: reject additional human joins (capacity 1 human). If a second human tries to join, error: “Single mode is solo — use Multiplayer.”

### Match / Start round

| Mode | Start round button | Match system |
|------|--------------------|--------------|
| Single | Hidden | Match stays `waiting`; ignore `startRound` |
| Multiplayer | Hidden | Match stays `waiting`; ignore `startRound` |
| Arena | Visible when phase=`waiting` and humans ≥ 2 | Existing chaos match (countdown, events, shrink, podium) |

### Death

| Mode | On death |
|------|----------|
| Single / Multiplayer | Freeroam: death overlay + Play again / respawn (today’s waiting freeroam path) |
| Arena during countdown/playing/podium | Spectate until round returns to waiting, then Play again (existing round rules) |

## HUD

- Always: score, kills, players, ping, room (except Single may show “SOLO” instead of room code).
- **Start round**: Arena only.
- Match timer / event teaser: Arena only (when match active).
- Leaderboard: all modes; kills display as `N kills`.

## Edge cases

1. **Mode mismatch on join** → reject with error string; client returns to lobby with mode preselected.
2. **Arena with 1 human** → can sit in waiting freeroam?  
   **v1 decision:** Arena waiting with 1 human is allowed (warmup freeroam, no bots). Start disabled until 2+. Death in Arena waiting = freeroam respawn.
3. **Friend opens old `?room=X` link** → treat as Multiplayer.
4. **Host leaves Arena mid-round** → round continues for remaining participants (existing behavior).
5. **Max players** → still 20 total seats; Single uses 1 human + 10 bots.

## Non-goals (v1)

- Ranked / Elo
- Bot difficulty settings
- Mid-room mode switching
- Separate deployables / URLs per mode (`/single` etc.)
- Showing “BOT” labels on snakes

## Implementation sketch (after approval)

1. Add `room.mode`: `'single' | 'multi' | 'arena'`.
2. Join payload includes `mode`; validate against room.
3. Replace global `desiredBotCount()` with mode-aware function.
4. Gate `startRound` + match ticking side effects for non-arena (or no-op start).
5. Lobby UI: mode pills + conditional room field + blurbs.
6. URL: read/write `mode` + `room`.
7. Tests: bot counts per mode; Arena rejects bots; Single rejects 2nd human; startRound ignored outside Arena.

## Success criteria

- Player can tell which mode they picked in under 2 seconds from lobby copy.
- Arena never has bots.
- Multiplayer with 5+ friends has zero bots.
- Single feels populated (~10 snakes on map).
- Existing room share links still work (as Multiplayer).
