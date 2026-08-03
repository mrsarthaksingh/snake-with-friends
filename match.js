'use strict';

/** @typedef {'waiting' | 'countdown' | 'playing' | 'podium'} MatchPhase */

/**
 * @typedef {Object} MatchState
 * @property {MatchPhase} phase
 * @property {number} phaseEndsAt
 * @property {number} roundStartedAt
 * @property {string[]} participantIds
 * @property {Record<string, number>} killsByPlayerId
 * @property {string[]} firedEventIds
 * @property {null | { id: string; name: string; untilMs: number }} activeBanner
 * @property {number} arenaRadiusRatio
 * @property {PodiumEntry[]} podium
 */

/**
 * @typedef {Object} MatchTickResult
 * @property {MatchPhase | null} transitionedTo
 * @property {Array<{ id: string; name: string }>} eventsFired
 */

/**
 * @typedef {Object} PodiumEntry
 * @property {number} place
 * @property {string} id
 * @property {string} name
 * @property {number} score
 * @property {number} kills
 */

const ROUND_MS = 180_000;
const COUNTDOWN_MS = 3_000;
const PODIUM_MS = 8_000;
const KILL_SCORE_BONUS = 5;
const BANNER_MS = 2_000;
const SHRINK_PREVIEW_MS = 20_000;

/** Playable circle radius as a fraction of max (100% → 80% → 60% → 30%). */
const ARENA_RADIUS_RATIOS = Object.freeze([1, 0.8, 0.6, 0.3]);

const SCHEDULE = Object.freeze([
  { atMs: 20_000, id: 'orb_rain', name: 'Orb Rain' },
  { atMs: 60_000, id: 'shrink_80', name: 'Zone Shrinking', radiusRatio: 0.8 },
  { atMs: 120_000, id: 'shrink_60', name: 'Zone Shrinking', radiusRatio: 0.6 },
  { atMs: 150_000, id: 'shrink_30', name: 'Final Zone', radiusRatio: 0.3 },
]);

/**
 * @returns {MatchState}
 */
function createMatchState() {
  return {
    phase: 'waiting',
    phaseEndsAt: 0,
    roundStartedAt: 0,
    participantIds: [],
    killsByPlayerId: {},
    firedEventIds: [],
    activeBanner: null,
    arenaRadiusRatio: 1,
    podium: [],
  };
}

/**
 * @param {number} humanCount
 * @param {string} matchState
 * @returns {boolean}
 */
function canStartRound(humanCount, matchState) {
  return humanCount >= 2 && matchState === 'waiting';
}

/**
 * @param {MatchState} match
 * @param {number} nowMs
 * @param {string[]} participantIds
 */
function beginCountdown(match, nowMs, participantIds) {
  if (!canStartRound(participantIds.length, match.phase)) {
    return;
  }
  match.phase = 'countdown';
  match.phaseEndsAt = nowMs + COUNTDOWN_MS;
  match.roundStartedAt = 0;
  match.participantIds = [...participantIds];
  match.killsByPlayerId = {};
  match.firedEventIds = [];
  match.activeBanner = null;
  match.arenaRadiusRatio = 1;
  match.podium = [];
}

/**
 * @param {MatchState} match
 * @param {number} nowMs
 * @returns {MatchTickResult}
 */
function tickMatch(match, nowMs) {
  if (match.phase === 'countdown' && nowMs >= match.phaseEndsAt) {
    match.phase = 'playing';
    match.roundStartedAt = nowMs;
    match.phaseEndsAt = nowMs + ROUND_MS;
    match.firedEventIds = [];
    match.arenaRadiusRatio = 1;
    return { transitionedTo: 'playing', eventsFired: [] };
  }
  if (match.phase === 'playing') {
    const eventsFired = [];
    const elapsed = nowMs - match.roundStartedAt;
    for (const entry of SCHEDULE) {
      if (entry.atMs <= elapsed && !match.firedEventIds.includes(entry.id)) {
        eventsFired.push({ id: entry.id, name: entry.name });
        match.firedEventIds.push(entry.id);
        match.activeBanner = { id: entry.id, name: entry.name, untilMs: nowMs + BANNER_MS };
        if (typeof entry.radiusRatio === 'number') {
          match.arenaRadiusRatio = entry.radiusRatio;
        }
      }
    }
    if (nowMs >= match.phaseEndsAt) {
      match.phase = 'podium';
      match.phaseEndsAt = nowMs + PODIUM_MS;
      return { transitionedTo: 'podium', eventsFired };
    }
    return { transitionedTo: null, eventsFired };
  }
  if (match.phase === 'podium' && nowMs >= match.phaseEndsAt) {
    Object.assign(match, createMatchState());
    return { transitionedTo: 'waiting', eventsFired: [] };
  }
  return { transitionedTo: null, eventsFired: [] };
}

/**
 * @param {MatchState} match
 * @param {string | null} killerId
 */
function recordKill(match, killerId) {
  if (killerId === null) {
    return;
  }
  match.killsByPlayerId[killerId] = (match.killsByPlayerId[killerId] || 0) + 1;
}

/**
 * @param {MatchState} match
 * @param {Map<string, { id: string; name: string; score: number; isBot?: boolean }>} snakesById
 * @returns {PodiumEntry[]}
 */
function buildPodium(match, snakesById) {
  const entries = match.participantIds
    .map((id) => {
      const snake = snakesById.get(id);
      if (!snake || snake.isBot) {
        return null;
      }
      return {
        id: snake.id,
        name: snake.name,
        score: Math.floor(snake.score),
        kills: match.killsByPlayerId[id] || 0,
      };
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return match.participantIds.indexOf(left.id) - match.participantIds.indexOf(right.id);
    })
    .slice(0, 10)
    .map((entry, index) => ({
      place: index + 1,
      id: entry.id,
      name: entry.name,
      score: entry.score,
      kills: entry.kills,
    }));
  return entries;
}

/**
 * @param {number} mapSize
 * @param {number} insetRatio
 * @returns {{ min: number; max: number }}
 */
function arenaBounds(mapSize, insetRatio) {
  const arena = require('./public/arena');
  return arena.arenaBounds(mapSize, insetRatio);
}

/**
 * @param {MatchState} match
 * @param {number} nowMs
 * @returns {{ id: string; name: string; startsInMs: number } | null}
 */
function getNextEventTeaser(match, nowMs) {
  if (match.phase !== 'playing') {
    return null;
  }
  const elapsed = nowMs - match.roundStartedAt;
  let soonest = null;
  for (const entry of SCHEDULE) {
    if (match.firedEventIds.includes(entry.id)) {
      continue;
    }
    const startsInMs = Math.max(0, entry.atMs - elapsed);
    if (soonest === null || startsInMs < soonest.startsInMs) {
      soonest = { id: entry.id, name: entry.name, startsInMs };
    }
  }
  return soonest;
}

/**
 * @param {MatchState} match
 * @param {number} nowMs
 * @returns {{ radiusRatio: number; startsInMs: number; percent: number } | null}
 */
function getNextShrinkPreview(match, nowMs) {
  if (match.phase !== 'playing') {
    return null;
  }
  const elapsed = nowMs - match.roundStartedAt;
  for (const entry of SCHEDULE) {
    if (typeof entry.radiusRatio !== 'number' || match.firedEventIds.includes(entry.id)) {
      continue;
    }
    const startsInMs = Math.max(0, entry.atMs - elapsed);
    return {
      radiusRatio: entry.radiusRatio,
      startsInMs,
      percent: Math.round(entry.radiusRatio * 100),
    };
  }
  return null;
}

module.exports = {
  ROUND_MS,
  COUNTDOWN_MS,
  PODIUM_MS,
  KILL_SCORE_BONUS,
  BANNER_MS,
  SHRINK_PREVIEW_MS,
  ARENA_RADIUS_RATIOS,
  SCHEDULE,
  createMatchState,
  canStartRound,
  beginCountdown,
  tickMatch,
  recordKill,
  buildPodium,
  arenaBounds,
  getNextEventTeaser,
  getNextShrinkPreview,
};
