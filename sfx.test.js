'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SOUND_IDS = ['eat', 'boost', 'death', 'kill', 'round_start', 'orb_rain'];

describe('core sfx assets', () => {
  it('ships Howler vendor build and license', () => {
    assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'vendor', 'howler.min.js')));
    assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'vendor', 'HOWLER-LICENSE.md')));
  });

  it('ships generated wav files for each core cue', () => {
    for (const id of SOUND_IDS) {
      const filePath = path.join(PUBLIC_DIR, 'sounds', `${id}.wav`);
      assert.ok(fs.existsSync(filePath), `missing ${id}.wav`);
      assert.ok(fs.statSync(filePath).size > 44, `${id}.wav too small`);
    }
  });

  it('exposes SnakeSfx API when Howler is present', () => {
    const sandbox = {
      Howl: function Howl() {
        this.play = () => 1;
      },
      Howler: { volume() {}, ctx: { state: 'running', resume: async () => {} } },
      localStorage: {
        store: {},
        getItem(key) { return this.store[key] ?? null; },
        setItem(key, value) { this.store[key] = String(value); },
      },
      addEventListener() {},
      removeEventListener() {},
      globalThis: null,
      window: null,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, 'sfx.js'), 'utf8'), sandbox, {
      filename: 'sfx.js',
    });
    assert.equal(typeof sandbox.SnakeSfx.play, 'function');
    assert.equal(typeof sandbox.SnakeSfx.toggleMuted, 'function');
    sandbox.SnakeSfx.unlock();
    sandbox.SnakeSfx.play('eat');
    sandbox.SnakeSfx.setMuted(true);
    assert.equal(sandbox.SnakeSfx.isMuted(), true);
  });
});
