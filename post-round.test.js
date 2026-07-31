'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const match = require('./match');

/**
 * Mirrors server podium/waiting bot-respawn rules without booting the full game loop.
 */
function applyPodiumWipe(snakes, nowMs) {
  for (const snake of snakes) {
    snake.alive = false;
    snake.spectating = true;
    if (snake.isBot) {
      snake.botRespawnAt = nowMs + match.PODIUM_MS;
    }
  }
}

function applyWaitingRestore(snakes, nowMs) {
  for (const snake of snakes) {
    if (snake.isBot) {
      if (!snake.alive) {
        snake.botRespawnAt = nowMs;
      }
      continue;
    }
    snake.spectating = false;
  }
}

function botsReadyToRespawn(snakes, nowMs) {
  return snakes.filter(
    (snake) =>
      snake.isBot &&
      !snake.alive &&
      typeof snake.botRespawnAt === 'number' &&
      nowMs >= snake.botRespawnAt,
  );
}

function shouldShowPlayAgainOverlay({ phase, joined, self, deathOverlayHidden }) {
  return (
    phase === 'waiting' &&
    joined &&
    Boolean(self) &&
    !self.alive &&
    deathOverlayHidden
  );
}

describe('post-round recovery', () => {
  it('gives dead bots a respawn timer on podium and frees them in waiting', () => {
    const nowMs = 1_000_000;
    const snakes = [
      { id: 'bot-1', isBot: true, alive: true },
      { id: 'bot-2', isBot: true, alive: true },
      { id: 'human-1', isBot: false, alive: true, spectating: false },
    ];
    applyPodiumWipe(snakes, nowMs);
    assert.equal(botsReadyToRespawn(snakes, nowMs).length, 0);
    assert.ok(snakes[0].botRespawnAt === nowMs + match.PODIUM_MS);
    assert.equal(snakes[2].botRespawnAt, undefined);
    applyWaitingRestore(snakes, nowMs + match.PODIUM_MS);
    assert.equal(snakes[2].spectating, false);
    assert.equal(botsReadyToRespawn(snakes, nowMs + match.PODIUM_MS).length, 2);
  });

  it('shows Play again overlay when freeroam waiting and player is dead', () => {
    assert.equal(
      shouldShowPlayAgainOverlay({
        phase: 'waiting',
        joined: true,
        self: { alive: false, score: 9 },
        deathOverlayHidden: true,
      }),
      true,
    );
    assert.equal(
      shouldShowPlayAgainOverlay({
        phase: 'podium',
        joined: true,
        self: { alive: false, score: 9 },
        deathOverlayHidden: true,
      }),
      false,
    );
    assert.equal(
      shouldShowPlayAgainOverlay({
        phase: 'waiting',
        joined: true,
        self: { alive: true, score: 9 },
        deathOverlayHidden: true,
      }),
      false,
    );
  });
});
