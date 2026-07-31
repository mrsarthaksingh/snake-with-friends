'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const match = require('./match');
const {
  segmentCountForScore,
  radiusForScore,
  baseSpeedForScore,
  BASE_SPEED,
  MIN_RADIUS,
} = require('./snake-growth');
const { SKINS, SKIN_COLORS, resolveSkin, getSkinById } = require('./public/skins');

const PORT = Number(process.env.PORT || process.env.SNAKE_PORT) || 3848;
const DEFAULT_ROOM_ID = 'LOBBY';
const MAX_ROOM_ID_LENGTH = 12;
const ROOM_CLEANUP_MS = 30 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_PLAYERS = 20;
const MAP_SIZE = 5000;
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
/** Network snapshots per second (physics stays at TICK_RATE). */
const NET_RATE = 30;
const NET_EVERY_TICKS = Math.max(1, Math.round(TICK_RATE / NET_RATE));
const FOOD_COUNT = 900;
const POWER_ORB_TARGET = 48;
/** Max orbs one death can spray (keeps explosions readable). */
const DEATH_DROP_MAX = 52;
/** Spray radius in world units around the kill point. */
const DEATH_SPRAY_RADIUS = 68;
const START_SEGMENTS = 12;
const SEGMENT_SPACING = 9;
const BOOST_MULTIPLIER = 2.2;
const SPEED_POWER_MULTIPLIER = 2.1;
const TURN_RATE = 0.32;
const BOOST_DROP_CHANCE = 0.35;
const SPEED_POWER_MS = 8000;
const SHIELD_POWER_MS = 6000;
const MAGNET_POWER_MS = 10000;
const MAGNET_PULL_RADIUS = 200;
const MAGNET_PULL_SPEED = 14;
/**
 * Thin long bodies on the wire. Sending every physics bead (up to 280) at 30 Hz
 * makes fat snakes stutter / feel stuck on mobile.
 */
const MAX_SEGMENTS_SEND = 180;
const MAX_BOTS = 4;

/**
 * Casual Indian nicknames (mixed gender + chat spellings) so bots blend in
 * with real lobby names instead of looking like a formal name list.
 */
const BOT_NAMES = Object.freeze([
  // guys
  'arjun',
  'rohan',
  'Rahul',
  'aditya',
  'karan',
  'vikram',
  'Aman',
  'harsh',
  'yashh',
  'devv',
  'sidd',
  'kunal',
  'rishi',
  'aarav',
  'ishaan',
  'kabir',
  'veer',
  'neel',
  'raj',
  'samarth',
  'aniket',
  'manav',
  'tushar',
  'varun',
  'abhi',
  'aryan',
  'shaurya',
  'om',
  'nikhil',
  'prateek',
  // girls — informal spellings
  'divyaa',
  'priyaa',
  'ananyaa',
  'isha',
  'kavyaa',
  'meera',
  'diyaa',
  'snehaa',
  'riyaa',
  'aisha',
  'nehaa',
  'aditi',
  'tanvii',
  'nisha',
  'kritii',
  'anvii',
  'kiara',
  'ishita',
  'swati',
  'jhanvii',
  'poojaa',
  'shrutii',
  'aanya',
  'saraa',
  'zara',
  'payall',
  'sanya',
  'fatima',
  'myra',
  'lakshmi',
  // chatty lobby-style handles
  'rohan07',
  'arjun_x',
  'divya_22',
  'yashplays',
  'neelz',
  'priya.xx',
  'karanYT',
  'aditi_g',
  'rahulboi',
  'ananya_',
]);

const POWER_ORB_TYPES = Object.freeze({
  speed: { color: '#00e5ff', radius: 9, label: 'Speed' },
  shield: { color: '#ffd166', radius: 9, label: 'Shield' },
  magnet: { color: '#c77dff', radius: 10, label: 'Magnet' },
  mega: { color: '#ff4d6d', radius: 11, label: 'Mega' },
});

const COLORS = SKIN_COLORS;

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.md': 'text/markdown; charset=utf-8',
});

/**
 * @typedef {'normal' | 'speed' | 'shield' | 'magnet' | 'mega'} FoodKind
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ id: string, x: number, y: number, radius: number, value: number, color: string, kind: FoodKind }} Food
 * @typedef {{
 *   id: string,
 *   name: string,
 *   color: string,
 *   skinId: string,
 *   angle: number,
 *   targetAngle: number,
 *   boosting: boolean,
 *   segments: Point[],
 *   score: number,
 *   alive: boolean,
 *   spawnProtectedUntil: number,
 *   speedUntil: number,
 *   shieldUntil: number,
 *   magnetUntil: number,
 *   isBot: boolean,
 *   spectating: boolean,
 *   roundScoreLocked: boolean,
 *   socket: import('ws').WebSocket | { readyState: number },
 * }} Snake
 */

/**
 * @typedef {{
 *   id: string,
 *   snakes: Map<string, Snake>,
 *   foods: Food[],
 *   tickCount: number,
 *   cachedLeaderboard: Array<{ id: string, name: string, score: number, kills: number, color: string, isBot: boolean }>,
 *   foodIdCounter: number,
 *   lastActiveAt: number,
 *   match: ReturnType<typeof match.createMatchState>,
 * }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {WeakMap<import('ws').WebSocket, { roomId: string, snakeId: string }>} */
const socketToMeta = new WeakMap();

function normalizeRoomId(raw) {
  const cleaned = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_ROOM_ID_LENGTH);
  if (cleaned.length >= 3) {
    return cleaned;
  }
  return DEFAULT_ROOM_ID;
}

function createRoom(roomId) {
  return {
    id: roomId,
    snakes: new Map(),
    foods: [],
    tickCount: 0,
    cachedLeaderboard: [],
    foodIdCounter: 1,
    lastActiveAt: Date.now(),
    match: match.createMatchState(),
  };
}

function getOrCreateRoom(rawRoomId) {
  const roomId = normalizeRoomId(rawRoomId);
  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId);
    seedFood(room);
    rooms.set(roomId, room);
    console.log(`Room opened: ${roomId}`);
  }
  room.lastActiveAt = Date.now();
  return room;
}

function getRoomBySocket(socket) {
  const meta = socketToMeta.get(socket);
  if (!meta) {
    return null;
  }
  return rooms.get(meta.roomId) ?? null;
}

function countHumansInRoom(room) {
  let count = 0;
  for (const snake of room.snakes.values()) {
    if (!snake.isBot) {
      count += 1;
    }
  }
  return count;
}

function countBotsInRoom(room) {
  let count = 0;
  for (const snake of room.snakes.values()) {
    if (snake.isBot) {
      count += 1;
    }
  }
  return count;
}

function cleanupEmptyRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.snakes.size === 0 && now - room.lastActiveAt > ROOM_CLEANUP_MS) {
      rooms.delete(roomId);
    }
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function wrapAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clampToMap(point) {
  return {
    x: Math.min(MAP_SIZE - 20, Math.max(20, point.x)),
    y: Math.min(MAP_SIZE - 20, Math.max(20, point.y)),
  };
}

function countPowerOrbs(room) {
  return room.foods.filter((food) => food.kind !== 'normal').length;
}

/**
 * @param {Room} room
 * @param {number} x
 * @param {number} y
 * @param {number} [value]
 * @param {FoodKind} [kind]
 */
function createFoodAt(room, x, y, value = 1, kind = 'normal') {
  const power = kind !== 'normal' ? POWER_ORB_TYPES[kind] : null;
  const food = {
    id: `f${room.foodIdCounter}`,
    x,
    y,
    radius: power ? power.radius : 3 + Math.min(8, value),
    value: kind === 'mega' ? 12 : value,
    color: power ? power.color : COLORS[Math.floor(Math.random() * COLORS.length)],
    kind,
  };
  room.foodIdCounter += 1;
  room.foods.push(food);
  return food;
}

function pickFoodKind(room) {
  if (countPowerOrbs(room) >= POWER_ORB_TARGET) {
    return 'normal';
  }
  const roll = Math.random();
  if (roll < 0.05) return 'speed';
  if (roll < 0.09) return 'shield';
  if (roll < 0.15) return 'magnet';
  if (roll < 0.18) return 'mega';
  return 'normal';
}

function seedFood(room) {
  room.foods = [];
  for (let index = 0; index < FOOD_COUNT; index += 1) {
    createFoodAt(
      room,
      randomRange(40, MAP_SIZE - 40),
      randomRange(40, MAP_SIZE - 40),
      1,
      pickFoodKind(room),
    );
  }
}

function radiusForSnake(snake) {
  return radiusForScore(snake.score);
}

function speedForSnake(snake) {
  const now = Date.now();
  let base = baseSpeedForScore(snake.score);
  if (now < snake.speedUntil) {
    base *= SPEED_POWER_MULTIPLIER;
  }
  return snake.boosting && snake.score > 8 ? base * BOOST_MULTIPLIER : base;
}

function allocateSkin(room) {
  const used = new Set([...room.snakes.values()].map((snake) => snake.skinId));
  const free = SKINS.find((skin) => !used.has(skin.id));
  return free ?? SKINS[room.snakes.size % SKINS.length];
}

function resolveSnakeSkin(room, requestedSkinId, requestedColor) {
  if (getSkinById(requestedSkinId) || (typeof requestedColor === 'string' && COLORS.includes(requestedColor))) {
    return resolveSkin(requestedSkinId, requestedColor);
  }
  return allocateSkin(room);
}

function createSnake(room, socket, name, requestedColor, options = {}) {
  const spawn = clampToMap({
    x: randomRange(MAP_SIZE * 0.2, MAP_SIZE * 0.8),
    y: randomRange(MAP_SIZE * 0.2, MAP_SIZE * 0.8),
  });
  const angle = randomRange(-Math.PI, Math.PI);
  /** @type {Point[]} */
  const segments = [];
  for (let index = 0; index < START_SEGMENTS; index += 1) {
    segments.push({
      x: spawn.x - Math.cos(angle) * index * SEGMENT_SPACING,
      y: spawn.y - Math.sin(angle) * index * SEGMENT_SPACING,
    });
  }
  const skin = resolveSnakeSkin(room, options.skinId, requestedColor);
  return {
    id: crypto.randomUUID(),
    name,
    color: skin.color,
    skinId: skin.id,
    angle,
    targetAngle: angle,
    boosting: false,
    segments,
    score: START_SEGMENTS,
    alive: true,
    spawnProtectedUntil: Date.now() + (options.isBot ? 1800 : 2500),
    speedUntil: 0,
    shieldUntil: 0,
    magnetUntil: 0,
    isBot: Boolean(options.isBot),
    spectating: false,
    roundScoreLocked: false,
    kills: 0,
    socket,
  };
}

/**
 * Spray orbs in a tight burst at the kill — never along the whole body trail
 * (that left sparse “0   0   0” crumbs nobody could reach).
 */
function dropFoodFromSnake(room, snake) {
  if (snake.segments.length === 0) {
    return;
  }
  const head = snake.segments[0];
  const dropCount = Math.min(
    DEATH_DROP_MAX,
    Math.max(12, Math.floor(snake.score / 2.2)),
  );
  for (let index = 0; index < dropCount; index += 1) {
    const angle = randomRange(-Math.PI, Math.PI);
    // Bias toward the center so loot feels like a spray, not a ring.
    const dist = Math.pow(Math.random(), 0.5) * DEATH_SPRAY_RADIUS;
    const point = clampToMap({
      x: head.x + Math.cos(angle) * dist,
      y: head.y + Math.sin(angle) * dist,
    });
    createFoodAt(room, point.x, point.y, 2);
  }
}

function pickFunnyLine(templateList, killerName, victimName) {
  const template = templateList[Math.floor(Math.random() * templateList.length)];
  return template
    .replaceAll('{killer}', killerName)
    .replaceAll('{victim}', victimName);
}

const KILL_LINES = Object.freeze([
  '{killer} turned {victim} into free snacks.',
  '{victim} face-planted into {killer}. Embarrassing.',
  '{killer} said “excuse me” with their entire body.',
  '{victim} tried parkour. {killer} was the wall.',
  'Plot twist: {killer} was the final boss.',
  '{victim} got absolute-domed by {killer}.',
  '{killer} collected {victim} like a rare orb.',
  '{victim} blinked. {killer} did not.',
  'Breaking news: {killer} owns {victim}.',
  '{victim} learned physics the hard way from {killer}.',
  '{killer} served chaos. {victim} ordered it.',
  '{victim} speedran the afterlife thanks to {killer}.',
  '{killer} deleted {victim} from the gene pool.',
  '{victim} got folded like cheap laundry by {killer}.',
  '{killer} cooked {victim} so hard the Wi‑Fi felt it.',
  'Skill issue detected: {victim} vs {killer}. Victim lost.',
  '{victim} brought a snack. {killer} brought a funeral.',
  '{killer} turnt {victim} into pixel confetti.',
  '{victim} thought they were built different. {killer} disagreed.',
  'RIP {victim}. Cause of death: {killer}’s entire bloodline.',
  '{killer} clapped {victim} into next week’s leaderboard.',
  '{victim} got ratio’d mid-slither by {killer}.',
  '{killer} filed {victim} under “easy kills”.',
  '{victim}’s parents felt that one from {killer}.',
  'Autopsy report: {victim} was allergic to {killer}.',
  '{killer} made {victim} a cautionary tale.',
  '{victim} pressed play. {killer} pressed delete.',
  '{killer} sent {victim} to the shadow realm (and took the orbs).',
  '{victim} fumbled so hard {killer} got secondhand glory.',
  'L + ratio + {killer} ate {victim} for breakfast.',
]);

const WALL_LINES = Object.freeze([
  '{victim} hugged the red border a little too hard.',
  '{victim} discovered walls are not edible.',
  '{victim} tried to leave the arena. The arena said no.',
  'Border 1 — {victim} 0.',
  '{victim} yeeted themselves into the danger zone.',
  '{victim} forgot the map has edges. Cute.',
  '{victim} speedran into the wall like it owed them money.',
  '{victim} mistook the red border for a hug.',
  'GPS failed. {victim} found the wall anyway.',
  '{victim} rage-quit… into the boundary.',
  '{victim} invented a new sport: competitive wall kissing.',
  'Cause of death for {victim}: geography.',
  '{victim} really said “what if the wall is soft?” It wasn’t.',
  '{victim} outplayed themselves. The border applauded.',
  '{victim}’s last words: “I can make that gap.” Narrator: they could not.',
]);

/** @type {import('ws').WebSocketServer | null} */
let webSocketServerRef = null;

function broadcastKillFeed(room, payload) {
  const data = JSON.stringify(payload);
  for (const snake of room.snakes.values()) {
    if (!snake.isBot && snake.socket.readyState === 1) {
      snake.socket.send(data);
    }
  }
}

function killSnake(room, snake, options = {}) {
  if (!snake.alive) {
    return;
  }
  snake.alive = false;
  snake.boosting = false;
  dropFoodFromSnake(room, snake);
  const killerName = typeof options.killerName === 'string' ? options.killerName : null;
  const killerId = typeof options.killerId === 'string' ? options.killerId : null;
  const cause = options.cause === 'wall' ? 'wall' : killerName ? 'snake' : 'unknown';
  if (cause === 'snake' && killerId) {
    const killer = room.snakes.get(killerId);
    if (killer) {
      killer.score += match.KILL_SCORE_BONUS;
      killer.kills = (killer.kills || 0) + 1;
      match.recordKill(room.match, killer.id);
    }
  }
  const line =
    cause === 'wall'
      ? pickFunnyLine(WALL_LINES, 'Wall', snake.name)
      : killerName
        ? pickFunnyLine(KILL_LINES, killerName, snake.name)
        : `${snake.name} somehow exploded. Science is baffled.`;
  const isActiveRoundPhase =
    room.match.phase === 'playing' ||
    room.match.phase === 'countdown' ||
    room.match.phase === 'podium';
  if (!snake.isBot && isActiveRoundPhase) {
    snake.spectating = true;
  }
  if (!snake.isBot && snake.socket.readyState === 1) {
    snake.socket.send(
      JSON.stringify({
        type: 'died',
        score: Math.floor(snake.score),
        cause,
        killerName,
        line,
      }),
    );
    if (isActiveRoundPhase) {
      snake.socket.send(JSON.stringify({ type: 'spectating', reason: 'round' }));
    }
  }
  const killer = killerId ? room.snakes.get(killerId) : null;
  broadcastKillFeed(room, {
    type: 'killFeed',
    line,
    cause,
    killerName,
    killerId,
    killerKills: killer ? Math.max(0, Math.floor(killer.kills || 0)) : null,
    victimName: snake.name,
  });
  if (snake.isBot) {
    snake.botRespawnAt = Date.now() + 1200 + Math.floor(Math.random() * 1800);
  }
}

function countHumans(room) {
  return countHumansInRoom(room);
}

function countBots(room) {
  return countBotsInRoom(room);
}

function desiredBotCount() {
  return MAX_BOTS;
}

function pickBotName(room) {
  const used = new Set([...room.snakes.values()].map((snake) => snake.name));
  const free = BOT_NAMES.filter((name) => !used.has(name));
  if (free.length > 0) {
    return free[Math.floor(Math.random() * free.length)];
  }
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

function removeOneBot(room) {
  let victim = null;
  for (const snake of room.snakes.values()) {
    if (!snake.isBot) {
      continue;
    }
    if (!snake.alive) {
      victim = snake;
      break;
    }
    if (!victim) {
      victim = snake;
    }
  }
  if (victim) {
    room.snakes.delete(victim.id);
  }
}

function spawnBot(room) {
  if (room.snakes.size >= MAX_PLAYERS) {
    return;
  }
  const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  const bot = createSnake(room, { readyState: 3 }, pickBotName(room), skin.color, {
    isBot: true,
    skinId: skin.id,
  });
  bot.botRespawnAt = 0;
  room.snakes.set(bot.id, bot);
}

function respawnBot(room, snake) {
  const fresh = createSnake(room, { readyState: 3 }, snake.name, snake.color, {
    isBot: true,
    skinId: snake.skinId,
  });
  room.snakes.delete(snake.id);
  room.snakes.set(fresh.id, fresh);
}

function maintainBots(room) {
  const desired = desiredBotCount();
  for (const snake of [...room.snakes.values()]) {
    if (!snake.isBot) {
      continue;
    }
    if (
      !snake.alive &&
      typeof snake.botRespawnAt === 'number' &&
      Date.now() >= snake.botRespawnAt
    ) {
      if (countBots(room) <= desired) {
        respawnBot(room, snake);
      } else {
        room.snakes.delete(snake.id);
      }
    }
  }
  while (countBots(room) > desired) {
    removeOneBot(room);
  }
  while (countBots(room) < desired && room.snakes.size < MAX_PLAYERS) {
    spawnBot(room);
  }
}

function updateBotBrain(room, snake) {
  if (!snake.isBot || !snake.alive || snake.segments.length === 0) {
    return;
  }
  const head = snake.segments[0];
  const margin = 140 + radiusForSnake(snake);
  let targetX = head.x;
  let targetY = head.y;
  let forced = false;
  if (head.x < margin) {
    targetX = MAP_SIZE * 0.5;
    forced = true;
  } else if (head.x > MAP_SIZE - margin) {
    targetX = MAP_SIZE * 0.5;
    forced = true;
  }
  if (head.y < margin) {
    targetY = MAP_SIZE * 0.5;
    forced = true;
  } else if (head.y > MAP_SIZE - margin) {
    targetY = MAP_SIZE * 0.5;
    forced = true;
  }
  if (!forced) {
    let bestFood = null;
    let bestDist = Infinity;
    for (const food of room.foods) {
      const dx = food.x - head.x;
      const dy = food.y - head.y;
      const dist = dx * dx + dy * dy;
      const prefer = food.kind !== 'normal' ? 0.55 : 1;
      const score = dist * prefer;
      if (score < bestDist) {
        bestDist = score;
        bestFood = food;
      }
    }
    // Mild flee from nearby larger snake heads.
    let fleeX = 0;
    let fleeY = 0;
    for (const other of room.snakes.values()) {
      if (other.id === snake.id || !other.alive || other.segments.length === 0) {
        continue;
      }
      if (other.score < snake.score + 4) {
        continue;
      }
      const otherHead = other.segments[0];
      const dx = head.x - otherHead.x;
      const dy = head.y - otherHead.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 280 * 280 && distSq > 1) {
        fleeX += dx / distSq;
        fleeY += dy / distSq;
      }
    }
    if (fleeX !== 0 || fleeY !== 0) {
      targetX = head.x + fleeX * 40000;
      targetY = head.y + fleeY * 40000;
    } else if (bestFood) {
      targetX = bestFood.x;
      targetY = bestFood.y;
    } else {
      targetX = head.x + Math.cos(snake.angle) * 80;
      targetY = head.y + Math.sin(snake.angle) * 80;
    }
  }
  snake.targetAngle = wrapAngle(
    Math.atan2(targetY - head.y, targetX - head.x) + randomRange(-0.12, 0.12),
  );
  snake.boosting = !forced && snake.score > 14 && Math.random() < 0.035;
}

function maintainFoodCount(room) {
  while (room.foods.length < FOOD_COUNT) {
    createFoodAt(
      room,
      randomRange(40, MAP_SIZE - 40),
      randomRange(40, MAP_SIZE - 40),
      1,
      pickFoodKind(room),
    );
  }
}

/**
 * @param {Room} room
 * @param {FoodKind} [kind]
 */
function createRandomFood(room, kind = 'normal') {
  createFoodAt(
    room,
    randomRange(40, MAP_SIZE - 40),
    randomRange(40, MAP_SIZE - 40),
    kind === 'mega' ? 12 : 1,
    kind,
  );
}

function turnToward(current, target, maxTurn) {
  let delta = wrapAngle(target - current);
  if (delta > maxTurn) delta = maxTurn;
  if (delta < -maxTurn) delta = -maxTurn;
  return wrapAngle(current + delta);
}

const BORDER_PADDING = 8;

function isInsideArena(point, radius, insetRatio = 0) {
  const bounds = match.arenaBounds(MAP_SIZE, insetRatio);
  const edge = BORDER_PADDING + radius;
  return (
    point.x >= bounds.min + edge &&
    point.y >= bounds.min + edge &&
    point.x <= bounds.max - edge &&
    point.y <= bounds.max - edge
  );
}

/**
 * Keep body beads inside the red border. Head still dies on wall contact;
 * without this, long snakes swing their tail into the danger zone.
 * @param {{ x: number, y: number }} point
 * @param {number} radius
 * @param {number} [insetRatio]
 */
function clampPointToArena(point, radius, insetRatio = 0) {
  const bounds = match.arenaBounds(MAP_SIZE, insetRatio);
  const edge = BORDER_PADDING + Math.max(0, radius);
  return {
    x: Math.min(bounds.max - edge, Math.max(bounds.min + edge, point.x)),
    y: Math.min(bounds.max - edge, Math.max(bounds.min + edge, point.y)),
  };
}

function rebuildSnakeBody(snake, nextHead, insetRatio = 0) {
  const desiredCount = segmentCountForScore(snake.score);
  const bodyRadius = radiusForSnake(snake) * 0.9;
  if (snake.segments.length === 0) {
    snake.segments = [nextHead];
  } else {
    snake.segments[0] = nextHead;
  }
  // Follow-the-leader: each bead sits a fixed distance behind the previous one.
  for (let index = 1; index < snake.segments.length; index += 1) {
    const previous = snake.segments[index - 1];
    const current = snake.segments[index];
    let dx = current.x - previous.x;
    let dy = current.y - previous.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.0001) {
      dx = -Math.cos(snake.angle);
      dy = -Math.sin(snake.angle);
      dist = 1;
    }
    const scale = SEGMENT_SPACING / dist;
    snake.segments[index] = clampPointToArena(
      {
        x: previous.x + dx * scale,
        y: previous.y + dy * scale,
      },
      bodyRadius,
      insetRatio,
    );
  }
  while (snake.segments.length > desiredCount) {
    snake.segments.pop();
  }
  while (snake.segments.length < desiredCount) {
    const last = snake.segments[snake.segments.length - 1];
    const before = snake.segments[snake.segments.length - 2] ?? {
      x: last.x - Math.cos(snake.angle) * SEGMENT_SPACING,
      y: last.y - Math.sin(snake.angle) * SEGMENT_SPACING,
    };
    let dx = last.x - before.x;
    let dy = last.y - before.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.0001) {
      dx = -Math.cos(snake.angle);
      dy = -Math.sin(snake.angle);
      dist = 1;
    }
    snake.segments.push(
      clampPointToArena(
        {
          x: last.x + (dx / dist) * SEGMENT_SPACING,
          y: last.y + (dy / dist) * SEGMENT_SPACING,
        },
        bodyRadius,
        insetRatio,
      ),
    );
  }
}

function moveSnake(room, snake) {
  snake.angle = turnToward(snake.angle, snake.targetAngle, TURN_RATE);
  const speed = speedForSnake(snake);
  const head = snake.segments[0];
  const nextHead = {
    x: head.x + Math.cos(snake.angle) * speed,
    y: head.y + Math.sin(snake.angle) * speed,
  };
  const radius = radiusForSnake(snake);
  // Use near-full radius so fat heads don't visually poke past the border.
  if (!isInsideArena(nextHead, radius * 0.95, room.match.arenaInsetRatio)) {
    killSnake(room, snake, { cause: 'wall' });
    return;
  }
  rebuildSnakeBody(snake, nextHead, room.match.arenaInsetRatio);
  if (snake.boosting && snake.score > 8 && Math.random() < BOOST_DROP_CHANCE) {
    snake.score = Math.max(8, snake.score - 0.08);
    const tail = snake.segments[snake.segments.length - 1];
    if (tail && Math.random() < 0.12) {
      createFoodAt(room, tail.x, tail.y, 1);
    }
  }
}

function pullFoodTowardMagnets(room) {
  const now = Date.now();
  const pullRadiusSq = MAGNET_PULL_RADIUS * MAGNET_PULL_RADIUS;
  for (const snake of room.snakes.values()) {
    if (!snake.alive || now >= snake.magnetUntil || snake.segments.length === 0) {
      continue;
    }
    const head = snake.segments[0];
    for (const food of room.foods) {
      const dx = food.x - head.x;
      const dy = food.y - head.y;
      const spanSq = dx * dx + dy * dy;
      if (spanSq <= 1 || spanSq > pullRadiusSq) {
        continue;
      }
      const span = Math.sqrt(spanSq);
      const pull = Math.min(MAGNET_PULL_SPEED, span);
      const ratio = pull / span;
      food.x -= dx * ratio;
      food.y -= dy * ratio;
    }
  }
}

function eatFood(room, snake) {
  const head = snake.segments[0];
  const now = Date.now();
  const magnetBonus = now < snake.magnetUntil ? 36 : 0;
  const mouth = radiusForSnake(snake) + 2 + magnetBonus;
  for (let index = room.foods.length - 1; index >= 0; index -= 1) {
    const food = room.foods[index];
    if (distance(head, food) > mouth + food.radius) {
      continue;
    }
    snake.score += food.value;
    if (food.kind === 'speed') {
      snake.speedUntil = Math.max(snake.speedUntil, now) + SPEED_POWER_MS;
    } else if (food.kind === 'shield') {
      snake.shieldUntil = Math.max(snake.shieldUntil, now) + SHIELD_POWER_MS;
    } else if (food.kind === 'magnet') {
      snake.magnetUntil = Math.max(snake.magnetUntil, now) + MAGNET_POWER_MS;
    } else if (food.kind === 'mega') {
      snake.score += 18;
    }
    room.foods.splice(index, 1);
  }
}

function collideSnakes(room) {
  const now = Date.now();
  const alive = [...room.snakes.values()].filter((snake) => snake.alive);
  /** @type {Map<string, string>} */
  const killerByVictim = new Map();
  for (const snake of alive) {
    if (
      killerByVictim.has(snake.id) ||
      now < snake.spawnProtectedUntil ||
      now < snake.shieldUntil
    ) {
      continue;
    }
    const head = snake.segments[0];
    // Use near-core radii so oversized snakes don't create phantom hit bubbles.
    const headRadius = Math.max(MIN_RADIUS * 0.7, radiusForSnake(snake) * 0.55);
    for (const other of alive) {
      if (other.id === snake.id || killerByVictim.has(other.id)) {
        continue;
      }
      const bodyRadius = Math.max(MIN_RADIUS * 0.65, radiusForSnake(other) * 0.5);
      // Skip the first few neck segments to reduce head-on false positives.
      for (let index = 4; index < other.segments.length; index += 1) {
        const segment = other.segments[index];
        if (distance(head, segment) <= headRadius + bodyRadius) {
          killerByVictim.set(snake.id, other.id);
          break;
        }
      }
      if (killerByVictim.has(snake.id)) {
        break;
      }
    }
  }
  for (const [victimId, killerId] of killerByVictim.entries()) {
    const victim = room.snakes.get(victimId);
    const killer = room.snakes.get(killerId);
    if (victim) {
      killSnake(room, victim, {
        cause: 'snake',
        killerName: killer ? killer.name : 'Someone',
        killerId: killer ? killer.id : null,
      });
    }
  }
}

function buildLeaderboard(room) {
  const isRoundPhase =
    room.match.phase === 'playing' ||
    room.match.phase === 'countdown' ||
    room.match.phase === 'podium';
  const participantIds = isRoundPhase ? new Set(room.match.participantIds) : null;
  return [...room.snakes.values()]
    .filter((snake) => {
      if (snake.alive) {
        return true;
      }
      return isRoundPhase && !snake.isBot && participantIds.has(snake.id);
    })
    .map((snake) => ({
      id: snake.id,
      name: snake.name,
      score: Math.floor(snake.score),
      kills: Math.max(0, Math.floor(snake.kills || 0)),
      color: snake.color,
      // Never mark bots on the wire — they should look like regular players.
      isBot: false,
    }))
    // Rank by score only — kills are display-only and never reorder the board.
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function thinSegments(segments, maxPoints) {
  if (segments.length <= maxPoints) {
    return segments;
  }
  const thinned = [];
  const stride = Math.ceil(segments.length / maxPoints);
  for (let index = 0; index < segments.length; index += stride) {
    thinned.push(segments[index]);
  }
  const last = segments[segments.length - 1];
  const tail = thinned[thinned.length - 1];
  if (!tail || tail.x !== last.x || tail.y !== last.y) {
    thinned.push(last);
  }
  return thinned;
}

function flattenSegments(segments, maxPoints) {
  const thinned = thinSegments(segments, maxPoints);
  const flat = new Array(thinned.length * 2);
  for (let index = 0; index < thinned.length; index += 1) {
    flat[index * 2] = Math.round(thinned[index].x * 10) / 10;
    flat[index * 2 + 1] = Math.round(thinned[index].y * 10) / 10;
  }
  return flat;
}

function buildSharedWireState(room) {
  const now = Date.now();
  if (room.tickCount % 5 === 0 || room.cachedLeaderboard.length === 0) {
    room.cachedLeaderboard = buildLeaderboard(room);
  }
  const players = [];
  for (const snake of room.snakes.values()) {
    players.push({
      id: snake.id,
      name: snake.name,
      color: snake.color,
      skinId: snake.skinId,
      score: Math.floor(snake.score),
      kills: Math.max(0, Math.floor(snake.kills || 0)),
      radius: Math.round(radiusForSnake(snake) * 10) / 10,
      angle: Math.round(snake.angle * 1000) / 1000,
      alive: snake.alive,
      boosting: snake.boosting,
      hasSpeed: now < snake.speedUntil,
      hasShield: now < snake.shieldUntil,
      hasMagnet: now < snake.magnetUntil,
      isBot: false,
      spectating: Boolean(snake.spectating),
      segments: snake.alive ? flattenSegments(snake.segments, MAX_SEGMENTS_SEND) : [],
    });
  }
  const foodWire = new Array(room.foods.length);
  for (let index = 0; index < room.foods.length; index += 1) {
    const food = room.foods[index];
    foodWire[index] = [
      food.id,
      Math.round(food.x),
      Math.round(food.y),
      food.radius,
      food.color,
      food.kind,
    ];
  }
  const humanCount = countHumans(room);
  const botCount = countBots(room);
  return {
    type: 'state',
    roomId: room.id,
    players,
    foods: foodWire,
    leaderboard: room.cachedLeaderboard,
    playerCount: humanCount + botCount,
    botCount: 0,
    maxPlayers: MAX_PLAYERS,
    match: {
      phase: room.match.phase,
      phaseEndsAt: room.match.phaseEndsAt,
      roundStartedAt: room.match.roundStartedAt,
      arenaInsetRatio: room.match.arenaInsetRatio,
      activeBanner: room.match.activeBanner,
      podium: room.match.podium,
      nextEvent: match.getNextEventTeaser(room.match, Date.now()),
      humanCount: countHumans(room),
    },
  };
}

function broadcastStates(room) {
  if (room.snakes.size === 0) {
    return;
  }
  const payload = JSON.stringify(buildSharedWireState(room));
  for (const snake of room.snakes.values()) {
    if (snake.socket.readyState === 1) {
      snake.socket.send(payload);
    }
  }
}

function tickRoom(room) {
  const now = Date.now();
  const tickResult = match.tickMatch(room.match, now);
  for (const event of tickResult.eventsFired) {
    if (event.id === 'orb_rain') {
      for (let index = 0; index < 40; index += 1) {
        createRandomFood(room, Math.random() < 0.2 ? 'mega' : 'normal');
      }
    }
    broadcastKillFeed(room, {
      type: 'killFeed',
      line: `⚡ ${event.name}!`,
      cause: 'event',
      killerName: null,
      victimName: event.name,
    });
  }
  if (tickResult.transitionedTo === 'podium') {
    room.match.podium = match.buildPodium(room.match, room.snakes);
    for (const snake of room.snakes.values()) {
      snake.alive = false;
      snake.spectating = true;
      // Mass podium wipe skipped killSnake(), so bots never got a respawn timer.
      if (snake.isBot) {
        snake.botRespawnAt = Date.now() + match.PODIUM_MS;
      }
    }
  }
  if (tickResult.transitionedTo === 'waiting') {
    for (const snake of room.snakes.values()) {
      if (snake.isBot) {
        if (!snake.alive) {
          snake.botRespawnAt = Date.now();
        }
        continue;
      }
      snake.spectating = false;
    }
  }
  maintainBots(room);
  const isFreeroamPhase =
    room.match.phase === 'waiting' || room.match.phase === 'playing';
  if (isFreeroamPhase) {
    pullFoodTowardMagnets(room);
    for (const snake of room.snakes.values()) {
      if (!snake.alive) {
        continue;
      }
      if (snake.isBot) {
        updateBotBrain(room, snake);
      }
      moveSnake(room, snake);
      eatFood(room, snake);
    }
    collideSnakes(room);
  }
  maintainFoodCount(room);
  room.tickCount += 1;
  if (room.tickCount % NET_EVERY_TICKS === 0) {
    broadcastStates(room);
  }
}

function tick() {
  for (const room of rooms.values()) {
    if (room.snakes.size === 0) {
      continue;
    }
    tickRoom(room);
  }
  cleanupEmptyRooms();
}

function sendError(socket, message) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ type: 'error', message }));
  }
}

function getSnakeBySocket(socket) {
  const meta = socketToMeta.get(socket);
  if (!meta) {
    return null;
  }
  const room = rooms.get(meta.roomId);
  return room ? room.snakes.get(meta.snakeId) ?? null : null;
}

function handleJoin(socket, payload) {
  const existing = getSnakeBySocket(socket);
  if (existing) {
    if (!existing.alive) {
      const existingRoom = getRoomBySocket(socket);
      if (existingRoom) {
        existingRoom.snakes.delete(existing.id);
      }
      socketToMeta.delete(socket);
    } else {
      sendError(socket, 'Already in game.');
      return;
    }
  }
  const room = getOrCreateRoom(payload.roomId);
  if (countHumans(room) >= MAX_PLAYERS) {
    sendError(socket, 'Room full (max 20).');
    return;
  }
  while (room.snakes.size >= MAX_PLAYERS) {
    removeOneBot(room);
  }
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
  const name = rawName.slice(0, 14) || `Snake ${countHumans(room) + 1}`;
  const snake = createSnake(room, socket, name, payload.color, {
    skinId: typeof payload.skinId === 'string' ? payload.skinId : undefined,
  });
  const isRoundActive =
    room.match.phase === 'playing' ||
    room.match.phase === 'countdown' ||
    room.match.phase === 'podium';
  if (isRoundActive) {
    snake.alive = false;
    snake.spectating = true;
  }
  room.snakes.set(snake.id, snake);
  socketToMeta.set(socket, { roomId: room.id, snakeId: snake.id });
  maintainBots(room);
  socket.send(JSON.stringify({
    type: 'joined',
    playerId: snake.id,
    name: snake.name,
    color: snake.color,
    skinId: snake.skinId,
    roomId: room.id,
    mapSize: MAP_SIZE,
  }));
  if (isRoundActive && socket.readyState === 1) {
    socket.send(JSON.stringify({ type: 'spectating', reason: 'round' }));
  }
}

function handleInput(socket, payload) {
  const snake = getSnakeBySocket(socket);
  if (!snake || !snake.alive) {
    return;
  }
  if (typeof payload.angle === 'number' && Number.isFinite(payload.angle)) {
    snake.targetAngle = wrapAngle(payload.angle);
  }
  snake.boosting = Boolean(payload.boost);
}

/**
 * @param {Room} room
 * @param {Snake} snake
 */
function respawnSnakeInPlace(room, snake) {
  const spawn = clampToMap({
    x: randomRange(MAP_SIZE * 0.2, MAP_SIZE * 0.8),
    y: randomRange(MAP_SIZE * 0.2, MAP_SIZE * 0.8),
  });
  const angle = randomRange(-Math.PI, Math.PI);
  /** @type {Point[]} */
  const segments = [];
  for (let index = 0; index < START_SEGMENTS; index += 1) {
    segments.push({
      x: spawn.x - Math.cos(angle) * index * SEGMENT_SPACING,
      y: spawn.y - Math.sin(angle) * index * SEGMENT_SPACING,
    });
  }
  snake.angle = angle;
  snake.targetAngle = angle;
  snake.boosting = false;
  snake.segments = segments;
  snake.score = START_SEGMENTS;
  snake.alive = true;
  snake.spawnProtectedUntil = Date.now() + 2500;
  snake.speedUntil = 0;
  snake.shieldUntil = 0;
  snake.magnetUntil = 0;
  snake.spectating = false;
  snake.roundScoreLocked = false;
}

function handleStartRound(socket) {
  const room = getRoomBySocket(socket);
  if (!room) {
    sendError(socket, 'Join a room first.');
    return;
  }
  const humans = [...room.snakes.values()].filter((snake) => !snake.isBot);
  if (!match.canStartRound(humans.length, room.match.phase)) {
    sendError(socket, 'Need 2 players in the lobby to start.');
    return;
  }
  match.beginCountdown(
    room.match,
    Date.now(),
    humans.map((snake) => snake.id),
  );
  for (const snake of humans) {
    respawnSnakeInPlace(room, snake);
  }
}

function handleRespawn(socket, payload) {
  const existing = getSnakeBySocket(socket);
  const room = getRoomBySocket(socket);
  if (existing && room) {
    if (
      room.match.phase === 'playing' ||
      room.match.phase === 'countdown' ||
      room.match.phase === 'podium'
    ) {
      existing.spectating = true;
      existing.alive = false;
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'spectating', reason: 'round' }));
      }
      return;
    }
    room.snakes.delete(existing.id);
    socketToMeta.delete(socket);
  }
  handleJoin(socket, payload);
}

function handlePing(socket, payload) {
  if (socket.readyState !== 1) {
    return;
  }
  socket.send(JSON.stringify({
    type: 'pong',
    t: typeof payload.t === 'number' ? payload.t : 0,
  }));
}

function removeSocket(socket) {
  const meta = socketToMeta.get(socket);
  if (!meta) {
    return;
  }
  const room = rooms.get(meta.roomId);
  const snake = room ? room.snakes.get(meta.snakeId) : null;
  if (room && snake) {
    if (snake.alive) {
      dropFoodFromSnake(room, snake);
    }
    room.snakes.delete(meta.snakeId);
    maintainBots(room);
  }
  socketToMeta.delete(socket);
}

function handleMessage(socket, raw) {
  let payload;
  try {
    payload = JSON.parse(String(raw));
  } catch {
    sendError(socket, 'Invalid message.');
    return;
  }
  switch (payload.type) {
    case 'join':
      handleJoin(socket, payload);
      break;
    case 'input':
      handleInput(socket, payload);
      break;
    case 'respawn':
      handleRespawn(socket, payload);
      break;
    case 'startRound':
      handleStartRound(socket);
      break;
    case 'ping':
      handlePing(socket, payload);
      break;
    default:
      sendError(socket, 'Unknown action.');
  }
}

function serveStatic(request, response) {
  // Query strings like /?name=Sarthak must still serve the lobby.
  // Only exact `url === '/'` used to rewrite — that missed `/?...` and 404'd.
  let requestPath = (request.url ?? '/').split('?')[0] || '/';
  if (requestPath === '/') {
    requestPath = '/index.html';
  }
  // Browsers auto-request these; map them to our SVG mark.
  if (
    requestPath === '/favicon.ico' ||
    requestPath === '/apple-touch-icon.png' ||
    requestPath === '/apple-touch-icon-precomposed.png'
  ) {
    requestPath = '/favicon.svg';
  }
  // Strip leading slash so path.join doesn't ignore PUBLIC_DIR on POSIX.
  const relativePath = requestPath.replace(/^[/\\]+/, '');
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '..' || safePath.startsWith(`..${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const extension = path.extname(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(data);
  });
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

const server = http.createServer(serveStatic);
const webSocketServer = new WebSocketServer({ server });
webSocketServerRef = webSocketServer;

webSocketServer.on('connection', (socket) => {
  const defaultRoom = getOrCreateRoom(DEFAULT_ROOM_ID);
  socket.send(JSON.stringify({
    type: 'hello',
    maxPlayers: MAX_PLAYERS,
    playerCount: countHumans(defaultRoom),
    botCount: countBots(defaultRoom),
    defaultRoomId: DEFAULT_ROOM_ID,
    mapSize: MAP_SIZE,
    skins: SKINS,
    tickRate: TICK_RATE,
    netRate: NET_RATE,
    baseSpeed: BASE_SPEED,
    boostMultiplier: BOOST_MULTIPLIER,
    speedPowerMultiplier: SPEED_POWER_MULTIPLIER,
  }));
  socket.on('message', (data) => handleMessage(socket, data));
  socket.on('close', () => removeSocket(socket));
});

setInterval(tick, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Snake With Friends running on port ${PORT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  for (const address of getLanAddresses()) {
    console.log(`Network: http://${address}:${PORT}`);
  }
  console.log('Share a room link: ?room=YOURCODE (3–12 letters/numbers)');
});
