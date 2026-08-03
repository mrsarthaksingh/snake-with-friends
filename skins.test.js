'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const skins = require('./public/skins');

describe('skins catalog', () => {
  it('detects animated skins by anim field', () => {
    const animated = skins.getSkinById('aurora_flow');
    const classic = skins.getSkinById('viper_green');
    assert.ok(animated);
    assert.ok(classic);
    assert.equal(skins.isAnimatedSkin(animated), true);
    assert.equal(skins.isAnimatedSkin(classic), false);
  });

  it('resolves skin by id', () => {
    const resolved = skins.resolveSkin('ember_pulse', '#000000');
    assert.equal(resolved.id, 'ember_pulse');
    assert.equal(resolved.anim, 'inferno');
    assert.equal(resolved.style, 'inferno');
  });

  it('falls back to default when id is unknown', () => {
    const resolved = skins.resolveSkin('not_a_real_skin', '#000000');
    assert.equal(resolved.id, skins.SKINS[0].id);
  });

  it('includes new static and animated premium entries', () => {
    assert.ok(skins.getSkinById('coral_reef'));
    assert.ok(skins.getSkinById('cyber_prism'));
    const animatedCount = skins.SKINS.filter((skin) => skins.isAnimatedSkin(skin)).length;
    const premiumCount = skins.SKINS.filter((skin) => skin.premium).length;
    assert.ok(animatedCount >= 20);
    assert.equal(premiumCount, animatedCount);
  });
});
