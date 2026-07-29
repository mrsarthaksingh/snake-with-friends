'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const match = require('./match');

describe('match', () => {
  it('refuses start with fewer than 2 humans', () => {
    assert.equal(match.canStartRound(1, 'waiting'), false);
    assert.equal(match.canStartRound(2, 'waiting'), true);
    assert.equal(match.canStartRound(2, 'playing'), false);
  });

  it('countdown then playing then podium then waiting', () => {
    const state = match.createMatchState();
    const t0 = 1_000_000;
    match.beginCountdown(state, t0, ['a', 'b']);
    assert.equal(state.phase, 'countdown');
    let result = match.tickMatch(state, t0 + match.COUNTDOWN_MS);
    assert.equal(state.phase, 'playing');
    assert.equal(result.transitionedTo, 'playing');
    result = match.tickMatch(state, state.roundStartedAt + match.ROUND_MS);
    assert.equal(state.phase, 'podium');
    assert.equal(result.transitionedTo, 'podium');
    result = match.tickMatch(state, state.phaseEndsAt);
    assert.equal(state.phase, 'waiting');
    assert.equal(result.transitionedTo, 'waiting');
  });

  it('fires orb_rain at 20s and final_shrink at 120s once each', () => {
    const state = match.createMatchState();
    const t0 = 5_000_000;
    match.beginCountdown(state, t0, ['a', 'b']);
    match.tickMatch(state, t0 + match.COUNTDOWN_MS);
    const start = state.roundStartedAt;
    let result = match.tickMatch(state, start + 20_000);
    assert.deepEqual(result.eventsFired.map((e) => e.id), ['orb_rain']);
    result = match.tickMatch(state, start + 20_000);
    assert.deepEqual(result.eventsFired, []);
    result = match.tickMatch(state, start + 120_000);
    assert.deepEqual(result.eventsFired.map((e) => e.id), ['final_shrink']);
    assert.equal(state.arenaInsetRatio, match.SHRINK_INSET_RATIO);
  });

  it('ranks podium by score then kills', () => {
    const state = match.createMatchState();
    state.phase = 'podium';
    state.participantIds = ['a', 'b', 'c'];
    state.killsByPlayerId = { a: 1, b: 5, c: 0 };
    const snakes = new Map([
      ['a', { id: 'a', name: 'A', score: 100 }],
      ['b', { id: 'b', name: 'B', score: 100 }],
      ['c', { id: 'c', name: 'C', score: 50, isBot: false }],
    ]);
    const podium = match.buildPodium(state, snakes);
    assert.equal(podium[0].id, 'b');
    assert.equal(podium[1].id, 'a');
    assert.equal(podium[2].id, 'c');
  });

  it('ranks podium ties by participant join order', () => {
    const state = match.createMatchState();
    state.phase = 'podium';
    state.participantIds = ['a', 'b'];
    state.killsByPlayerId = { a: 3, b: 3 };
    const snakes = new Map([
      ['a', { id: 'a', name: 'Zebra', score: 50 }],
      ['b', { id: 'b', name: 'Alpha', score: 50 }],
    ]);
    const podium = match.buildPodium(state, snakes);
    assert.equal(podium[0].id, 'a');
    assert.equal(podium[1].id, 'b');
  });

  it('arenaBounds applies inset', () => {
    const bounds = match.arenaBounds(5000, 0.12);
    assert.equal(bounds.min, 600);
    assert.equal(bounds.max, 4400);
  });
});
