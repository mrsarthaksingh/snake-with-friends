'use strict';

/**
 * Generate tiny original WAV SFX into public/sounds/ (no third-party samples).
 * Run: node scripts/generate-sfx.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'sounds');
const SAMPLE_RATE = 22050;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWav(filePath, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.floor(clampSample(samples[index]) * 32767);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

function tone(options) {
  const frequency = options.frequency;
  const durationMs = options.durationMs;
  const volume = options.volume == null ? 0.35 : options.volume;
  const sweep = options.sweep == null ? 0 : options.sweep;
  const waveShape = options.waveShape == null ? 'sine' : options.waveShape;
  const total = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const samples = new Float32Array(total);
  for (let index = 0; index < total; index += 1) {
    const t = index / SAMPLE_RATE;
    const progress = index / Math.max(1, total - 1);
    const freq = frequency + sweep * progress;
    const envelope = Math.sin(Math.PI * Math.min(1, progress * 1.15)) * (1 - progress * 0.35);
    let wave = Math.sin(2 * Math.PI * freq * t);
    if (waveShape === 'square') {
      wave = wave >= 0 ? 1 : -1;
    } else if (waveShape === 'noise') {
      wave = Math.random() * 2 - 1;
    }
    samples[index] = wave * volume * envelope;
  }
  return samples;
}

function concat(parts) {
  let length = 0;
  for (const part of parts) {
    length += part.length;
  }
  const out = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const catalog = {
  eat: tone({ frequency: 880, durationMs: 70, volume: 0.28, sweep: 220 }),
  boost: tone({ frequency: 240, durationMs: 120, volume: 0.3, sweep: 180, waveShape: 'square' }),
  death: concat([
    tone({ frequency: 320, durationMs: 140, volume: 0.32, sweep: -160 }),
    tone({ frequency: 140, durationMs: 180, volume: 0.28, sweep: -80, waveShape: 'square' }),
  ]),
  kill: concat([
    tone({ frequency: 520, durationMs: 80, volume: 0.3, sweep: 80 }),
    tone({ frequency: 780, durationMs: 100, volume: 0.28, sweep: 120 }),
  ]),
  round_start: concat([
    tone({ frequency: 523.25, durationMs: 90, volume: 0.3 }),
    tone({ frequency: 659.25, durationMs: 90, volume: 0.3 }),
    tone({ frequency: 783.99, durationMs: 140, volume: 0.32 }),
  ]),
  orb_rain: concat([
    tone({ frequency: 990, durationMs: 60, volume: 0.22, sweep: 40 }),
    tone({ frequency: 1175, durationMs: 60, volume: 0.22, sweep: 40 }),
    tone({ frequency: 1319, durationMs: 90, volume: 0.24, sweep: 60 }),
  ]),
};

for (const name of Object.keys(catalog)) {
  const filePath = path.join(OUT_DIR, `${name}.wav`);
  writeWav(filePath, catalog[name]);
  console.log('wrote', path.relative(process.cwd(), filePath));
}
