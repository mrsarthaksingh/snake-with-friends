'use strict';

(function attachSnakeGrowth(root) {
  const START_SEGMENTS = 12;
  const LINEAR_LENGTH_UNTIL = 160;
  const MAX_SNAKE_SEGMENTS = 280;
  const POST_LINEAR_LENGTH_FACTOR = 16;
  const MIN_RADIUS = 7;
  const MAX_RADIUS = 30;
  const RADIUS_GROWTH_HALF_SCORE = 420;
  const BASE_SPEED = 9.0;
  const MAX_SIZE_SPEED_PENALTY = 0.75;
  const SIZE_SPEED_PENALTY_PER_SEGMENT = 0.0028;

  function segmentCountForScore(score) {
    const safe = Math.max(0, Number(score) || 0);
    if (safe <= LINEAR_LENGTH_UNTIL) {
      return Math.max(START_SEGMENTS, Math.floor(safe));
    }
    const extra = Math.floor(Math.log1p(safe - LINEAR_LENGTH_UNTIL) * POST_LINEAR_LENGTH_FACTOR);
    return Math.min(MAX_SNAKE_SEGMENTS, LINEAR_LENGTH_UNTIL + extra);
  }

  function radiusForScore(score) {
    const safe = Math.max(0, Number(score) || 0);
    const progress = 1 - 1 / (1 + safe / RADIUS_GROWTH_HALF_SCORE);
    return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * progress;
  }

  function baseSpeedForScore(score) {
    const bodySize = segmentCountForScore(score);
    const sizePenalty = Math.min(
      MAX_SIZE_SPEED_PENALTY,
      Math.max(0, bodySize - START_SEGMENTS) * SIZE_SPEED_PENALTY_PER_SEGMENT,
    );
    return BASE_SPEED - sizePenalty;
  }

  function cameraZoomForRadius(radius) {
    const safeRadius = Math.max(MIN_RADIUS, Number(radius) || MIN_RADIUS);
    return Math.max(0.72, Math.min(1.18, 0.58 + 7.8 / safeRadius));
  }

  const api = Object.freeze({
    START_SEGMENTS,
    BASE_SPEED,
    segmentCountForScore,
    radiusForScore,
    baseSpeedForScore,
    cameraZoomForRadius,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SnakeGrowth = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined);
