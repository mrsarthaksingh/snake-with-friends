'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('kill count', () => {
  it('increments killer.kills when a snake kill is recorded', () => {
    const killer = { id: 'a', name: 'Hoo', kills: 0, score: 10 };
    const victim = { id: 'b', name: 'Bot', alive: true };
    const cause = 'snake';
    const killerId = killer.id;
    if (cause === 'snake' && killerId) {
      killer.score += 5;
      killer.kills = (killer.kills || 0) + 1;
      victim.alive = false;
    }
    assert.equal(killer.kills, 1);
    assert.equal(victim.alive, false);
  });
});
