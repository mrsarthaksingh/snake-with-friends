'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const arena = require('./public/arena');

const MAP_SIZE = 5000;

describe('arena geometry', () => {
  it('clamps points outside a circular playable zone inward', () => {
    const center = arena.arenaCenter(MAP_SIZE);
    const far = { x: center.x + 5000, y: center.y };
    const clamped = arena.clampPointToCircle(far, 12, MAP_SIZE, 0.8);
    const maxR = arena.playableRadius(MAP_SIZE, 0.8) - arena.BORDER_PADDING - 12;
    const dist = Math.hypot(clamped.x - center.x, clamped.y - center.y);
    assert.ok(dist <= maxR + 0.01);
  });

  it('keeps points inside a circular playable zone unchanged', () => {
    const center = arena.arenaCenter(MAP_SIZE);
    const inside = { x: center.x + 40, y: center.y + 20 };
    const clamped = arena.clampPointToCircle(inside, 8, MAP_SIZE, 1);
    assert.equal(clamped.x, inside.x);
    assert.equal(clamped.y, inside.y);
  });

  it('still supports rectangular freeroam bounds', () => {
    const outside = { x: -40, y: MAP_SIZE + 80 };
    const clamped = arena.clampPointToRect(outside, 24, MAP_SIZE, 0);
    const edge = arena.BORDER_PADDING + 24;
    assert.equal(clamped.x, edge);
    assert.equal(clamped.y, MAP_SIZE - edge);
  });
});
