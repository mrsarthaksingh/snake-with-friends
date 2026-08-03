'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinOverlay = document.getElementById('joinOverlay');
const deathOverlay = document.getElementById('deathOverlay');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const roomField = document.getElementById('roomField');
const roomHint = document.getElementById('roomHint');
const modeBlurb = document.getElementById('modeBlurb');
const statusLine = document.getElementById('statusLine');
const hud = document.getElementById('hud');
const leaderboardEl = document.getElementById('leaderboard');
const scorePill = document.getElementById('scorePill');
const killsPill = document.getElementById('killsPill');
const roomPill = document.getElementById('roomPill');
const playersPill = document.getElementById('playersPill');
const pingPill = document.getElementById('pingPill');
const deathScore = document.getElementById('deathScore');
const deathLine = document.getElementById('deathLine');
const deathTitle = document.getElementById('deathTitle');
const respawnButton = document.getElementById('respawnButton');
const killFeed = document.getElementById('killFeed');
const deathAnnounce = document.getElementById('deathAnnounce');
const deathAnnounceLine = document.getElementById('deathAnnounceLine');
const snakePicker = document.getElementById('snakePicker');
const skinNameEl = document.getElementById('skinName');
const radarCanvas = document.getElementById('radar');
const radarCtx = radarCanvas.getContext('2d');
const powerPill = document.getElementById('powerPill');
const boostButton = document.getElementById('boostButton');
const emoteBar = document.getElementById('emoteBar');
const startRoundButton = document.getElementById('startRoundButton');
const matchTimerPill = document.getElementById('matchTimerPill');
const matchEventTeaser = document.getElementById('matchEventTeaser');
const eventBanner = document.getElementById('eventBanner');
const eventBannerText = document.getElementById('eventBannerText');
const podiumOverlay = document.getElementById('podiumOverlay');
const podiumList = document.getElementById('podiumList');
const spectateNote = document.getElementById('spectateNote');
const muteButtonHud = document.getElementById('muteButtonHud');
const muteButtonLobby = document.getElementById('muteButtonLobby');
const fullscreenButtonHud = document.getElementById('fullscreenButtonHud');
const fullscreenButtonLobby = document.getElementById('fullscreenButtonLobby');
/** @type {{ width: number, height: number }} */
let viewportSize = {
  width: Math.max(1, window.innerWidth || 1),
  height: Math.max(1, window.innerHeight || 1),
};

const FOOD_DRAW_RADIUS = 1500;

const SNAKE_SKINS = (globalThis.SnakeSkins && globalThis.SnakeSkins.SKINS) || [];
const SKIN_BY_ID = (globalThis.SnakeSkins && globalThis.SnakeSkins.SKIN_BY_ID) || {};
const EMOTE_CATALOG = (globalThis.SnakeEmotes && globalThis.SnakeEmotes.EMOTES) || [];
const EMOTE_COOLDOWN_MS = (globalThis.SnakeEmotes && globalThis.SnakeEmotes.EMOTE_COOLDOWN_MS) || 2000;
const EMOTE_FLOAT_MS = (globalThis.SnakeEmotes && globalThis.SnakeEmotes.EMOTE_FLOAT_MS) || 2000;
const SnakeArena = globalThis.SnakeArena || {};
const SHRINK_PREVIEW_MS = 20_000;

/** @type {WebSocket | null} */
let socket = null;
/** Bumps whenever a new socket is created so stale close/open handlers are ignored. */
let socketGeneration = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimer = null;
/** @type {string | null} */
let playerId = null;
/** @type {string} */
let playerName = '';
/** @type {string} */
let currentRoomId = 'LOBBY';
/** @type {string} */
let selectedSkinId = SNAKE_SKINS[0] ? SNAKE_SKINS[0].id : 'viper_green';
/** @type {object | null} */
let latestState = null;
let stateTime = 0;
let pointerX = 0;
let pointerY = 0;
let boosting = false;
let mapSize = 5000;
let joined = false;
/** @type {number | null} */
let keyboardAngle = null;
/** @type {{ x: number, y: number }} */
let smoothCamera = { x: 2500, y: 2500 };
let smoothZoom = 0.85;
let lastFrameTime = performance.now();
let skinAnimPhase = 0;
let lastHudUpdate = 0;
let pingMs = null;
let awaitingPong = false;
let tickRate = 30;
let netRate = 30;
let baseSpeed = 9;
let boostMultiplier = 2.2;
let speedPowerMultiplier = 2.1;
let radarFrame = 0;
/** @type {Map<string, { headX: number, headY: number, angle: number, beads: { x: number, y: number }[] }>} */
const renderBodyById = new Map();
/** Must match server `SEGMENT_SPACING` — used to recover true body length from score. */
const SERVER_SEGMENT_SPACING = 9;
/** Cap render beads so huge snakes stay smooth without melting the CPU. */
const MAX_RENDER_BEADS = 700;

/**
 * Bead centers must stay closer than 2× radius or the body looks like gappy dots
 * when the snake thickens. Target ~55% diameter overlap.
 */
function spacingForSnake(player) {
  const radius = Math.max(6, Number(player.radius) || 7);
  return Math.max(3.2, radius * 0.45);
}

function pathLengthForSegments(segments) {
  if (!segments || segments.length < 2) {
    return 0;
  }
  let total = 0;
  for (let index = 1; index < segments.length; index += 1) {
    total += Math.hypot(
      segments[index].x - segments[index - 1].x,
      segments[index].y - segments[index - 1].y,
    );
  }
  return total;
}

function desiredBeadCount(player) {
  const spacing = spacingForSnake(player);
  // Prefer the actual wire path length so a huge score with a capped body
  // does not invent thousands of phantom beads.
  const pathLength = pathLengthForSegments(player.segments);
  if (pathLength > 0) {
    return Math.max(1, Math.min(MAX_RENDER_BEADS, Math.floor(pathLength / spacing) + 1));
  }
  const scoreParts = Math.max(
    1,
    Math.floor(Number.isFinite(player.score) ? player.score : 1),
  );
  const bodyLength = Math.max(SERVER_SEGMENT_SPACING, (scoreParts - 1) * SERVER_SEGMENT_SPACING);
  return Math.max(1, Math.min(MAX_RENDER_BEADS, Math.floor(bodyLength / spacing) + 1));
}
let boostHeldByButton = false;
let boostHeldByPointer = false;
let lastSelfScore = 0;
let localKillCount = 0;
let wasBoosting = false;
let lastMatchPhase = '';
let lastEventBannerName = '';
/** @type {Map<string, { emoji: string, startedAt: number }>} */
const activeEmotesByPlayerId = new Map();
let emoteCooldownUntil = 0;

function setKillsPill(count) {
  if (!killsPill) {
    return;
  }
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  localKillCount = Math.max(localKillCount, safe);
  killsPill.textContent = `Kills ${localKillCount}`;
}

function playSfx(soundId) {
  if (globalThis.SnakeSfx && typeof globalThis.SnakeSfx.play === 'function') {
    globalThis.SnakeSfx.play(soundId);
  }
}

function syncMuteButtons() {
  const isMuted = Boolean(globalThis.SnakeSfx && globalThis.SnakeSfx.isMuted());
  const label = isMuted ? 'Mute' : 'SFX';
  const aria = isMuted ? 'Unmute sound' : 'Mute sound';
  for (const button of [muteButtonHud, muteButtonLobby]) {
    if (!button) {
      continue;
    }
    button.textContent = label;
    button.title = aria;
    button.setAttribute('aria-label', aria);
    button.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    button.classList.toggle('muted', isMuted);
  }
}

function bindMuteButtons() {
  const onToggle = () => {
    if (globalThis.SnakeSfx && typeof globalThis.SnakeSfx.toggleMuted === 'function') {
      globalThis.SnakeSfx.unlock();
      globalThis.SnakeSfx.toggleMuted();
      syncMuteButtons();
    }
  };
  if (muteButtonHud) {
    muteButtonHud.addEventListener('click', onToggle);
  }
  if (muteButtonLobby) {
    muteButtonLobby.addEventListener('click', onToggle);
  }
  syncMuteButtons();
}

function bindLandscapePreference() {
  const tryLock = () => {
    requestLandscapeLock();
  };
  window.addEventListener('pointerdown', tryLock, { passive: true });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(resize, 120);
  });
  if (joinForm) {
    joinForm.addEventListener('submit', tryLock);
  }
}
let activePointerId = null;

function syncBoosting() {
  boosting = boostHeldByButton || boostHeldByPointer;
  if (boostButton) {
    boostButton.classList.toggle('active', boosting);
  }
  if (boosting && !wasBoosting) {
    playSfx('boost');
  }
  wasBoosting = boosting;
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function easeOutCubic(value) {
  const t = Math.min(1, Math.max(0, value));
  return 1 - (1 - t) ** 3;
}

function getSelectedSkin() {
  return SKIN_BY_ID[selectedSkinId] || SNAKE_SKINS[0] || {
    id: 'viper_green',
    name: 'Viper Green',
    color: '#2ecc71',
    style: 'solid',
    premium: false,
  };
}

function skinPreviewBackground(skin) {
  if (isPremiumSkin(skin)) {
    const tertiary = skin.tertiary || skin.accent || skin.color;
    return `linear-gradient(135deg, ${skin.color} 0%, ${skin.accent || skin.color} 45%, ${tertiary} 100%)`;
  }
  if (skin.accent) {
    return `linear-gradient(135deg, ${skin.color} 35%, ${skin.accent} 100%)`;
  }
  return skin.color;
}

/** @type {Map<string, { r: number, g: number, b: number }>} */
const skinRgbCache = new Map();

function skinRgb(hex) {
  const key = String(hex || '#ffffff');
  const cached = skinRgbCache.get(key);
  if (cached) {
    return cached;
  }
  const value = key.replace('#', '');
  const parsed = {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
  skinRgbCache.set(key, parsed);
  return parsed;
}

function mixSkinHex(hexA, hexB, amount) {
  const left = skinRgb(hexA);
  const right = skinRgb(hexB);
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(left.r + (right.r - left.r) * t);
  const g = Math.round(left.g + (right.g - left.g) * t);
  const b = Math.round(left.b + (right.b - left.b) * t);
  return `rgb(${r},${g},${b})`;
}

function isAnimatedSkin(skin) {
  return Boolean(skin && typeof skin.anim === 'string' && skin.anim.length > 0);
}

function renderSnakePicker() {
  snakePicker.innerHTML = '';
  SNAKE_SKINS.forEach((skin) => {
    const button = document.createElement('button');
    button.type = 'button';
    const animClass = isAnimatedSkin(skin) ? ` skin-animated skin-anim-${skin.anim}` : '';
    button.className =
      `skin-option${skin.id === selectedSkinId ? ' selected' : ''}${skin.premium ? ' premium' : ''}${animClass}`;
    button.style.background = skinPreviewBackground(skin);
    const animLabel = isAnimatedSkin(skin) ? ' · Animated' : '';
    button.title = skin.premium ? `${skin.name} · Free premium${animLabel}` : `${skin.name}${animLabel}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', skin.id === selectedSkinId ? 'true' : 'false');
    button.addEventListener('click', () => {
      selectedSkinId = skin.id;
      skinNameEl.textContent = skin.premium
        ? `★ ${skin.name} · Free${isAnimatedSkin(skin) ? ' · Live' : ''}`
        : skin.name;
      renderSnakePicker();
    });
    snakePicker.appendChild(button);
  });
  const selected = getSelectedSkin();
  skinNameEl.textContent = selected.premium
    ? `★ ${selected.name} · Free${isAnimatedSkin(selected) ? ' · Live' : ''}`
    : selected.name;
}

function normalizeRoomId(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

/** @type {'single' | 'multi' | 'arena'} */
let selectedGameMode = 'multi';

const MODE_BLURBS = Object.freeze({
  single: 'Private practice room with a full bot lobby. No friends can join.',
  multi: 'Share a room code with friends. Bots fill in until 5 humans join.',
  arena: 'Timed chaos match with friends only. No bots. Need 2 players to start.',
});

function normalizeGameMode(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'single' || value === 'solo') {
    return 'single';
  }
  if (value === 'arena' || value === 'match') {
    return 'arena';
  }
  if (value === 'multi' || value === 'multiplayer' || value === 'mp') {
    return 'multi';
  }
  return 'multi';
}

function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeRoomId(params.get('room'));
}

function readModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  if (modeParam) {
    return normalizeGameMode(modeParam);
  }
  // Old share links with only ?room= stay Multiplayer.
  if (params.get('room')) {
    return 'multi';
  }
  return 'multi';
}

function updateShareUrl(roomId, mode = selectedGameMode) {
  const url = new URL(window.location.href);
  const safeMode = normalizeGameMode(mode);
  if (safeMode === 'single') {
    url.searchParams.delete('room');
    url.searchParams.set('mode', 'single');
  } else {
    url.searchParams.set('room', roomId);
    url.searchParams.set('mode', safeMode);
  }
  window.history.replaceState({}, '', url);
}

function updateRoomPill(roomId, mode = selectedGameMode) {
  if (!roomPill) {
    return;
  }
  if (normalizeGameMode(mode) === 'single') {
    roomPill.textContent = 'SOLO';
    return;
  }
  roomPill.textContent = `Room ${roomId}`;
}

function getSelectedGameMode() {
  const checked = document.querySelector('input[name="gameMode"]:checked');
  return normalizeGameMode(checked ? checked.value : selectedGameMode);
}

function syncModeLobbyUi() {
  selectedGameMode = getSelectedGameMode();
  const isSingle = selectedGameMode === 'single';
  if (roomField) {
    roomField.classList.toggle('room-field-hidden', isSingle);
  }
  if (roomInput) {
    roomInput.disabled = isSingle;
    roomInput.required = !isSingle;
  }
  if (roomHint) {
    if (isSingle) {
      roomHint.innerHTML = 'Solo practice — a private room is created for you.';
    } else if (selectedGameMode === 'arena') {
      roomHint.innerHTML =
        'Friends join with the same code — share <strong>?room=YOURCODE&amp;mode=arena</strong>';
    } else {
      roomHint.innerHTML =
        'Friends join with the same code — share <strong>?room=YOURCODE&amp;mode=multi</strong>';
    }
  }
  if (modeBlurb) {
    modeBlurb.textContent = MODE_BLURBS[selectedGameMode] || MODE_BLURBS.multi;
  }
}

function bindModePicker() {
  const inputs = document.querySelectorAll('input[name="gameMode"]');
  for (const input of inputs) {
    input.addEventListener('change', () => {
      syncModeLobbyUi();
    });
  }
  syncModeLobbyUi();
}

function setSelectedGameMode(mode) {
  const safe = normalizeGameMode(mode);
  const input = document.querySelector(`input[name="gameMode"][value="${safe}"]`);
  if (input) {
    input.checked = true;
  }
  selectedGameMode = safe;
  syncModeLobbyUi();
}

function getJoinPayload() {
  const mode = getSelectedGameMode();
  const roomFromInput = roomInput ? normalizeRoomId(roomInput.value) : '';
  const roomId =
    mode === 'single'
      ? currentRoomId || 'SOLO'
      : roomFromInput.length >= 3
        ? roomFromInput
        : currentRoomId || 'LOBBY';
  const skin = getSelectedSkin();
  return {
    name: playerName || nameInput.value.trim(),
    color: skin.color,
    skinId: skin.id,
    roomId,
    mode,
  };
}

function readViewportSize() {
  const visual = window.visualViewport;
  if (visual && visual.width >= 2 && visual.height >= 2) {
    return {
      width: Math.max(1, Math.round(visual.width)),
      height: Math.max(1, Math.round(visual.height)),
    };
  }
  return {
    width: Math.max(1, window.innerWidth || 1),
    height: Math.max(1, window.innerHeight || 1),
  };
}

function resize() {
  viewportSize = readViewportSize();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.floor(viewportSize.width * dpr);
  canvas.height = Math.floor(viewportSize.height * dpr);
  canvas.style.width = `${viewportSize.width}px`;
  canvas.style.height = `${viewportSize.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function isFullscreenActive() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement,
  );
}

function syncFullscreenButtons() {
  const active = isFullscreenActive();
  const label = active ? 'Exit' : 'Full';
  const aria = active ? 'Exit fullscreen' : 'Enter fullscreen';
  for (const button of [fullscreenButtonHud, fullscreenButtonLobby]) {
    if (!button) {
      continue;
    }
    button.textContent = label;
    button.title = aria;
    button.setAttribute('aria-label', aria);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('active-full', active);
  }
}

async function enterFullscreen() {
  if (isFullscreenActive()) {
    return true;
  }
  const root = document.documentElement;
  try {
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } else if (typeof root.webkitRequestFullscreen === 'function') {
      root.webkitRequestFullscreen();
    } else if (typeof root.msRequestFullscreen === 'function') {
      root.msRequestFullscreen();
    } else {
      return false;
    }
    requestLandscapeLock();
    resize();
    syncFullscreenButtons();
    return true;
  } catch {
    return false;
  }
}

async function exitFullscreen() {
  if (!isFullscreenActive()) {
    return;
  }
  try {
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
    } else if (typeof document.webkitExitFullscreen === 'function') {
      document.webkitExitFullscreen();
    } else if (typeof document.msExitFullscreen === 'function') {
      document.msExitFullscreen();
    }
  } catch {
    // Ignore — button state refreshes on fullscreenchange.
  }
}

async function toggleFullscreen() {
  if (isFullscreenActive()) {
    await exitFullscreen();
  } else {
    await enterFullscreen();
  }
  syncFullscreenButtons();
}

function bindFullscreenControls() {
  const onToggle = () => {
    void toggleFullscreen();
  };
  if (fullscreenButtonHud) {
    fullscreenButtonHud.addEventListener('click', onToggle);
  }
  if (fullscreenButtonLobby) {
    fullscreenButtonLobby.addEventListener('click', onToggle);
  }
  document.addEventListener('fullscreenchange', () => {
    resize();
    syncFullscreenButtons();
    requestLandscapeLock();
  });
  document.addEventListener('webkitfullscreenchange', () => {
    resize();
    syncFullscreenButtons();
    requestLandscapeLock();
  });
  syncFullscreenButtons();
}

function connect() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const generation = socketGeneration + 1;
  socketGeneration = generation;
  const nextSocket = new WebSocket(`${protocol}://${window.location.host}`);
  socket = nextSocket;
  statusLine.textContent = 'Connecting…';
  nextSocket.addEventListener('open', () => {
    if (generation !== socketGeneration || socket !== nextSocket) {
      return;
    }
    statusLine.textContent = 'Connected · enter a name to play';
    sendPing();
  });
  nextSocket.addEventListener('close', () => {
    if (generation !== socketGeneration || socket !== nextSocket) {
      return;
    }
    statusLine.textContent = 'Disconnected · retrying…';
    joined = false;
    hud.hidden = true;
    deathOverlay.hidden = true;
    joinOverlay.hidden = false;
    pingMs = null;
    awaitingPong = false;
    updatePingPill();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1000);
  });
  nextSocket.addEventListener('message', (event) => {
    if (generation !== socketGeneration || socket !== nextSocket) {
      return;
    }
    const message = JSON.parse(String(event.data));
    handleMessage(message);
  });
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN || awaitingPong) {
    return;
  }
  awaitingPong = true;
  send({ type: 'ping', t: performance.now() });
}

function updatePingPill() {
  if (!pingPill) {
    return;
  }
  if (pingMs == null) {
    pingPill.textContent = 'Ping —';
    pingPill.className = 'pill ping';
    return;
  }
  const rounded = Math.round(pingMs);
  pingPill.textContent = `Ping ${rounded} ms`;
  pingPill.className =
    rounded < 40 ? 'pill ping good' :
    rounded < 90 ? 'pill ping ok' :
    'pill ping bad';
}

function inflateSegments(flat) {
  if (!Array.isArray(flat) || flat.length === 0) {
    return [];
  }
  if (typeof flat[0] === 'object') {
    return flat;
  }
  const segments = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    segments.push({ x: flat[index], y: flat[index + 1] });
  }
  return segments;
}

function inflateFoods(rawFoods) {
  if (!Array.isArray(rawFoods) || rawFoods.length === 0) {
    return [];
  }
  if (!Array.isArray(rawFoods[0])) {
    return rawFoods;
  }
  return rawFoods.map((entry) => ({
    id: entry[0],
    x: entry[1],
    y: entry[2],
    radius: entry[3],
    color: entry[4],
    kind: entry[5],
  }));
}

function inflateState(message) {
  return {
    ...message,
    mapSize: message.mapSize || mapSize,
    players: (message.players || []).map((player) => ({
      ...player,
      segments: inflateSegments(player.segments),
    })),
    foods: inflateFoods(message.foods),
    leaderboard: message.leaderboard || [],
  };
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

function syncEmoteCooldownUi(now = performance.now()) {
  const cooling = now < emoteCooldownUntil;
  if (!emoteBar) {
    return;
  }
  emoteBar.classList.toggle('cooling', cooling);
  for (const button of emoteBar.querySelectorAll('.emote-btn')) {
    button.disabled = cooling;
  }
}

function startEmoteCooldown() {
  emoteCooldownUntil = performance.now() + EMOTE_COOLDOWN_MS;
  syncEmoteCooldownUi();
}

function queueEmoteBubble(targetPlayerId, emoji) {
  if (!targetPlayerId || !emoji) {
    return;
  }
  activeEmotesByPlayerId.set(targetPlayerId, {
    emoji,
    startedAt: performance.now(),
  });
}

function sendEmote(emoteId) {
  if (!joined || !emoteId) {
    return;
  }
  if (performance.now() < emoteCooldownUntil) {
    return;
  }
  const emote = EMOTE_CATALOG.find((entry) => entry.id === emoteId);
  if (!emote) {
    return;
  }
  send({ type: 'emote', emoteId });
  startEmoteCooldown();
  if (playerId) {
    queueEmoteBubble(playerId, emote.emoji);
  }
}

function buildEmoteBar() {
  if (!emoteBar || EMOTE_CATALOG.length === 0) {
    return;
  }
  emoteBar.replaceChildren();
  EMOTE_CATALOG.forEach((emote, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emote-btn';
    button.textContent = emote.emoji;
    button.title = `${emote.label} (${index + 1})`;
    button.setAttribute('aria-label', emote.label);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      sendEmote(emote.id);
    });
    emoteBar.appendChild(button);
  });
}

function drawFloatingEmotes(state, camera, zoom, now) {
  for (const [targetPlayerId, bubble] of [...activeEmotesByPlayerId.entries()]) {
    const age = now - bubble.startedAt;
    if (age > EMOTE_FLOAT_MS) {
      activeEmotesByPlayerId.delete(targetPlayerId);
      continue;
    }
    const player = state.players.find((entry) => entry.id === targetPlayerId);
    if (!player || !player.segments || player.segments.length === 0) {
      continue;
    }
    const radius = Math.max(4, (player.radius || 7) * zoom);
    const head = worldToScreen(player.segments[0], camera, zoom);
    const progress = age / EMOTE_FLOAT_MS;
    const floatY = progress * 42;
    const fadeIn = Math.min(1, age / 120);
    const fadeOut = progress > 0.78 ? 1 - (progress - 0.78) / 0.22 : 1;
    const alpha = fadeIn * fadeOut;
    const pop = progress < 0.15 ? 0.85 + (progress / 0.15) * 0.35 : 1;
    const fontSize = Math.max(18, radius * 1.35) * pop;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.emoji, head.x, head.y - radius - 18 - floatY);
    ctx.restore();
  }
  syncEmoteCooldownUi(now);
}

function isCompactMobileUi() {
  return window.matchMedia('(max-width: 920px) and (orientation: landscape)').matches
    || window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches
    || window.matchMedia('(max-width: 720px)').matches;
}

function requestLandscapeLock() {
  const orientation = window.screen && window.screen.orientation;
  if (!orientation || typeof orientation.lock !== 'function') {
    return;
  }
  const isPhoneLike = window.matchMedia('(max-width: 920px), (max-height: 500px)').matches;
  if (!isPhoneLike) {
    return;
  }
  // Orientation lock usually only works while fullscreen on mobile browsers.
  orientation.lock('landscape').catch(() => {
    // Rotate gate still guides users when the lock is denied.
  });
}

function pushKillFeed(line) {
  if (!line || !killFeed) {
    return;
  }
  const item = document.createElement('div');
  item.className = 'kill-feed-item';
  item.textContent = line;
  killFeed.prepend(item);
  const maxItems = isCompactMobileUi() ? 2 : 8;
  while (killFeed.children.length > maxItems) {
    const oldest = killFeed.lastElementChild;
    if (oldest) {
      killFeed.removeChild(oldest);
    }
  }
  window.setTimeout(() => {
    if (item.parentNode !== killFeed) {
      return;
    }
    item.classList.add('leaving');
    window.setTimeout(() => {
      if (item.parentNode === killFeed) {
        killFeed.removeChild(item);
      }
    }, 320);
  }, 6500);
}

/** @type {{ line: string }[]} */
const deathAnnounceQueue = [];
let isAnnouncingDeath = false;

function enqueueDeathAnnounce(line) {
  if (!line || !deathAnnounce || !deathAnnounceLine) {
    return;
  }
  deathAnnounceQueue.push({ line });
  pumpDeathAnnounce();
}

function pumpDeathAnnounce() {
  if (isAnnouncingDeath || deathAnnounceQueue.length === 0) {
    return;
  }
  isAnnouncingDeath = true;
  const next = deathAnnounceQueue.shift();
  deathAnnounceLine.textContent = next.line;
  deathAnnounce.classList.remove('leaving');
  deathAnnounce.hidden = false;
  window.setTimeout(() => {
    deathAnnounce.classList.add('leaving');
    window.setTimeout(() => {
      deathAnnounce.hidden = true;
      deathAnnounce.classList.remove('leaving');
      isAnnouncingDeath = false;
      pumpDeathAnnounce();
    }, 280);
  }, 3200);
}

function showFunnyDeath(line) {
  pushKillFeed(line);
  // Phone: skip the big center toast — it covers the snake. Feed only.
  if (!isCompactMobileUi()) {
    enqueueDeathAnnounce(line);
  }
}

function formatRemaining(ms) {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateMatchUi(matchState, players) {
  if (!matchState) {
    return;
  }
  const now = Date.now();
  const self = players.find((p) => p.id === playerId);
  const isSpectating = Boolean(self && self.spectating);
  if (matchState.phase === 'countdown' && lastMatchPhase !== 'countdown') {
    playSfx('round_start');
  }
  lastMatchPhase = matchState.phase;
  if (matchState.activeBanner && matchState.activeBanner.name) {
    const bannerName = String(matchState.activeBanner.name);
    if (bannerName !== lastEventBannerName && /orb rain/i.test(bannerName)) {
      playSfx('orb_rain');
    }
    lastEventBannerName = bannerName;
  } else {
    lastEventBannerName = '';
  }
  if (spectateNote) {
    spectateNote.hidden = !isSpectating;
  }
  const isArenaMode =
    normalizeGameMode(latestState?.mode || selectedGameMode) === 'arena';
  if (startRoundButton) {
    startRoundButton.hidden = !(
      isArenaMode &&
      matchState.phase === 'waiting' &&
      matchState.humanCount >= 2
    );
  }
  const showTimer =
    isArenaMode && (matchState.phase === 'countdown' || matchState.phase === 'playing');
  if (matchTimerPill) {
    matchTimerPill.hidden = !showTimer;
    if (showTimer) {
      matchTimerPill.textContent =
        matchState.phase === 'countdown'
          ? `Start ${formatRemaining(matchState.phaseEndsAt - now)}`
          : `Round ${formatRemaining(matchState.phaseEndsAt - now)}`;
    }
  }
  if (matchEventTeaser) {
    if (isArenaMode && matchState.phase === 'playing') {
      if (matchState.nextShrink && matchState.nextShrink.startsInMs <= SHRINK_PREVIEW_MS) {
        matchEventTeaser.hidden = false;
        matchEventTeaser.textContent =
          `Safe zone → ${matchState.nextShrink.percent}% in ${formatRemaining(matchState.nextShrink.startsInMs)}`;
      } else if (matchState.nextEvent) {
        matchEventTeaser.hidden = false;
        matchEventTeaser.textContent =
          `${matchState.nextEvent.name} in ${formatRemaining(matchState.nextEvent.startsInMs)}`;
      } else {
        matchEventTeaser.hidden = true;
      }
    } else {
      matchEventTeaser.hidden = true;
    }
  }
  if (eventBanner && eventBannerText) {
    if (matchState.activeBanner && now < matchState.activeBanner.untilMs) {
      eventBanner.hidden = false;
      eventBannerText.textContent = matchState.activeBanner.name;
    } else {
      eventBanner.hidden = true;
    }
  }
  if (podiumOverlay && podiumList) {
    if (isArenaMode && matchState.phase === 'podium') {
      podiumOverlay.hidden = false;
      deathOverlay.hidden = true;
      podiumList.innerHTML = '';
      for (const entry of (matchState.podium || []).slice(0, 3)) {
        const li = document.createElement('li');
        li.textContent = `#${entry.place} ${entry.name} — ${entry.score} (${entry.kills} kills)`;
        podiumList.appendChild(li);
      }
    } else {
      podiumOverlay.hidden = true;
      // After podium (or mid-round spectate), freeroam waiting must offer Play again.
      if (
        matchState.phase === 'waiting' &&
        joined &&
        self &&
        !self.alive &&
        deathOverlay.hidden
      ) {
        deathTitle.textContent = 'Back to freeroam';
        deathLine.textContent = 'Round ended — drop back in whenever you want.';
        deathScore.textContent = `Score ${Math.floor(self.score || 0)}`;
        deathOverlay.hidden = false;
      }
    }
  }
  if (spectateNote) {
    spectateNote.hidden = !(isSpectating && matchState.phase !== 'waiting');
  }
  if (isSpectating && matchState.phase !== 'waiting') {
    respawnButton.disabled = true;
    respawnButton.textContent = 'Wait for next round';
  } else {
    respawnButton.disabled = false;
    respawnButton.textContent = 'Play again';
  }
}

function handleMessage(message) {
  switch (message.type) {
    case 'hello':
      mapSize = message.mapSize;
      if (typeof message.tickRate === 'number') tickRate = message.tickRate;
      if (typeof message.netRate === 'number') netRate = message.netRate;
      if (typeof message.baseSpeed === 'number') baseSpeed = message.baseSpeed;
      if (typeof message.boostMultiplier === 'number') boostMultiplier = message.boostMultiplier;
      if (typeof message.speedPowerMultiplier === 'number') {
        speedPowerMultiplier = message.speedPowerMultiplier;
      }
      if (typeof message.defaultRoomId === 'string' && roomInput && !roomInput.value.trim()) {
        roomInput.value = message.defaultRoomId;
        currentRoomId = message.defaultRoomId;
      }
      statusLine.textContent = 'Connected · choose a mode and enter';
      break;
    case 'joined':
      playerId = message.playerId;
      playerName = message.name;
      mapSize = message.mapSize;
      if (typeof message.mode === 'string') {
        setSelectedGameMode(message.mode);
      }
      if (typeof message.roomId === 'string') {
        currentRoomId = message.roomId;
        if (roomInput && selectedGameMode !== 'single') {
          roomInput.value = message.roomId;
        }
        updateShareUrl(message.roomId, selectedGameMode);
        updateRoomPill(message.roomId, selectedGameMode);
      }
      joined = true;
      joinOverlay.hidden = true;
      deathOverlay.hidden = true;
      hud.hidden = false;
      if (emoteBar) {
        emoteBar.hidden = false;
      }
      activeEmotesByPlayerId.clear();
      emoteCooldownUntil = 0;
      syncEmoteCooldownUi();
      smoothCamera = { x: mapSize / 2, y: mapSize / 2 };
      smoothZoom = 0.85;
      renderBodyById.clear();
      lastSelfScore = 0;
      localKillCount = 0;
      lastMatchPhase = '';
      lastEventBannerName = '';
      setKillsPill(0);
      if (globalThis.SnakeSfx) {
        globalThis.SnakeSfx.unlock();
      }
      sendPing();
      break;
    case 'state': {
      latestState = inflateState(message);
      stateTime = performance.now();
      updateMatchUi(message.match, message.players);
      const self = getSelfSnake(latestState);
      if (self && self.alive) {
        const nextScore = Number(self.score) || 0;
        if (nextScore > lastSelfScore && lastSelfScore > 0) {
          playSfx('eat');
        }
        lastSelfScore = nextScore;
      } else if (self && !self.alive) {
        smoothCamera = { x: mapSize / 2, y: mapSize / 2 };
        lastSelfScore = 0;
      }
      scorePill.textContent = `Score ${self && self.alive ? self.score : 0}`;
      if (self && typeof self.kills === 'number') {
        setKillsPill(self.kills);
      }
      playersPill.textContent = formatPlayersPill(latestState);
      if (stateTime - lastHudUpdate > 250) {
        lastHudUpdate = stateTime;
        renderLeaderboard(latestState);
      } else if (self && self.alive) {
        const active = [];
        if (self.hasSpeed) active.push('Speed');
        if (self.hasShield) active.push('Shield');
        if (self.hasMagnet) active.push('Magnet');
        powerPill.hidden = active.length === 0;
        if (active.length > 0) {
          powerPill.textContent = active.join(' · ');
        }
      }
      break;
    }
    case 'pong':
      if (typeof message.t === 'number') {
        pingMs = Math.max(0, performance.now() - message.t);
        updatePingPill();
      }
      awaitingPong = false;
      break;
    case 'died':
      playSfx('death');
      deathTitle.textContent = message.cause === 'wall' ? 'Border said no' : 'Got cooked';
      deathLine.textContent = message.line || 'Oof.';
      deathScore.textContent = `Score ${message.score}`;
      joinOverlay.hidden = true;
      smoothCamera = getArenaCameraCenter();
      if (!podiumOverlay || podiumOverlay.hidden) {
        deathOverlay.hidden = false;
      }
      break;
    case 'spectating':
      smoothCamera = getArenaCameraCenter();
      smoothZoom = isCircularArenaState() ? 0.52 : 0.7;
      respawnButton.disabled = true;
      respawnButton.textContent = 'Wait for next round';
      if (spectateNote) {
        spectateNote.hidden = false;
      }
      break;
    case 'killFeed': {
      const isMyKill =
        message.cause === 'snake' &&
        (
          (typeof message.killerId === 'string' && message.killerId === playerId) ||
          (typeof message.killerName === 'string' && message.killerName === playerName)
        );
      if (isMyKill) {
        playSfx('kill');
        if (typeof message.killerKills === 'number') {
          setKillsPill(message.killerKills);
        } else {
          setKillsPill(localKillCount + 1);
        }
      }
      if (message.cause === 'event' && /orb rain/i.test(String(message.line || ''))) {
        playSfx('orb_rain');
      }
      showFunnyDeath(message.line);
      break;
    }
    case 'emote':
      if (typeof message.playerId === 'string' && typeof message.emoji === 'string') {
        queueEmoteBubble(message.playerId, message.emoji);
        if (message.playerId === playerId) {
          startEmoteCooldown();
        }
      }
      break;
    case 'error':
      statusLine.textContent = message.message;
      break;
    default:
      break;
  }
}

function formatPlayersPill(state) {
  const humans = state.playerCount ?? 0;
  const max = state.maxPlayers ?? 20;
  return `${humans} / ${max}`;
}

function renderLeaderboard(state) {
  const limit = isCompactMobileUi() ? 3 : 10;
  const rows = state.leaderboard
    .slice(0, limit)
    .map((entry, index) => {
      const isYou = entry.id === playerId;
      const kills = Math.max(0, Math.floor(entry.kills || 0));
      return `<li class="${isYou ? 'you' : ''}">
        <span class="name"><span class="dot" style="background:${entry.color}"></span>${index + 1}. ${escapeHtml(entry.name)}</span>
        <span class="lb-stats"><span class="lb-score">${entry.score}</span><span class="lb-kills">${kills} ${kills === 1 ? 'kill' : 'kills'}</span></span>
      </li>`;
    })
    .join('');
  leaderboardEl.innerHTML = `<h3>Leaderboard</h3><ol>${rows || '<li><span class="name">Waiting…</span></li>'}</ol>`;
  const self = state.players.find((player) => player.id === playerId);
  scorePill.textContent = `Score ${self && self.alive ? self.score : 0}`;
  playersPill.textContent = formatPlayersPill(state);
  if (self && self.alive) {
    const active = [];
    if (self.hasSpeed) active.push('Speed');
    if (self.hasShield) active.push('Shield');
    if (self.hasMagnet) active.push('Magnet');
    if (active.length > 0) {
      powerPill.hidden = false;
      powerPill.textContent = active.join(' · ');
    } else {
      powerPill.hidden = true;
    }
  } else {
    powerPill.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getSelfSnake(state) {
  return state.players.find((player) => player.id === playerId) ?? null;
}

function lerpAngle(from, to, amount) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
}

function getArenaCameraCenter() {
  if (SnakeArena.arenaCenter) {
    return SnakeArena.arenaCenter(mapSize);
  }
  return { x: mapSize / 2, y: mapSize / 2 };
}

function shouldUseSpectatorCamera(authSelf) {
  if (!authSelf) {
    return true;
  }
  if (!authSelf.alive || authSelf.spectating) {
    return true;
  }
  return !authSelf.segments || authSelf.segments.length === 0;
}

/**
 * Resample points evenly along a polyline so thinned server paths still
 * draw at full score-based length (fixes "stopped growing" + invisible tails).
 * @param {{ x: number, y: number }[]} points
 * @param {number} count
 * @returns {{ x: number, y: number }[]}
 */
function resamplePolyline(points, count) {
  if (count <= 0) {
    return [];
  }
  if (points.length === 0) {
    return [];
  }
  if (points.length === 1 || count === 1) {
    return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
  }
  const segmentLengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const span = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    segmentLengths.push(span);
    total += span;
  }
  if (total < 0.0001) {
    return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
  }
  const result = new Array(count);
  result[0] = { x: points[0].x, y: points[0].y };
  for (let bead = 1; bead < count; bead += 1) {
    const target = (bead / (count - 1)) * total;
    let walked = 0;
    let placed = false;
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const nextWalk = walked + segmentLengths[index];
      if (target <= nextWalk || index === segmentLengths.length - 1) {
        const span = segmentLengths[index] || 1;
        const t = Math.min(1, Math.max(0, (target - walked) / span));
        const from = points[index];
        const to = points[index + 1];
        result[bead] = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        };
        placed = true;
        break;
      }
      walked = nextWalk;
    }
    if (!placed) {
      const last = points[points.length - 1];
      result[bead] = { x: last.x, y: last.y };
    }
  }
  return result;
}

/**
 * Local snake: smooth head follow (stable camera).
 * Remote snakes: densify server path so collision body matches what you see.
 */
function buildRenderState(deltaMs) {
  if (!latestState) {
    return null;
  }
  const headFollow = 1 - Math.exp(-deltaMs / 60);
  const pathFollow = 1 - Math.exp(-deltaMs / 48);
  const seen = new Set();
  const players = latestState.players.map((player) => {
    seen.add(player.id);
    if (!player.alive || player.segments.length === 0) {
      renderBodyById.delete(player.id);
      return player;
    }
    const targetHead = player.segments[0];
    const desiredCount = desiredBeadCount(player);
    const beadSpacing = spacingForSnake(player);
    const isSelf = player.id === playerId;
    let body = renderBodyById.get(player.id);
    if (!isSelf) {
      const pathBeads = resamplePolyline(player.segments, desiredCount);
      if (!body || body.beads.length === 0) {
        body = {
          headX: pathBeads[0].x,
          headY: pathBeads[0].y,
          angle: player.angle,
          beads: pathBeads,
        };
        renderBodyById.set(player.id, body);
      } else {
        while (body.beads.length < desiredCount) {
          const tip = body.beads[body.beads.length - 1] ?? pathBeads[pathBeads.length - 1];
          body.beads.push({ x: tip.x, y: tip.y });
        }
        while (body.beads.length > desiredCount) {
          body.beads.pop();
        }
        for (let index = 0; index < desiredCount; index += 1) {
          const target = pathBeads[index] ?? pathBeads[pathBeads.length - 1];
          const current = body.beads[index] ?? target;
          body.beads[index] = {
            x: lerp(current.x, target.x, pathFollow),
            y: lerp(current.y, target.y, pathFollow),
          };
        }
        body.headX = body.beads[0].x;
        body.headY = body.beads[0].y;
        body.angle = lerpAngle(body.angle, player.angle, pathFollow);
      }
      return {
        ...player,
        segments: body.beads,
        angle: body.angle,
      };
    }
    if (!body || body.beads.length === 0) {
      body = {
        headX: targetHead.x,
        headY: targetHead.y,
        angle: player.angle,
        beads: resamplePolyline(player.segments, desiredCount),
      };
      renderBodyById.set(player.id, body);
    } else {
      const gapX = targetHead.x - body.headX;
      const gapY = targetHead.y - body.headY;
      if (gapX * gapX + gapY * gapY > 260 * 260) {
        body.headX = targetHead.x;
        body.headY = targetHead.y;
        body.angle = player.angle;
        body.beads = resamplePolyline(player.segments, desiredCount);
      } else {
        body.headX = lerp(body.headX, targetHead.x, headFollow);
        body.headY = lerp(body.headY, targetHead.y, headFollow);
        body.angle = lerpAngle(body.angle, player.angle, headFollow);
      }
    }
    while (body.beads.length < desiredCount) {
      const tip = body.beads[body.beads.length - 1] ?? { x: body.headX, y: body.headY };
      body.beads.push({ x: tip.x, y: tip.y });
    }
    while (body.beads.length > desiredCount) {
      body.beads.pop();
    }
    body.beads[0] = { x: body.headX, y: body.headY };
    const bodyClampRadius = Math.max(4, (player.radius || 7) * 0.9);
    for (let index = 1; index < body.beads.length; index += 1) {
      const previous = body.beads[index - 1];
      const current = body.beads[index];
      let dx = current.x - previous.x;
      let dy = current.y - previous.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 0.0001) {
        dx = -Math.cos(body.angle);
        dy = -Math.sin(body.angle);
        dist = 1;
      }
      body.beads[index] = clampRenderPointToArena(
        {
          x: previous.x + (dx / dist) * beadSpacing,
          y: previous.y + (dy / dist) * beadSpacing,
        },
        bodyClampRadius,
      );
    }
    return {
      ...player,
      segments: body.beads,
      angle: body.angle,
    };
  });
  for (const id of renderBodyById.keys()) {
    if (!seen.has(id)) {
      renderBodyById.delete(id);
    }
  }
  return { ...latestState, players, foods: latestState.foods };
}

function isCircularArenaState(state = latestState) {
  if (!state) {
    return false;
  }
  if (state.match?.arenaShape === 'circle') {
    return true;
  }
  return normalizeGameMode(state.mode || selectedGameMode) === 'arena';
}

function getArenaRadiusRatio(state = latestState) {
  const ratio = state?.match?.arenaRadiusRatio;
  return typeof ratio === 'number' && ratio > 0 ? ratio : 1;
}

function clampRenderPointToArena(point, radius) {
  const ratio = getArenaRadiusRatio();
  if (isCircularArenaState()) {
    const clamp = SnakeArena.clampPointToCircle;
    if (typeof clamp === 'function') {
      return clamp(point, radius, mapSize, ratio);
    }
  }
  const edge = (SnakeArena.BORDER_PADDING || 8) + Math.max(0, radius);
  const min = edge;
  const max = mapSize - edge;
  return {
    x: Math.min(max, Math.max(min, point.x)),
    y: Math.min(max, Math.max(min, point.y)),
  };
}

function drawCircleStroke(centerWorld, radiusWorld, camera, zoom, strokeStyle, lineWidth, dashed = false) {
  const center = worldToScreen(centerWorld, camera, zoom);
  const radius = radiusWorld * zoom;
  ctx.beginPath();
  if (dashed) {
    ctx.setLineDash([12 * zoom, 10 * zoom]);
  }
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  if (dashed) {
    ctx.setLineDash([]);
  }
}

function drawCircularArena(camera, zoom, state) {
  const width = viewportSize.width;
  const height = viewportSize.height;
  const ratio = getArenaRadiusRatio(state);
  const centerWorld = SnakeArena.arenaCenter
    ? SnakeArena.arenaCenter(mapSize)
    : { x: mapSize / 2, y: mapSize / 2 };
  const playableR = SnakeArena.playableRadius
    ? SnakeArena.playableRadius(mapSize, ratio)
    : mapSize / 2;
  const center = worldToScreen(centerWorld, camera, zoom);
  const screenR = playableR * zoom;

  ctx.fillStyle = '#050d18';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(120, 20, 30, 0.38)';
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(center.x, center.y, screenR, 0, Math.PI * 2, true);
  ctx.fill('evenodd');

  const grid = 80;
  const startX = Math.floor((camera.x - width / zoom / 2) / grid) * grid;
  const startY = Math.floor((camera.y - height / zoom / 2) / grid) * grid;
  const endX = camera.x + width / zoom / 2 + grid;
  const endY = camera.y + height / zoom / 2 + grid;
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, screenR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#050d18';
  ctx.fillRect(center.x - screenR, center.y - screenR, screenR * 2, screenR * 2);
  ctx.strokeStyle = 'rgba(120, 160, 220, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += grid) {
    const a = worldToScreen({ x, y: startY }, camera, zoom);
    const b = worldToScreen({ x, y: endY }, camera, zoom);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = startY; y <= endY; y += grid) {
    const a = worldToScreen({ x: startX, y }, camera, zoom);
    const b = worldToScreen({ x: endX, y }, camera, zoom);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();

  const preview = state?.match?.nextShrink;
  if (
    preview &&
    typeof preview.radiusRatio === 'number' &&
    preview.startsInMs <= SHRINK_PREVIEW_MS
  ) {
    const previewR = SnakeArena.playableRadius(mapSize, preview.radiusRatio);
    drawCircleStroke(
      centerWorld,
      previewR,
      camera,
      zoom,
      'rgba(125, 255, 179, 0.9)',
      Math.max(2, 4 * zoom),
      true,
    );
  }

  drawCircleStroke(centerWorld, playableR, camera, zoom, '#ff4d4d', Math.max(3, 6 * zoom));
  drawCircleStroke(centerWorld, playableR, camera, zoom, 'rgba(255, 77, 77, 0.25)', Math.max(10, 18 * zoom));
}

function drawRectArena(camera, zoom) {
  const width = viewportSize.width;
  const height = viewportSize.height;
  const arenaMin = 0;
  const arenaMax = mapSize;
  const topLeft = worldToScreen({ x: arenaMin, y: arenaMin }, camera, zoom);
  const bottomRight = worldToScreen({ x: arenaMax, y: arenaMax }, camera, zoom);
  const arenaX = topLeft.x;
  const arenaY = topLeft.y;
  const arenaW = bottomRight.x - topLeft.x;
  const arenaH = bottomRight.y - topLeft.y;
  ctx.fillStyle = 'rgba(120, 20, 30, 0.35)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#050d18';
  ctx.fillRect(arenaX, arenaY, arenaW, arenaH);
  const grid = 80;
  const startX = Math.floor((camera.x - width / zoom / 2) / grid) * grid;
  const startY = Math.floor((camera.y - height / zoom / 2) / grid) * grid;
  const endX = camera.x + width / zoom / 2 + grid;
  const endY = camera.y + height / zoom / 2 + grid;
  ctx.save();
  ctx.beginPath();
  ctx.rect(arenaX, arenaY, arenaW, arenaH);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120, 160, 220, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += grid) {
    const a = worldToScreen({ x, y: startY }, camera, zoom);
    const b = worldToScreen({ x, y: endY }, camera, zoom);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = startY; y <= endY; y += grid) {
    const a = worldToScreen({ x: startX, y }, camera, zoom);
    const b = worldToScreen({ x: endX, y }, camera, zoom);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = Math.max(3, 6 * zoom);
  ctx.strokeRect(arenaX, arenaY, arenaW, arenaH);
  ctx.strokeStyle = 'rgba(255, 77, 77, 0.25)';
  ctx.lineWidth = Math.max(10, 18 * zoom);
  ctx.strokeRect(arenaX, arenaY, arenaW, arenaH);
}

function worldToScreen(point, camera, zoom) {
  return {
    x: (point.x - camera.x) * zoom + viewportSize.width / 2,
    y: (point.y - camera.y) * zoom + viewportSize.height / 2,
  };
}

function drawBackground(camera, zoom) {
  const width = viewportSize.width;
  const height = viewportSize.height;
  ctx.fillStyle = '#050d18';
  ctx.fillRect(0, 0, width, height);
  if (isCircularArenaState()) {
    drawCircularArena(camera, zoom, latestState);
    return;
  }
  drawRectArena(camera, zoom);
}

function drawRadar(state) {
  const size = radarCanvas.width;
  const padding = 8;
  const playSize = size - padding * 2;
  radarCtx.clearRect(0, 0, size, size);
  radarCtx.fillStyle = 'rgba(5, 13, 24, 0.95)';
  radarCtx.fillRect(0, 0, size, size);
  const circular = isCircularArenaState(state);
  const ratio = getArenaRadiusRatio(state);
  if (circular && SnakeArena.playableRadius) {
    const maxR = SnakeArena.playableRadius(mapSize, 1);
    const currentR = SnakeArena.playableRadius(mapSize, ratio);
    const center = padding + playSize / 2;
    const scale = playSize / (maxR * 2);
    radarCtx.strokeStyle = 'rgba(255, 77, 77, 0.85)';
    radarCtx.lineWidth = 2;
    radarCtx.beginPath();
    radarCtx.arc(center, center, currentR * scale, 0, Math.PI * 2);
    radarCtx.stroke();
    const preview = state.match?.nextShrink;
    if (preview && preview.startsInMs <= SHRINK_PREVIEW_MS) {
      radarCtx.strokeStyle = 'rgba(125, 255, 179, 0.75)';
      radarCtx.setLineDash([4, 4]);
      radarCtx.beginPath();
      radarCtx.arc(center, center, preview.radiusRatio * maxR * scale, 0, Math.PI * 2);
      radarCtx.stroke();
      radarCtx.setLineDash([]);
    }
    const alivePlayers = state.players.filter((player) => player.alive && player.segments.length > 0);
    const mapCenter = SnakeArena.arenaCenter ? SnakeArena.arenaCenter(mapSize) : { x: mapSize / 2, y: mapSize / 2 };
    for (const player of alivePlayers) {
      const head = player.segments[0];
      const x = center + (head.x - mapCenter.x) * scale;
      const y = center + (head.y - mapCenter.y) * scale;
      const isYou = player.id === playerId;
      const dot = isYou ? 5.5 : 3.8;
      radarCtx.beginPath();
      radarCtx.fillStyle = player.color;
      radarCtx.arc(x, y, dot, 0, Math.PI * 2);
      radarCtx.fill();
      if (isYou) {
        radarCtx.strokeStyle = '#ffffff';
        radarCtx.lineWidth = 1.5;
        radarCtx.stroke();
        radarCtx.beginPath();
        radarCtx.strokeStyle = '#ffffff';
        radarCtx.moveTo(x, y);
        radarCtx.lineTo(x + Math.cos(player.angle) * 9, y + Math.sin(player.angle) * 9);
        radarCtx.stroke();
      }
    }
    return;
  }
  const arenaMin = 0;
  const arenaMax = mapSize;
  const arenaSpan = arenaMax - arenaMin;
  radarCtx.strokeStyle = 'rgba(255, 77, 77, 0.85)';
  radarCtx.lineWidth = 2;
  radarCtx.strokeRect(padding, padding, playSize, playSize);
  radarCtx.strokeStyle = 'rgba(120, 160, 220, 0.12)';
  radarCtx.lineWidth = 1;
  for (let index = 1; index < 4; index += 1) {
    const offset = padding + (playSize * index) / 4;
    radarCtx.beginPath();
    radarCtx.moveTo(offset, padding);
    radarCtx.lineTo(offset, padding + playSize);
    radarCtx.moveTo(padding, offset);
    radarCtx.lineTo(padding + playSize, offset);
    radarCtx.stroke();
  }
  const alivePlayers = state.players.filter((player) => player.alive && player.segments.length > 0);
  for (const player of alivePlayers) {
    const head = player.segments[0];
    const x = padding + ((head.x - arenaMin) / arenaSpan) * playSize;
    const y = padding + ((head.y - arenaMin) / arenaSpan) * playSize;
    const isYou = player.id === playerId;
    const dot = isYou ? 5.5 : 3.8;
    radarCtx.beginPath();
    radarCtx.fillStyle = player.color;
    radarCtx.arc(x, y, dot, 0, Math.PI * 2);
    radarCtx.fill();
    if (isYou) {
      radarCtx.strokeStyle = '#ffffff';
      radarCtx.lineWidth = 1.5;
      radarCtx.stroke();
      // direction notch
      radarCtx.beginPath();
      radarCtx.strokeStyle = '#ffffff';
      radarCtx.moveTo(x, y);
      radarCtx.lineTo(x + Math.cos(player.angle) * 9, y + Math.sin(player.angle) * 9);
      radarCtx.stroke();
    }
  }
}

function drawFood(foods, camera, zoom) {
  const width = viewportSize.width;
  const height = viewportSize.height;
  const drawRadiusSq = FOOD_DRAW_RADIUS * FOOD_DRAW_RADIUS;
  for (const food of foods) {
    const dx = food.x - camera.x;
    const dy = food.y - camera.y;
    if (dx * dx + dy * dy > drawRadiusSq && food.kind === 'normal') {
      continue;
    }
    const point = worldToScreen(food, camera, zoom);
    if (point.x < -20 || point.y < -20 || point.x > width + 20 || point.y > height + 20) {
      continue;
    }
    const kind = food.kind || 'normal';
    const radius = Math.max(2.5, food.radius * zoom);
    if (kind !== 'normal') {
      ctx.beginPath();
      ctx.fillStyle = `${food.color}55`;
      ctx.arc(point.x, point.y, radius * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = food.color;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (kind !== 'normal') {
      ctx.fillStyle = '#041018';
      ctx.font = `800 ${Math.max(9, radius)}px Manrope, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mark =
        kind === 'speed' ? 'S' :
        kind === 'shield' ? 'H' :
        kind === 'magnet' ? 'M' :
        '!';
      ctx.fillText(mark, point.x, point.y + 0.5);
    }
  }
}

function drawSnakeNameLabel(text, x, y, angle, radius) {
  const fontSize = Math.max(11, Math.min(22, radius * 1.15));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Keep text upright-ish
  if (Math.cos(angle) < 0) {
    ctx.rotate(Math.PI);
  }
  ctx.font = `800 ${fontSize}px Manrope, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, fontSize * 0.28);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawCuteFace(headX, headY, angle, radius, isBoosting) {
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const sideX = -forwardY;
  const sideY = forwardX;
  const eyeSpread = radius * 0.48;
  const eyeForward = radius * 0.18;
  const eyeRadius = Math.max(4.5, radius * (isBoosting ? 0.42 : 0.4));
  const leftX = headX + forwardX * eyeForward + sideX * eyeSpread;
  const leftY = headY + forwardY * eyeForward + sideY * eyeSpread;
  const rightX = headX + forwardX * eyeForward - sideX * eyeSpread;
  const rightY = headY + forwardY * eyeForward - sideY * eyeSpread;

  // Blush — stronger so it reads on any skin color
  ctx.fillStyle = 'rgba(255, 105, 145, 0.55)';
  ctx.beginPath();
  ctx.ellipse(
    headX + sideX * radius * 0.7,
    headY + sideY * radius * 0.7,
    radius * 0.28,
    radius * 0.16,
    angle,
    0,
    Math.PI * 2,
  );
  ctx.ellipse(
    headX - sideX * radius * 0.7,
    headY - sideY * radius * 0.7,
    radius * 0.28,
    radius * 0.16,
    angle,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Eye outline + whites
  const drawEye = (ex, ey) => {
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, radius * 0.08);
    ctx.strokeStyle = 'rgba(20, 12, 8, 0.55)';
    ctx.stroke();
  };
  drawEye(leftX, leftY);
  drawEye(rightX, rightY);

  // Big pupils looking forward
  const pupilShift = eyeRadius * 0.22;
  const pupilRadius = eyeRadius * 0.58;
  const leftPupilX = leftX + forwardX * pupilShift;
  const leftPupilY = leftY + forwardY * pupilShift;
  const rightPupilX = rightX + forwardX * pupilShift;
  const rightPupilY = rightY + forwardY * pupilShift;
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.arc(leftPupilX, leftPupilY, pupilRadius, 0, Math.PI * 2);
  ctx.arc(rightPupilX, rightPupilY, pupilRadius, 0, Math.PI * 2);
  ctx.fill();

  // Glossy sparkles
  ctx.fillStyle = '#ffffff';
  const sparkle = (px, py) => {
    ctx.beginPath();
    ctx.arc(
      px - sideX * pupilRadius * 0.35 - forwardX * pupilRadius * 0.2,
      py - sideY * pupilRadius * 0.35 - forwardY * pupilRadius * 0.2,
      Math.max(1.6, pupilRadius * 0.36),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      px + sideX * pupilRadius * 0.45 + forwardX * pupilRadius * 0.2,
      py + sideY * pupilRadius * 0.45 + forwardY * pupilRadius * 0.2,
      Math.max(1, pupilRadius * 0.16),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  };
  sparkle(leftPupilX, leftPupilY);
  sparkle(rightPupilX, rightPupilY);

  // Clear smile at the front of the face
  const smileCenterX = headX + forwardX * radius * 0.52;
  const smileCenterY = headY + forwardY * radius * 0.52;
  const smileHalf = radius * 0.34;
  const smileDepth = radius * 0.22;
  const leftCornerX = smileCenterX + sideX * smileHalf - forwardX * smileDepth * 0.15;
  const leftCornerY = smileCenterY + sideY * smileHalf - forwardY * smileDepth * 0.15;
  const rightCornerX = smileCenterX - sideX * smileHalf - forwardX * smileDepth * 0.15;
  const rightCornerY = smileCenterY - sideY * smileHalf - forwardY * smileDepth * 0.15;
  const smileTipX = smileCenterX + forwardX * smileDepth;
  const smileTipY = smileCenterY + forwardY * smileDepth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = Math.max(3, radius * 0.2);
  ctx.beginPath();
  ctx.moveTo(leftCornerX, leftCornerY);
  ctx.quadraticCurveTo(smileTipX, smileTipY, rightCornerX, rightCornerY);
  ctx.stroke();
  ctx.strokeStyle = '#3a2218';
  ctx.lineWidth = Math.max(2, radius * 0.14);
  ctx.beginPath();
  ctx.moveTo(leftCornerX, leftCornerY);
  ctx.quadraticCurveTo(smileTipX, smileTipY, rightCornerX, rightCornerY);
  ctx.stroke();
}

function isSnakeNearViewport(snake, camera, zoom) {
  const margin = 120 + snake.radius * zoom * 2;
  const maxX = viewportSize.width + margin;
  const maxY = viewportSize.height + margin;
  for (let index = 0; index < snake.segments.length; index += Math.max(1, Math.floor(snake.segments.length / 24))) {
    const point = worldToScreen(snake.segments[index], camera, zoom);
    if (point.x >= -margin && point.y >= -margin && point.x <= maxX && point.y <= maxY) {
      return true;
    }
  }
  const tail = snake.segments[snake.segments.length - 1];
  if (tail) {
    const point = worldToScreen(tail, camera, zoom);
    if (point.x >= -margin && point.y >= -margin && point.x <= maxX && point.y <= maxY) {
      return true;
    }
  }
  return false;
}

function resolveDrawSkin(snake) {
  const fromId = snake.skinId ? SKIN_BY_ID[snake.skinId] : null;
  if (fromId) {
    return fromId;
  }
  return {
    id: 'custom',
    name: 'Custom',
    color: snake.color || '#2ecc71',
    accent: null,
    style: 'solid',
    premium: false,
  };
}

function isPremiumSkin(skin) {
  return Boolean(skin && skin.premium);
}

function skinTertiary(skin) {
  return skin.tertiary || skin.accent || skin.color;
}

function beadColorForSkin(skin, index, isHead, phase = 0) {
  const accent = skin.accent || skin.color;
  const tertiary = skinTertiary(skin);
  const premium = isPremiumSkin(skin);
  if (isAnimatedSkin(skin)) {
    if (skin.anim === 'flow') {
      const band = Math.sin(phase * 2.4 - index * 0.68);
      if (band > 0.65) {
        return mixSkinHex(tertiary, '#ffffff', premium ? 0.45 : 0.25);
      }
      const blend = (band + 1) * 0.5;
      return mixSkinHex(skin.color, accent, blend);
    }
    if (skin.anim === 'plasma') {
      const flicker =
        Math.sin(phase * 5.2 + index * 1.4) * Math.sin(phase * 3.5 + index * 0.75);
      const amount = premium ? (flicker + 1) * 0.55 : (flicker + 1) * 0.35;
      return mixSkinHex(skin.color, accent, amount);
    }
    if (skin.anim === 'inferno') {
      const heat = isHead ? 1 : Math.max(0.15, 1 - index * 0.035);
      const flicker = Math.sin(phase * 2.6 + index * 0.3) * 0.18;
      return mixSkinHex(skin.color, tertiary, Math.min(1, heat * 0.72 + flicker));
    }
    if (skin.anim === 'wave') {
      const wave = (Math.sin(phase * (premium ? 2.1 : 1.6) + index * 0.42) + 1) * 0.5;
      if (premium && wave > 0.82) {
        return mixSkinHex(accent, tertiary, 0.55);
      }
      return mixSkinHex(skin.color, accent, wave);
    }
    if (skin.anim === 'cycle') {
      const wave = (Math.sin(phase * (premium ? 3 : 2.4) + index * 0.55) + 1) * 0.5;
      return mixSkinHex(mixSkinHex(skin.color, accent, wave), tertiary, premium ? wave * 0.35 : 0);
    }
    if (skin.anim === 'pulse') {
      const pulse = (Math.sin(phase * 2.8 + (premium ? index * 0.12 : 0)) + 1) * 0.5;
      if (isHead || premium) {
        return mixSkinHex(skin.color, accent, pulse);
      }
      return skin.color;
    }
    if (skin.anim === 'shimmer') {
      const base = skin.style === 'stripe'
        ? (index % 2 === 0 ? skin.color : accent)
        : skin.color;
      const shine = premium
        ? 0.18 + 0.28 * Math.sin(phase * 3.4 + index * 0.52)
        : 0.1 + 0.12 * Math.sin(phase * 3.1 + index * 0.48);
      return mixSkinHex(base, '#ffffff', shine);
    }
  }
  if (skin.style === 'stripe' || skin.style === 'scale') {
    return index % 2 === 0 ? skin.color : accent;
  }
  if (skin.style === 'dual' || skin.style === 'royal') {
    return isHead ? accent : skin.color;
  }
  return skin.color;
}

function shouldDrawSkinGlow(skin, index, isHead) {
  if (isPremiumSkin(skin)) {
    return isHead || index % 2 === 0;
  }
  if (skin.style === 'glow' || skin.style === 'plasma' || skin.style === 'nebula') {
    if (!isAnimatedSkin(skin)) {
      return true;
    }
    return isHead || index % 4 === 0;
  }
  return false;
}

function drawBeadGradient(x, y, beadRadius, fill, premium) {
  const highlight = mixSkinHex(fill, '#ffffff', premium ? 0.58 : 0.22);
  const shadow = mixSkinHex(fill, '#000000', premium ? 0.42 : 0.18);
  const gradient = ctx.createRadialGradient(
    x - beadRadius * 0.32,
    y - beadRadius * 0.34,
    beadRadius * 0.08,
    x,
    y,
    beadRadius,
  );
  gradient.addColorStop(0, highlight);
  gradient.addColorStop(0.52, fill);
  gradient.addColorStop(1, shadow);
  return gradient;
}

function drawPremiumScaleMark(x, y, beadRadius, accent, index) {
  const arcY = y - beadRadius * (index % 2 === 0 ? 0.12 : 0.28);
  ctx.beginPath();
  ctx.strokeStyle = mixSkinHex(accent, '#000000', 0.35);
  ctx.lineWidth = Math.max(1, beadRadius * 0.1);
  ctx.arc(x, arcY, beadRadius * 0.38, Math.PI * 0.12, Math.PI * 0.88);
  ctx.stroke();
}

function drawPremiumNebulaSpeck(x, y, beadRadius, tertiary, index, phase) {
  const sparkle = Math.sin(phase * 4 + index * 2.1);
  if (sparkle < 0.55) {
    return;
  }
  const angle = phase * 1.7 + index * 1.3;
  const dist = beadRadius * (0.15 + (sparkle - 0.55) * 0.9);
  ctx.beginPath();
  ctx.fillStyle = mixSkinHex(tertiary, '#ffffff', 0.6);
  ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, beadRadius * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawPremiumCrown(x, y, beadRadius, accent) {
  const crownY = y - beadRadius * 0.95;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x - beadRadius * 0.55, crownY + beadRadius * 0.2);
  ctx.lineTo(x - beadRadius * 0.35, crownY - beadRadius * 0.15);
  ctx.lineTo(x - beadRadius * 0.12, crownY + beadRadius * 0.05);
  ctx.lineTo(x, crownY - beadRadius * 0.35);
  ctx.lineTo(x + beadRadius * 0.12, crownY + beadRadius * 0.05);
  ctx.lineTo(x + beadRadius * 0.35, crownY - beadRadius * 0.15);
  ctx.lineTo(x + beadRadius * 0.55, crownY + beadRadius * 0.2);
  ctx.closePath();
  ctx.fill();
}

function drawPremiumSparkles(headX, headY, angle, radius, skin, phase) {
  const accent = skin.accent || skin.color;
  for (let spark = 0; spark < 4; spark += 1) {
    const offset = phase * 3.5 + spark * 1.6;
    const dist = radius * (1.4 + (spark % 2) * 0.35);
    const spread = angle + Math.PI + (spark - 1.5) * 0.45;
    const x = headX + Math.cos(spread) * dist + Math.sin(offset) * 4;
    const y = headY + Math.sin(spread) * dist + Math.cos(offset) * 4;
    const alpha = 0.35 + (Math.sin(offset * 2) + 1) * 0.25;
    ctx.beginPath();
    ctx.fillStyle = mixSkinHex(accent, '#ffffff', 0.5);
    ctx.globalAlpha = alpha;
    ctx.arc(x, y, Math.max(1.5, radius * 0.14), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawSnakeBead(point, beadRadius, fill, skin, index, isHead, phase) {
  const premium = isPremiumSkin(skin);
  const accent = skin.accent || fill;
  const tertiary = skinTertiary(skin);
  if (shouldDrawSkinGlow(skin, index, isHead)) {
    const glowColor = isAnimatedSkin(skin) && isHead
      ? mixSkinHex(accent, tertiary, (Math.sin(phase * 2.2) + 1) * 0.5)
      : accent;
    const glowScale = premium ? (isHead ? 2.05 : 1.65) : 1.45;
    const glowAlpha = premium ? (isHead ? '66' : '44') : '55';
    ctx.beginPath();
    ctx.fillStyle = `${glowColor}${glowAlpha}`;
    ctx.arc(point.x, point.y, beadRadius * glowScale, 0, Math.PI * 2);
    ctx.fill();
    if (premium && isHead) {
      ctx.beginPath();
      ctx.fillStyle = `${tertiary}33`;
      ctx.arc(point.x, point.y, beadRadius * 2.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (skin.style === 'ring' || skin.style === 'metallic') {
    ctx.beginPath();
    ctx.fillStyle = accent;
    ctx.arc(point.x, point.y, beadRadius * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (skin.style === 'royal' && !isHead && index % 5 === 0) {
    ctx.beginPath();
    ctx.strokeStyle = mixSkinHex(accent, '#ffffff', 0.35);
    ctx.lineWidth = Math.max(1, beadRadius * 0.14);
    ctx.arc(point.x, point.y, beadRadius * 1.05, 0, Math.PI * 2);
    ctx.stroke();
  }
  const innerRadius = skin.style === 'ring' || skin.style === 'metallic' ? beadRadius * 0.8 : beadRadius;
  ctx.beginPath();
  ctx.fillStyle = premium ? drawBeadGradient(point.x, point.y, innerRadius, fill, true) : fill;
  ctx.arc(point.x, point.y, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  if (premium) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.arc(
      point.x - innerRadius * 0.28,
      point.y - innerRadius * 0.32,
      innerRadius * (isHead ? 0.26 : 0.18),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else if (!isHead) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.arc(point.x - beadRadius * 0.25, point.y - beadRadius * 0.25, beadRadius * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (premium && skin.style === 'scale') {
    drawPremiumScaleMark(point.x, point.y, innerRadius, accent, index);
  }
  if (premium && skin.style === 'nebula') {
    drawPremiumNebulaSpeck(point.x, point.y, innerRadius, tertiary, index, phase);
  }
  if (premium && isHead && (skin.style === 'royal' || skin.style === 'metallic')) {
    drawPremiumCrown(point.x, point.y, innerRadius, accent);
  }
}

function drawSnake(snake, camera, zoom) {
  if (!snake.alive || snake.segments.length === 0) {
    return;
  }
  const radius = Math.max(4, snake.radius * zoom);
  const isSelf = snake.id === playerId;
  const skin = resolveDrawSkin(snake);
  const head = worldToScreen(snake.segments[0], camera, zoom);
  const spineColor = isAnimatedSkin(skin)
    ? beadColorForSkin(skin, 0, true, skinAnimPhase)
    : skin.color;
  // Long snakes can kill with a body that crosses the screen while the head is off-camera —
  // do not cull by head alone.
  if (!isSelf && !isSnakeNearViewport(snake, camera, zoom)) {
    return;
  }
  // Draw beads tail → head so the head sits on top (classic 000000000 look).
  // Spine stroke fills any residual gaps so thick snakes stay continuous.
  if (snake.segments.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = spineColor;
    ctx.lineWidth = Math.max(2, radius * 1.72);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const first = worldToScreen(snake.segments[snake.segments.length - 1], camera, zoom);
    ctx.moveTo(first.x, first.y);
    for (let index = snake.segments.length - 2; index >= 0; index -= 1) {
      const point = worldToScreen(snake.segments[index], camera, zoom);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
  for (let index = snake.segments.length - 1; index >= 0; index -= 1) {
    const point = worldToScreen(snake.segments[index], camera, zoom);
    const isHead = index === 0;
    const beadRadius = isHead ? radius * 1.22 : radius * 0.98;
    const fill = beadColorForSkin(skin, index, isHead, skinAnimPhase);
    if (isSelf && isHead) {
      ctx.beginPath();
      ctx.fillStyle = `${fill}44`;
      ctx.arc(point.x, point.y, beadRadius * 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSnakeBead(point, beadRadius, fill, skin, index, isHead, skinAnimPhase);
  }
  if (isPremiumSkin(skin) && isAnimatedSkin(skin)) {
    drawPremiumSparkles(head.x, head.y, snake.angle, radius, skin, skinAnimPhase);
  }
  if (isSelf && (snake.boosting || snake.hasSpeed)) {
    ctx.strokeStyle = snake.hasSpeed ? 'rgba(0,229,255,0.9)' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = snake.hasSpeed ? 3 : 2;
    ctx.beginPath();
    ctx.arc(head.x, head.y, radius * 1.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (isSelf && snake.hasShield) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.lineWidth = 3;
    ctx.arc(head.x, head.y, radius * 1.45, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (isSelf && snake.hasMagnet) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(199, 125, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.arc(head.x, head.y, radius * 2.0, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawCuteFace(head.x, head.y, snake.angle, radius, Boolean(snake.boosting || snake.hasSpeed));
  if (isSelf || zoom > 0.7) {
    drawSnakeNameLabel(
      isSelf ? `${snake.name} (you)` : snake.name,
      head.x,
      head.y - radius - Math.max(10, radius * 0.7),
      0,
      radius,
    );
  }
}

function sendInput() {
  if (!joined || !latestState) {
    return;
  }
  const self = getSelfSnake(latestState);
  if (!self || !self.alive || self.segments.length === 0) {
    return;
  }
  let angle;
  if (keyboardAngle != null) {
    angle = keyboardAngle;
  } else {
    const zoom = smoothZoom;
    const worldX = smoothCamera.x + (pointerX - viewportSize.width / 2) / zoom;
    const worldY = smoothCamera.y + (pointerY - viewportSize.height / 2) / zoom;
    angle = Math.atan2(worldY - smoothCamera.y, worldX - smoothCamera.x);
  }
  send({ type: 'input', angle, boost: boosting });
}

function frame(now) {
  const deltaMs = Math.min(40, now - lastFrameTime);
  lastFrameTime = now;
  skinAnimPhase = now * 0.002;
  const state = buildRenderState(deltaMs);
  const self = state ? getSelfSnake(state) : null;
  const authSelf = latestState ? getSelfSnake(latestState) : null;
  const zoomFollow = 1 - Math.exp(-deltaMs / 80);
  if (state) {
    if (shouldUseSpectatorCamera(authSelf)) {
      const target = getArenaCameraCenter();
      smoothCamera.x = target.x;
      smoothCamera.y = target.y;
      const spectatorZoom = isCircularArenaState() ? 0.52 : 0.7;
      smoothZoom = lerp(smoothZoom, spectatorZoom, zoomFollow);
    } else if (authSelf && authSelf.segments[0]) {
      const head = authSelf.segments[0];
      const cameraFollow = 1 - Math.exp(-deltaMs / 45);
      smoothCamera.x = lerp(smoothCamera.x, head.x, cameraFollow);
      smoothCamera.y = lerp(smoothCamera.y, head.y, cameraFollow);
      const safeRadius = Math.max(7, authSelf.radius || 7);
      const targetZoom = Math.max(0.72, Math.min(1.18, 0.58 + 7.8 / safeRadius));
      smoothZoom = lerp(smoothZoom, targetZoom, zoomFollow);
    } else {
      const target = getArenaCameraCenter();
      smoothCamera.x = target.x;
      smoothCamera.y = target.y;
      smoothZoom = lerp(smoothZoom, 0.7, zoomFollow);
    }
    drawBackground(smoothCamera, smoothZoom);
    drawFood(state.foods, smoothCamera, smoothZoom);
    const others = state.players.filter((player) => player.id !== playerId);
    for (const snake of others) {
      drawSnake(snake, smoothCamera, smoothZoom);
    }
    if (self) {
      drawSnake(self, smoothCamera, smoothZoom);
    }
    drawFloatingEmotes(state, smoothCamera, smoothZoom, now);
    radarFrame += 1;
    if (radarFrame % 2 === 0) {
      drawRadar(state);
    }
  } else {
    ctx.fillStyle = '#050d18';
    ctx.fillRect(0, 0, viewportSize.width, viewportSize.height);
  }
  sendInput();
  requestAnimationFrame(frame);
}

let joinSubmitLockUntil = 0;

function submitJoinForm(event) {
  if (event) {
    event.preventDefault();
  }
  const now = Date.now();
  if (now < joinSubmitLockUntil) {
    return false;
  }
  joinSubmitLockUntil = now + 400;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (
      !socket ||
      socket.readyState === WebSocket.CLOSED ||
      socket.readyState === WebSocket.CLOSING
    ) {
      connect();
    }
    statusLine.textContent = 'Still connecting… try again in a second.';
    return false;
  }
  playerName = nameInput.value.trim();
  if (!playerName) {
    statusLine.textContent = 'Enter a name to play.';
    nameInput.focus();
    return false;
  }
  const payload = getJoinPayload();
  if (payload.roomId.length < 3) {
    statusLine.textContent = 'Room code needs at least 3 letters or numbers.';
    return false;
  }
  currentRoomId = payload.roomId;
  statusLine.textContent = 'Joining arena…';
  // User gesture — best chance to hide browser chrome on phones.
  void enterFullscreen();
  send({ type: 'join', ...payload });
  return false;
}

// HTML onsubmit calls submitJoinForm; keep one JS listener path only as backup.
joinForm.addEventListener('submit', submitJoinForm);

respawnButton.addEventListener('click', () => {
  if (respawnButton.disabled) {
    return;
  }
  deathOverlay.hidden = true;
  send({ type: 'respawn', ...getJoinPayload() });
});

if (startRoundButton) {
  startRoundButton.addEventListener('click', () => {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'startRound' }));
    }
  });
}

window.addEventListener('mousemove', (event) => {
  if (!joined || !deathOverlay.hidden) {
    return;
  }
  pointerX = event.clientX;
  pointerY = event.clientY;
  keyboardAngle = null;
});

window.addEventListener('mousedown', (event) => {
  if (!joined || !deathOverlay.hidden) {
    return;
  }
  if (event.target === boostButton || (event.target instanceof Element && event.target.closest('.emote-bar'))) {
    return;
  }
  boostHeldByPointer = true;
  syncBoosting();
});

window.addEventListener('mouseup', () => {
  boostHeldByPointer = false;
  syncBoosting();
});

const ARROW_ANGLES = Object.freeze({
  ArrowUp: -Math.PI / 2,
  ArrowDown: Math.PI / 2,
  ArrowLeft: Math.PI,
  ArrowRight: 0,
  KeyW: -Math.PI / 2,
  KeyS: Math.PI / 2,
  KeyA: Math.PI,
  KeyD: 0,
});

function isTypingInForm() {
  const active = document.activeElement;
  if (!active) {
    return false;
  }
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable;
}

window.addEventListener('keydown', (event) => {
  if (isTypingInForm()) {
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    boostHeldByPointer = true;
    syncBoosting();
    return;
  }
  if (ARROW_ANGLES[event.code] != null) {
    event.preventDefault();
    keyboardAngle = ARROW_ANGLES[event.code];
    return;
  }
  const digit = Number(event.key);
  if (joined && Number.isInteger(digit) && digit >= 1 && digit <= EMOTE_CATALOG.length) {
    event.preventDefault();
    const emote = EMOTE_CATALOG[digit - 1];
    if (emote) {
      sendEmote(emote.id);
    }
  }
});

window.addEventListener('keyup', (event) => {
  if (isTypingInForm()) {
    return;
  }
  if (event.code === 'Space') {
    boostHeldByPointer = false;
    syncBoosting();
  }
});

function setSteerFromClient(clientX, clientY) {
  pointerX = clientX;
  pointerY = clientY;
  keyboardAngle = null;
}

canvas.addEventListener(
  'pointerdown',
  (event) => {
    if (!joined || !deathOverlay.hidden) {
      return;
    }
    if (event.pointerType === 'mouse') {
      return;
    }
    event.preventDefault();
    activePointerId = event.pointerId;
    setSteerFromClient(event.clientX, event.clientY);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  },
  { passive: false },
);

canvas.addEventListener(
  'pointermove',
  (event) => {
    if (!joined || !deathOverlay.hidden) {
      return;
    }
    if (event.pointerType === 'mouse') {
      return;
    }
    if (activePointerId != null && event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    setSteerFromClient(event.clientX, event.clientY);
  },
  { passive: false },
);

function clearTouchPointer(event) {
  if (activePointerId != null && event.pointerId !== activePointerId) {
    return;
  }
  activePointerId = null;
}

canvas.addEventListener('pointerup', clearTouchPointer);
canvas.addEventListener('pointercancel', clearTouchPointer);

function bindBoostButton() {
  if (!boostButton) {
    return;
  }
  const press = (event) => {
    event.preventDefault();
    event.stopPropagation();
    boostHeldByButton = true;
    syncBoosting();
  };
  const release = (event) => {
    event.preventDefault();
    event.stopPropagation();
    boostHeldByButton = false;
    syncBoosting();
  };
  boostButton.addEventListener('pointerdown', press);
  boostButton.addEventListener('pointerup', release);
  boostButton.addEventListener('pointercancel', release);
  boostButton.addEventListener('pointerleave', release);
}

bindBoostButton();
buildEmoteBar();
bindMuteButtons();
bindFullscreenControls();
bindLandscapePreference();
bindModePicker();

window.addEventListener('resize', resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();
pointerX = viewportSize.width / 2;
pointerY = viewportSize.height / 2;
const urlMode = readModeFromUrl();
setSelectedGameMode(urlMode);
const urlRoom = readRoomFromUrl();
if (urlRoom.length >= 3 && roomInput && urlMode !== 'single') {
  roomInput.value = urlRoom;
  currentRoomId = urlRoom;
  updateRoomPill(urlRoom, urlMode);
}
renderSnakePicker();
connect();
window.setInterval(sendPing, 1000);
requestAnimationFrame(frame);
