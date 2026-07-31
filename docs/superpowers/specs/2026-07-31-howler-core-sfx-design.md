# Core SFX with self-hosted Howler

## Goal
Add short gameplay sound effects without external CDN dependency (Render/Railway serve static files from the same origin).

## Library
- **Howler.js 2.2.4** (MIT), vendored at `public/vendor/howler.min.js`
- License copy: `public/vendor/HOWLER-LICENSE.md`

## Scope (v1)
SFX only — no music:
- `eat` — local score increase while alive
- `boost` — boost pressed (edge trigger)
- `death` — `died` message
- `kill` — kill feed where local player is killer
- `round_start` — match phase enters `countdown`
- `orb_rain` — active banner / event name Orb Rain

## Assets
Procedurally generated WAV tones in `public/sounds/` (original, free to ship).

## UX
- Mute toggle in HUD + lobby (persist `localStorage` key `snakeSfxMuted`)
- Unlock audio on first pointer/key interaction (browser autoplay policy)
- Missing Howler or files must not break gameplay

## Non-goals
- Music loops
- Spatial audio
- External CDN / Render CDN
