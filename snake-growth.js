'use strict';

const START_SEGMENTS = 12;
/**
 * Hard cap on body beads. Freeroam bots used to grow 1 segment per score
 * point with no ceiling (score 10k → 10k segments), carpeting the map and
 * creating invisible hitboxes where the wire-thinned draw had gaps.
 */
const MAX_SNAKE_SEGMENTS = 160;

/**
 * Map score → segment count. Early game stays 1:1 with score; past the cap
 * score may keep climbing for the leaderboard but the body stops growing.
 * @param {number} score
 * @returns {number}
 */
function segmentCountForScore(score) {
  const safe = Math.max(0, Number(score) || 0);
  return Math.min(MAX_SNAKE_SEGMENTS, Math.max(START_SEGMENTS, Math.floor(safe)));
}

module.exports = {
  START_SEGMENTS,
  MAX_SNAKE_SEGMENTS,
  segmentCountForScore,
};
