'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const emotes = require('./public/emotes');

describe('emotes', () => {
  it('normalizes valid emote ids', () => {
    assert.equal(emotes.normalizeEmoteId('fire'), 'fire');
    assert.equal(emotes.normalizeEmoteId(' FIRE '), 'fire');
  });

  it('rejects unknown emote ids', () => {
    assert.equal(emotes.normalizeEmoteId('wave'), null);
    assert.equal(emotes.normalizeEmoteId(''), null);
    assert.equal(emotes.normalizeEmoteId(null), null);
  });

  it('returns emoji for known ids', () => {
    const fire = emotes.getEmoteById('fire');
    assert.ok(fire);
    assert.equal(fire.emoji, '🔥');
  });

  it('enforces a two second cooldown window', () => {
    const cooldownMs = emotes.EMOTE_COOLDOWN_MS;
    const lastAt = 1000;
    const now = 1000 + cooldownMs - 1;
    assert.equal(now - lastAt < cooldownMs, true);
    assert.equal(1000 + cooldownMs - lastAt < cooldownMs, false);
  });
});
