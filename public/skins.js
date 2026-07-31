'use strict';

/**
 * Shared skin catalog (Node server + browser).
 * Premium skins are free for everyone — the badge is cosmetic only.
 *
 * Wrapped in an IIFE so browser script scope does not collide with game.js
 * (classic scripts share one lexical environment for let/const).
 *
 * style:
 *   solid  — single color
 *   stripe — alternate color / accent along the body
 *   dual   — accent head, body color
 *   glow   — soft outer aura
 *   ring   — dark outline + bright fill
 */

(function attachSnakeSkins(root) {
  const SKINS = Object.freeze([
    // Classic
    { id: 'viper_green', name: 'Viper Green', color: '#2ecc71', style: 'solid', premium: false },
    { id: 'crimson_coil', name: 'Crimson Coil', color: '#e74c3c', style: 'solid', premium: false },
    { id: 'ocean_fang', name: 'Ocean Fang', color: '#3498db', style: 'solid', premium: false },
    { id: 'solar_ember', name: 'Solar Ember', color: '#f39c12', style: 'solid', premium: false },
    { id: 'purple_mist', name: 'Purple Mist', color: '#9b59b6', style: 'solid', premium: false },
    { id: 'mint_strike', name: 'Mint Strike', color: '#1abc9c', style: 'solid', premium: false },
    { id: 'lava_trail', name: 'Lava Trail', color: '#e67e22', style: 'solid', premium: false },
    { id: 'pink_pulse', name: 'Pink Pulse', color: '#ff6b9d', style: 'solid', premium: false },
    { id: 'aqua_dash', name: 'Aqua Dash', color: '#00cec9', style: 'solid', premium: false },
    { id: 'rose_rush', name: 'Rose Rush', color: '#fd79a8', style: 'solid', premium: false },
    { id: 'lilac_bolt', name: 'Lilac Bolt', color: '#a29bfe', style: 'solid', premium: false },
    { id: 'jade_glow', name: 'Jade Glow', color: '#55efc4', style: 'solid', premium: false },
    { id: 'gold_spark', name: 'Gold Spark', color: '#ffeaa7', style: 'solid', premium: false },
    { id: 'sky_blade', name: 'Sky Blade', color: '#74b9ff', style: 'solid', premium: false },
    { id: 'ruby_dash', name: 'Ruby Dash', color: '#ff7675', style: 'solid', premium: false },
    { id: 'ice_stream', name: 'Ice Stream', color: '#81ecec', style: 'solid', premium: false },
    { id: 'sand_storm', name: 'Sand Storm', color: '#fab1a0', style: 'solid', premium: false },
    { id: 'night_violet', name: 'Night Violet', color: '#6c5ce7', style: 'solid', premium: false },
    { id: 'forest_run', name: 'Forest Run', color: '#00b894', style: 'solid', premium: false },
    { id: 'silver_scale', name: 'Silver Scale', color: '#dfe6e9', style: 'solid', premium: false },

    // Free premium (unlocked for all)
    { id: 'saffron_royal', name: 'Saffron Royal', color: '#ff9f1a', accent: '#ffe66d', style: 'stripe', premium: true },
    { id: 'peacock_pride', name: 'Peacock Pride', color: '#0f9b8e', accent: '#3d5afe', style: 'glow', premium: true },
    { id: 'lotus_blush', name: 'Lotus Blush', color: '#ff6b9d', accent: '#ffe3ec', style: 'stripe', premium: true },
    { id: 'mehendi_vine', name: 'Mehendi Vine', color: '#1b7a4e', accent: '#d4a017', style: 'stripe', premium: true },
    { id: 'tiger_stripe', name: 'Tiger Stripe', color: '#f39c12', accent: '#1e272e', style: 'stripe', premium: true },
    { id: 'midnight_gold', name: 'Midnight Gold', color: '#1b1f3b', accent: '#f7d774', style: 'dual', premium: true },
    { id: 'neon_pulse', name: 'Neon Pulse', color: '#00f5d4', accent: '#9b5de5', style: 'glow', premium: true },
    { id: 'galaxy_violet', name: 'Galaxy Violet', color: '#5f27cd', accent: '#ff9ff3', style: 'glow', premium: true },
    { id: 'diamond_frost', name: 'Diamond Frost', color: '#dfe6e9', accent: '#74b9ff', style: 'ring', premium: true },
    { id: 'holi_splash', name: 'Holi Splash', color: '#e84393', accent: '#00cec9', style: 'stripe', premium: true },
  ]);

  const SKIN_BY_ID = Object.freeze(
    Object.fromEntries(SKINS.map((skin) => [skin.id, skin])),
  );

  const SKIN_COLORS = Object.freeze(SKINS.map((skin) => skin.color));

  function getSkinById(skinId) {
    if (typeof skinId !== 'string') {
      return null;
    }
    return SKIN_BY_ID[skinId] ?? null;
  }

  function getSkinByColor(color) {
    if (typeof color !== 'string') {
      return null;
    }
    return SKINS.find((skin) => skin.color === color) ?? null;
  }

  function resolveSkin(requestedSkinId, requestedColor) {
    const byId = getSkinById(requestedSkinId);
    if (byId) {
      return byId;
    }
    const byColor = getSkinByColor(requestedColor);
    if (byColor) {
      return byColor;
    }
    return SKINS[0];
  }

  const api = Object.freeze({
    SKINS,
    SKIN_BY_ID,
    SKIN_COLORS,
    getSkinById,
    getSkinByColor,
    resolveSkin,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SnakeSkins = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined);
