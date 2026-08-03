'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  headPathHitsPoint,
  headsCollide,
  resolveHeadOnKills,
} = require('./collision');

describe('collision', () => {
  it('detects a body point along a fast head sweep', () => {
    const prevHead = { x: 0, y: 0 };
    const head = { x: 40, y: 0 };
    const bodyPoint = { x: 20, y: 4 };
    const hit = headPathHitsPoint(prevHead, head, bodyPoint, 6);
    assert.equal(hit, true);
  });

  it('misses when the sweep passes far from the body point', () => {
    const prevHead = { x: 0, y: 0 };
    const head = { x: 40, y: 0 };
    const bodyPoint = { x: 20, y: 30 };
    const hit = headPathHitsPoint(prevHead, head, bodyPoint, 6);
    assert.equal(hit, false);
  });

  it('detects fast head-on contact between swept paths', () => {
    const prevA = { x: 0, y: 0 };
    const headA = { x: 30, y: 0 };
    const prevB = { x: 30, y: 0 };
    const headB = { x: 0, y: 0 };
    const hit = headsCollide(prevA, headA, 5, prevB, headB, 5);
    assert.equal(hit, true);
  });

  it('kills the smaller snake in a head-on tie-break', () => {
    const kills = resolveHeadOnKills(
      { id: 'small', score: 12 },
      { id: 'big', score: 40 },
    );
    assert.deepEqual(kills, [{ victimId: 'small', killerId: 'big' }]);
  });

  it('kills both snakes when scores are equal', () => {
    const kills = resolveHeadOnKills(
      { id: 'a', score: 20 },
      { id: 'b', score: 20 },
    );
    assert.equal(kills.length, 2);
  });
});
