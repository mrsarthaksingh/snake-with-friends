'use strict';

/** @typedef {'single' | 'multi' | 'arena'} GameMode */

const MODES = Object.freeze(['single', 'multi', 'arena']);
const SINGLE_BOT_COUNT = 10;
const MULTI_BOT_HUMAN_THRESHOLD = 5;
const MULTI_MAX_BOTS = 4;
const ARENA_MIN_HUMANS = 2;

/**
 * @param {unknown} raw
 * @param {GameMode} [fallback]
 * @returns {GameMode}
 */
function normalizeMode(raw, fallback = 'multi') {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'single' || value === 'solo') {
    return 'single';
  }
  if (value === 'multi' || value === 'multiplayer' || value === 'mp') {
    return 'multi';
  }
  if (value === 'arena' || value === 'match') {
    return 'arena';
  }
  return fallback;
}

/**
 * @param {GameMode} mode
 * @param {number} humanCount
 * @returns {number}
 */
function desiredBotCountForMode(mode, humanCount) {
  const humans = Math.max(0, Math.floor(Number(humanCount) || 0));
  if (mode === 'single') {
    return SINGLE_BOT_COUNT;
  }
  if (mode === 'arena') {
    return 0;
  }
  if (humans >= MULTI_BOT_HUMAN_THRESHOLD) {
    return 0;
  }
  return Math.min(MULTI_MAX_BOTS, Math.max(0, MULTI_BOT_HUMAN_THRESHOLD - humans));
}

/**
 * @param {number} humanCount
 * @returns {boolean}
 */
function canStartArena(humanCount) {
  return Math.max(0, Math.floor(Number(humanCount) || 0)) >= ARENA_MIN_HUMANS;
}

/**
 * @param {GameMode} roomMode
 * @param {GameMode} joinMode
 * @returns {string | null}
 */
function modeMismatchMessage(roomMode, joinMode) {
  if (roomMode === joinMode) {
    return null;
  }
  const labels = {
    single: 'Single',
    multi: 'Multiplayer',
    arena: 'Arena',
  };
  return `This room is ${labels[roomMode]} — pick ${labels[roomMode]} to join.`;
}

/**
 * @returns {string}
 */
function singleCapacityMessage() {
  return 'Single mode is solo — use Multiplayer.';
}

/**
 * Private room id for Single (3–12 A-Z0-9).
 * @returns {string}
 */
function createPrivateSingleRoomId() {
  const hex = require('crypto').randomBytes(5).toString('hex').toUpperCase();
  return `S${hex}`.slice(0, 12);
}

module.exports = {
  MODES,
  SINGLE_BOT_COUNT,
  MULTI_BOT_HUMAN_THRESHOLD,
  MULTI_MAX_BOTS,
  ARENA_MIN_HUMANS,
  normalizeMode,
  desiredBotCountForMode,
  canStartArena,
  modeMismatchMessage,
  singleCapacityMessage,
  createPrivateSingleRoomId,
};
