'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const match = require('./match');

const MAP_SIZE = 5000;
const BORDER_PADDING = 8;

function clampPointToArena(point, radius, insetRatio = 0) {
  const bounds = match.arenaBounds(MAP_SIZE, insetRatio);
  const edge = BORDER_PADDING + Math.max(0, radius);
  return {
    x: Math.min(bounds.max - edge, Math.max(bounds.min + edge, point.x)),
    y: Math.min(bounds.max - edge, Math.max(bounds.min + edge, point.y)),
  };
}

describe('arena body clamp', () => {
  it('pulls body beads that swing past the red border back inside', () => {
    const radius = 24;
    const outside = { x: -40, y: MAP_SIZE + 80 };
    const clamped = clampPointToArena(outside, radius, 0);
    const edge = BORDER_PADDING + radius;
    assert.equal(clamped.x, edge);
    assert.equal(clamped.y, MAP_SIZE - edge);
  });

  it('respects chaos shrink inset', () => {
    const radius = 12;
    const insetRatio = match.SHRINK_INSET_RATIO;
    const bounds = match.arenaBounds(MAP_SIZE, insetRatio);
    const clamped = clampPointToArena({ x: 0, y: 0 }, radius, insetRatio);
    const edge = BORDER_PADDING + radius;
    assert.equal(clamped.x, bounds.min + edge);
    assert.equal(clamped.y, bounds.min + edge);
  });
});
