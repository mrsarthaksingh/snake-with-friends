'use strict';

/**
 * Quick-reaction emotes (Node server + browser).
 * Wrapped in an IIFE so browser script scope does not collide with game.js.
 */
(function attachSnakeEmotes(root) {
  const EMOTE_COOLDOWN_MS = 2000;
  const EMOTE_FLOAT_MS = 2000;

  const EMOTES = Object.freeze([
    { id: 'thumbs', emoji: '👍', label: 'Nice' },
    { id: 'fire', emoji: '🔥', label: 'Fire' },
    { id: 'skull', emoji: '💀', label: 'RIP' },
    { id: 'laugh', emoji: '😂', label: 'LOL' },
    { id: 'snake', emoji: '🐍', label: 'Snake' },
    { id: 'gg', emoji: '👏', label: 'GG' },
  ]);

  const EMOTE_BY_ID = Object.freeze(
    Object.fromEntries(EMOTES.map((emote) => [emote.id, emote])),
  );

  /**
   * @param {unknown} raw
   * @returns {string | null}
   */
  function normalizeEmoteId(raw) {
    const value = String(raw ?? '').trim().toLowerCase();
    return EMOTE_BY_ID[value] ? value : null;
  }

  /**
   * @param {string} emoteId
   * @returns {{ id: string, emoji: string, label: string } | null}
   */
  function getEmoteById(emoteId) {
    return EMOTE_BY_ID[emoteId] ?? null;
  }

  const api = Object.freeze({
    EMOTES,
    EMOTE_BY_ID,
    EMOTE_COOLDOWN_MS,
    EMOTE_FLOAT_MS,
    normalizeEmoteId,
    getEmoteById,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SnakeEmotes = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined);
