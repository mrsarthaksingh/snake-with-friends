# Game Modes Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Add Single / Multiplayer / Arena mode selection on join with mode-sticky rooms, mode-aware bots, and Arena-only chaos rounds.

**Architecture:** Room stores sticky `mode`. Join validates mode + capacity. `desiredBotCount(room)` becomes mode-aware. Client picks mode before enter; HUD gates Start round / match UI to Arena.

**Tech Stack:** Node.js server (`server.js`, `match.js`), vanilla JS client (`public/game.js`, `index.html`, `styles.css`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-31-game-modes-design.md`

## Global Constraints

- Modes: `single` | `multi` | `arena` only
- Single: 10 bots, 1 human max
- Multi: bots only if humans &lt; 5; desired = `min(4, 5 - humans)`
- Arena: 0 bots; startRound requires ≥ 2 humans
- Old `?room=` without mode → `multi`
- Never label bots on the wire

---

### Task 1: Pure mode helpers + tests

**Files:**
- Create: `game-mode.js`
- Create: `game-mode.test.js`

- [ ] Export `normalizeMode`, `desiredBotCountForMode(mode, humanCount)`, `canStartArena(humanCount)`, error messages
- [ ] Unit tests for bot counts and single capacity rules

### Task 2: Server room.mode + join + bots

**Files:**
- Modify: `server.js` (getOrCreateRoom, join, maintainBots, startRound)
- Modify: `Dockerfile` if new file must be copied

- [ ] Room created with `mode` from first joiner
- [ ] Reject mode mismatch / second human in single
- [ ] Private room id for single when client omits room
- [ ] `desiredBotCount` uses helper; strip bots in arena
- [ ] Ignore `startRound` unless mode === arena

### Task 3: Client lobby + HUD

**Files:**
- Modify: `public/index.html`, `public/styles.css`, `public/game.js`

- [ ] Mode picker UI + blurb
- [ ] Hide room for single; show for multi/arena
- [ ] Join sends `mode`; URL `mode` + `room`
- [ ] HUD: Start round + match pills only in arena; SOLO label in single

### Task 4: Verify + ship

- [ ] `npm test` green
- [ ] Manual mental check of edge cases from spec
- [ ] Merge to `main` when user wants deploy
