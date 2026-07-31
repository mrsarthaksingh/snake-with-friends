'use strict';

const START_SEGMENTS = 12;
/** Classic 1:1 length growth through this score — still feels like old snake. */
const LINEAR_LENGTH_UNTIL = 160;
/**
 * Absolute ceiling so freeroam farming cannot carpet the map
 * (old bug: score 10k → 10k segments).
 */
const MAX_SNAKE_SEGMENTS = 280;
/** How fast length creeps up after the linear phase (log curve). */
const POST_LINEAR_LENGTH_FACTOR = 16;

const MIN_RADIUS = 7;
const MAX_RADIUS = 30;
/** Higher = thickness keeps growing longer into a farm session. */
const RADIUS_GROWTH_HALF_SCORE = 420;

/**
 * Map score → segment count.
 * - Early/mid: 1:1 with score (same feel as before).
 * - Late: slow log growth so size never "freezes", but stays map-safe.
 * @param {number} score
 * @returns {number}
 */
function segmentCountForScore(score) {
  const safe = Math.max(0, Number(score) || 0);
  if (safe <= LINEAR_LENGTH_UNTIL) {
    return Math.max(START_SEGMENTS, Math.floor(safe));
  }
  const extra = Math.floor(Math.log1p(safe - LINEAR_LENGTH_UNTIL) * POST_LINEAR_LENGTH_FACTOR);
  return Math.min(MAX_SNAKE_SEGMENTS, LINEAR_LENGTH_UNTIL + extra);
}

/**
 * Soft approach to max thickness — always a little growth left, never a hard stop feel.
 * @param {number} score
 * @returns {number}
 */
function radiusForScore(score) {
  const safe = Math.max(0, Number(score) || 0);
  const progress = 1 - 1 / (1 + safe / RADIUS_GROWTH_HALF_SCORE);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * progress;
}

module.exports = {
  START_SEGMENTS,
  LINEAR_LENGTH_UNTIL,
  MAX_SNAKE_SEGMENTS,
  MIN_RADIUS,
  MAX_RADIUS,
  segmentCountForScore,
  radiusForScore,
};
