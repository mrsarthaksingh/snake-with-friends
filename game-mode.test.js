'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const gameMode = require('./game-mode');

describe('game mode', () => {
  it('normalizes mode aliases and defaults to multi', () => {
    assert.equal(gameMode.normalizeMode('single'), 'single');
    assert.equal(gameMode.normalizeMode('solo'), 'single');
    assert.equal(gameMode.normalizeMode('Multiplayer'), 'multi');
    assert.equal(gameMode.normalizeMode('arena'), 'arena');
    assert.equal(gameMode.normalizeMode(''), 'multi');
    assert.equal(gameMode.normalizeMode('nope', 'arena'), 'arena');
  });

  it('gives Single a full bot lobby', () => {
    assert.equal(gameMode.desiredBotCountForMode('single', 1), 10);
    assert.equal(gameMode.desiredBotCountForMode('single', 0), 10);
  });

  it('gives Arena zero bots', () => {
    assert.equal(gameMode.desiredBotCountForMode('arena', 1), 0);
    assert.equal(gameMode.desiredBotCountForMode('arena', 8), 0);
  });

  it('fills Multi bots only below 5 humans', () => {
    assert.equal(gameMode.desiredBotCountForMode('multi', 1), 4);
    assert.equal(gameMode.desiredBotCountForMode('multi', 2), 3);
    assert.equal(gameMode.desiredBotCountForMode('multi', 4), 1);
    assert.equal(gameMode.desiredBotCountForMode('multi', 5), 0);
    assert.equal(gameMode.desiredBotCountForMode('multi', 12), 0);
  });

  it('requires 2 humans to start Arena', () => {
    assert.equal(gameMode.canStartArena(1), false);
    assert.equal(gameMode.canStartArena(2), true);
  });

  it('reports mode mismatch clearly', () => {
    assert.equal(gameMode.modeMismatchMessage('arena', 'arena'), null);
    assert.match(gameMode.modeMismatchMessage('arena', 'multi') || '', /Arena/);
  });

  it('builds a valid private Single room id', () => {
    const id = gameMode.createPrivateSingleRoomId();
    assert.match(id, /^[A-Z0-9]{3,12}$/);
    assert.ok(id.startsWith('S'));
  });
});
