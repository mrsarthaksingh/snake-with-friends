'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const growth = require('./snake-growth');

describe('snake growth', () => {
  it('keeps a minimum body at low scores', () => {
    assert.equal(growth.segmentCountForScore(0), growth.START_SEGMENTS);
    assert.equal(growth.segmentCountForScore(5), growth.START_SEGMENTS);
  });

  it('grows 1:1 with score through the linear phase', () => {
    assert.equal(growth.segmentCountForScore(80), 80);
    assert.equal(growth.segmentCountForScore(160), growth.LINEAR_LENGTH_UNTIL);
  });

  it('keeps growing after the linear phase so size never feels frozen', () => {
    const atLinear = growth.segmentCountForScore(160);
    const midFarm = growth.segmentCountForScore(400);
    const lateFarm = growth.segmentCountForScore(2000);
    assert.ok(midFarm > atLinear);
    assert.ok(lateFarm > midFarm);
  });

  it('hard-caps length so freeroam bots cannot carpet the map', () => {
    assert.equal(growth.segmentCountForScore(10_316), growth.MAX_SNAKE_SEGMENTS);
    assert.equal(growth.segmentCountForScore(1_000_000), growth.MAX_SNAKE_SEGMENTS);
  });

  it('keeps thickening with score instead of hard-stopping radius early', () => {
    const early = growth.radiusForScore(80);
    const mid = growth.radiusForScore(400);
    const late = growth.radiusForScore(3000);
    assert.ok(mid > early);
    assert.ok(late > mid);
    assert.ok(late < growth.MAX_RADIUS);
    assert.ok(growth.radiusForScore(100_000) > late);
  });
});
