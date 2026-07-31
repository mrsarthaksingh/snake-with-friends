'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const growth = require('./snake-growth');

describe('snake growth', () => {
  it('keeps a minimum body at low scores', () => {
    assert.equal(growth.segmentCountForScore(0), growth.START_SEGMENTS);
    assert.equal(growth.segmentCountForScore(5), growth.START_SEGMENTS);
  });

  it('grows 1:1 with score until the hard cap', () => {
    assert.equal(growth.segmentCountForScore(80), 80);
    assert.equal(growth.segmentCountForScore(160), growth.MAX_SNAKE_SEGMENTS);
  });

  it('hard-caps length so freeroam bots cannot carpet the map', () => {
    assert.equal(growth.segmentCountForScore(10_316), growth.MAX_SNAKE_SEGMENTS);
    assert.equal(growth.segmentCountForScore(1_000_000), growth.MAX_SNAKE_SEGMENTS);
  });
});
