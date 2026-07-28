'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinOverlay = document.getElementById('joinOverlay');
const deathOverlay = document.getElementById('deathOverlay');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const statusLine = document.getElementById('statusLine');
const hud = document.getElementById('hud');
const leaderboardEl = document.getElementById('leaderboard');
const scorePill = document.getElementById('scorePill');
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

const FOOD_DRAW_RADIUS = 1500;

const SNAKE_SKINS = Object.freeze([
  { name: 'Viper Green', color: '#2ecc71' },
  { name: 'Crimson Coil', color: '#e74c3c' },
  { name: 'Ocean Fang', color: '#3498db' },
  { name: 'Solar Ember', color: '#f39c12' },
  { name: 'Purple Mist', color: '#9b59b6' },
  { name: 'Mint Strike', color: '#1abc9c' },
  { name: 'Lava Trail', color: '#e67e22' },
  { name: 'Pink Pulse', color: '#ff6b9d' },
  { name: 'Aqua Dash', color: '#00cec9' },
  { name: 'Rose Rush', color: '#fd79a8' },
  { name: 'Lilac Bolt', color: '#a29bfe' },
  { name: 'Jade Glow', color: '#55efc4' },
  { name: 'Gold Spark', color: '#ffeaa7' },
  { name: 'Sky Blade', color: '#74b9ff' },
  { name: 'Ruby Dash', color: '#ff7675' },
  { name: 'Ice Stream', color: '#81ecec' },
  { name: 'Sand Storm', color: '#fab1a0' },
  { name: 'Night Violet', color: '#6c5ce7' },
  { name: 'Forest Run', color: '#00b894' },
  { name: 'Silver Scale', color: '#dfe6e9' },
]);

/** @type {WebSocket | null} */
let socket = null;
/** @type {string | null} */
let playerId = null;
/** @type {string} */
let playerName = '';
/** @type {string} */
let currentRoomId = 'LOBBY';
/** @type {string} */
let selectedColor = SNAKE_SKINS[0].color;
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
const BEAD_SPACING = 8.5;
let boostHeldByButton = false;
let boostHeldByPointer = false;
let activePointerId = null;

function syncBoosting() {
  boosting = boostHeldByButton || boostHeldByPointer;
  if (boostButton) {
    boostButton.classList.toggle('active', boosting);
  }
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function easeOutCubic(value) {
  const t = Math.min(1, Math.max(0, value));
  return 1 - (1 - t) ** 3;
}

function renderSnakePicker() {
  snakePicker.innerHTML = '';
  SNAKE_SKINS.forEach((skin) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `skin-option${skin.color === selectedColor ? ' selected' : ''}`;
    button.style.background = skin.color;
    button.title = skin.name;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', skin.color === selectedColor ? 'true' : 'false');
    button.addEventListener('click', () => {
      selectedColor = skin.color;
      skinNameEl.textContent = skin.name;
      renderSnakePicker();
    });
    snakePicker.appendChild(button);
  });
  const selected = SNAKE_SKINS.find((skin) => skin.color === selectedColor);
  skinNameEl.textContent = selected ? selected.name : 'Custom snake';
}

function normalizeRoomId(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeRoomId(params.get('room'));
}

function updateShareUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url);
}

function updateRoomPill(roomId) {
  if (roomPill) {
    roomPill.textContent = `Room ${roomId}`;
  }
}

function getJoinPayload() {
  const roomFromInput = roomInput ? normalizeRoomId(roomInput.value) : '';
  const roomId = roomFromInput.length >= 3 ? roomFromInput : currentRoomId || 'LOBBY';
  return {
    name: playerName || nameInput.value.trim(),
    color: selectedColor,
    roomId,
  };
}

function resize() {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${window.location.host}`);
  statusLine.textContent = 'Connecting…';
  socket.addEventListener('open', () => {
    statusLine.textContent = 'Connected · enter a name to play';
    sendPing();
  });
  socket.addEventListener('close', () => {
    statusLine.textContent = 'Disconnected · retrying…';
    joined = false;
    hud.hidden = true;
    deathOverlay.hidden = true;
    joinOverlay.hidden = false;
    pingMs = null;
    awaitingPong = false;
    updatePingPill();
    window.setTimeout(connect, 1000);
  });
  socket.addEventListener('message', (event) => {
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

function pushKillFeed(line) {
  if (!line || !killFeed) {
    return;
  }
  const item = document.createElement('div');
  item.className = 'kill-feed-item';
  item.textContent = line;
  killFeed.prepend(item);
  while (killFeed.children.length > 8) {
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
  enqueueDeathAnnounce(line);
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
      statusLine.textContent = `Connected · pick a room code and enter the arena`;
      break;
    case 'joined':
      playerId = message.playerId;
      playerName = message.name;
      mapSize = message.mapSize;
      if (typeof message.roomId === 'string') {
        currentRoomId = message.roomId;
        if (roomInput) {
          roomInput.value = message.roomId;
        }
        updateShareUrl(message.roomId);
        updateRoomPill(message.roomId);
      }
      joined = true;
      joinOverlay.hidden = true;
      deathOverlay.hidden = true;
      hud.hidden = false;
      smoothCamera = { x: mapSize / 2, y: mapSize / 2 };
      smoothZoom = 0.85;
      renderBodyById.clear();
      sendPing();
      break;
    case 'state': {
      latestState = inflateState(message);
      stateTime = performance.now();
      const self = getSelfSnake(latestState);
      scorePill.textContent = `Score ${self && self.alive ? self.score : 0}`;
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
      deathTitle.textContent = message.cause === 'wall' ? 'Border said no' : 'Got cooked';
      deathLine.textContent = message.line || 'Oof.';
      deathScore.textContent = `Score ${message.score}`;
      joinOverlay.hidden = true;
      deathOverlay.hidden = false;
      break;
    case 'killFeed':
      showFunnyDeath(message.line);
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
  const bots = state.botCount ?? 0;
  const max = state.maxPlayers ?? 20;
  if (bots > 0) {
    return `${humans} / ${max} · ${bots} bots`;
  }
  return `${humans} / ${max}`;
}

function renderLeaderboard(state) {
  const rows = state.leaderboard
    .map((entry, index) => {
      const isYou = entry.id === playerId;
      return `<li class="${isYou ? 'you' : ''}">
        <span class="name"><span class="dot" style="background:${entry.color}"></span>${index + 1}. ${escapeHtml(entry.name)}${entry.isBot ? ' 🤖' : ''}</span>
        <span>${entry.score}</span>
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

/**
 * Local bead bodies follow a smoothed head only.
 * Never rebuild from jumpy server body points — that was causing the shake.
 */
function buildRenderState(deltaMs) {
  if (!latestState) {
    return null;
  }
  const headFollow = 1 - Math.exp(-deltaMs / 72);
  const seen = new Set();
  const players = latestState.players.map((player) => {
    seen.add(player.id);
    if (!player.alive || player.segments.length === 0) {
      renderBodyById.delete(player.id);
      return player;
    }
    const targetHead = player.segments[0];
    const desiredCount = Math.max(1, player.segments.length);
    let body = renderBodyById.get(player.id);
    if (!body || body.beads.length === 0) {
      body = {
        headX: targetHead.x,
        headY: targetHead.y,
        angle: player.angle,
        beads: player.segments.map((segment) => ({ x: segment.x, y: segment.y })),
      };
      renderBodyById.set(player.id, body);
    } else {
      const gapX = targetHead.x - body.headX;
      const gapY = targetHead.y - body.headY;
      if (gapX * gapX + gapY * gapY > 260 * 260) {
        body.headX = targetHead.x;
        body.headY = targetHead.y;
        body.angle = player.angle;
        body.beads = player.segments.map((segment) => ({ x: segment.x, y: segment.y }));
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
      body.beads[index] = {
        x: previous.x + (dx / dist) * BEAD_SPACING,
        y: previous.y + (dy / dist) * BEAD_SPACING,
      };
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

function worldToScreen(point, camera, zoom) {
  return {
    x: (point.x - camera.x) * zoom + window.innerWidth / 2,
    y: (point.y - camera.y) * zoom + window.innerHeight / 2,
  };
}

function drawBackground(camera, zoom) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.fillStyle = '#050d18';
  ctx.fillRect(0, 0, width, height);

  // Outside the arena — danger zone
  const topLeft = worldToScreen({ x: 0, y: 0 }, camera, zoom);
  const bottomRight = worldToScreen({ x: mapSize, y: mapSize }, camera, zoom);
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

function drawRadar(state) {
  const size = radarCanvas.width;
  const padding = 8;
  const playSize = size - padding * 2;
  radarCtx.clearRect(0, 0, size, size);
  radarCtx.fillStyle = 'rgba(5, 13, 24, 0.95)';
  radarCtx.fillRect(0, 0, size, size);
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
    const x = padding + (head.x / mapSize) * playSize;
    const y = padding + (head.y / mapSize) * playSize;
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
  const width = window.innerWidth;
  const height = window.innerHeight;
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

function drawSnake(snake, camera, zoom) {
  if (!snake.alive || snake.segments.length === 0) {
    return;
  }
  const radius = Math.max(4, snake.radius * zoom);
  const isSelf = snake.id === playerId;
  const head = worldToScreen(snake.segments[0], camera, zoom);
  if (
    !isSelf &&
    (head.x < -80 || head.y < -80 || head.x > window.innerWidth + 80 || head.y > window.innerHeight + 80)
  ) {
    return;
  }
  // Draw beads tail → head so the head sits on top (classic 000000000 look).
  for (let index = snake.segments.length - 1; index >= 0; index -= 1) {
    const point = worldToScreen(snake.segments[index], camera, zoom);
    const isHead = index === 0;
    const beadRadius = isHead ? radius * 1.22 : radius * 0.98;
    if (isSelf && isHead) {
      ctx.beginPath();
      ctx.fillStyle = `${snake.color}44`;
      ctx.arc(point.x, point.y, beadRadius * 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = snake.color;
    ctx.arc(point.x, point.y, beadRadius, 0, Math.PI * 2);
    ctx.fill();
    if (!isHead) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.arc(point.x - beadRadius * 0.25, point.y - beadRadius * 0.25, beadRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
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
      isSelf ? `${snake.name} (you)` : snake.isBot ? `${snake.name} 🤖` : snake.name,
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
    const worldX = smoothCamera.x + (pointerX - window.innerWidth / 2) / zoom;
    const worldY = smoothCamera.y + (pointerY - window.innerHeight / 2) / zoom;
    angle = Math.atan2(worldY - smoothCamera.y, worldX - smoothCamera.x);
  }
  send({ type: 'input', angle, boost: boosting });
}

function frame(now) {
  const deltaMs = Math.min(40, now - lastFrameTime);
  lastFrameTime = now;
  const state = buildRenderState(deltaMs);
  const self = state ? getSelfSnake(state) : null;
  const zoomFollow = 1 - Math.exp(-deltaMs / 80);
  if (state) {
    if (self && self.alive && self.segments[0]) {
      // Hard-lock camera to smoothed head — second camera lerp was fighting it.
      smoothCamera.x = self.segments[0].x;
      smoothCamera.y = self.segments[0].y;
      const targetZoom = Math.max(0.45, Math.min(1.15, 14 / self.radius));
      smoothZoom = lerp(smoothZoom, targetZoom, zoomFollow);
    } else {
      const targetCamera = { x: mapSize / 2, y: mapSize / 2 };
      const cameraFollow = 1 - Math.exp(-deltaMs / 50);
      smoothCamera.x = lerp(smoothCamera.x, targetCamera.x, cameraFollow);
      smoothCamera.y = lerp(smoothCamera.y, targetCamera.y, cameraFollow);
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
    radarFrame += 1;
    if (radarFrame % 2 === 0) {
      drawRadar(state);
    }
  } else {
    ctx.fillStyle = '#050d18';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }
  sendInputThrottled();
  requestAnimationFrame(frame);
}

let inputFrame = 0;
function sendInputThrottled() {
  inputFrame += 1;
  if (inputFrame % 2 === 0) {
    sendInput();
  }
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  playerName = nameInput.value.trim();
  const payload = getJoinPayload();
  if (payload.roomId.length < 3) {
    statusLine.textContent = 'Room code needs at least 3 letters or numbers.';
    return;
  }
  currentRoomId = payload.roomId;
  send({ type: 'join', ...payload });
});

respawnButton.addEventListener('click', () => {
  deathOverlay.hidden = true;
  send({ type: 'respawn', ...getJoinPayload() });
});

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
  if (event.target === boostButton) {
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

window.addEventListener('resize', resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
}
resize();
pointerX = window.innerWidth / 2;
pointerY = window.innerHeight / 2;
const urlRoom = readRoomFromUrl();
if (urlRoom.length >= 3 && roomInput) {
  roomInput.value = urlRoom;
  currentRoomId = urlRoom;
  updateRoomPill(urlRoom);
}
renderSnakePicker();
connect();
window.setInterval(sendPing, 1000);
requestAnimationFrame(frame);
