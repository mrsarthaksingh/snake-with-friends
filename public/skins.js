'use strict';

/**
 * Shared skin catalog (Node server + browser).
 * Premium skins are free for everyone — the badge is cosmetic only.
 *
 * style:
 *   solid    — single color
 *   stripe   — alternate color / accent along the body
 *   dual     — accent head, body color
 *   glow     — soft outer aura (classic)
 *   ring     — dark outline + bright fill
 *   royal    — gold trim + crown head (premium)
 *   metallic — chrome highlight sphere (premium)
 *   scale    — dragon-scale pattern (premium)
 *   nebula   — deep space + star speckles (premium)
 *   plasma   — electric core glow (premium)
 *
 * anim (client render only — server stores skinId):
 *   wave     — smooth color wave along the body
 *   pulse    — pulsing tint (whole body on premium)
 *   shimmer  — soft traveling highlight
 *   cycle    — dual-color cycle
 *   flow     — bright band traveling along the spine
 *   plasma   — electric flicker
 *   inferno  — heat gradient tail → blazing head
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
    { id: 'coral_reef', name: 'Coral Reef', color: '#ff7f50', style: 'solid', premium: false },
    { id: 'copper_coil', name: 'Copper Coil', color: '#b87333', style: 'solid', premium: false },
    { id: 'bamboo_leaf', name: 'Bamboo Leaf', color: '#7bed9f', style: 'solid', premium: false },
    { id: 'cherry_bloom', name: 'Cherry Bloom', color: '#e84393', style: 'solid', premium: false },
    { id: 'cobalt_steel', name: 'Cobalt Steel', color: '#3867d6', style: 'solid', premium: false },
    { id: 'mustard_pop', name: 'Mustard Pop', color: '#f9ca24', style: 'solid', premium: false },
    { id: 'teal_dream', name: 'Teal Dream', color: '#22a6b3', style: 'solid', premium: false },
    { id: 'charcoal_ice', name: 'Charcoal Ice', color: '#576574', style: 'solid', premium: false },
    { id: 'plum_rush', name: 'Plum Rush', color: '#8e44ad', style: 'solid', premium: false },
    { id: 'lime_zest', name: 'Lime Zest', color: '#badc58', style: 'solid', premium: false },

    // Premium — rich palettes, dedicated render pipeline (all animated)
    { id: 'saffron_royal', name: 'Saffron Royal', color: '#c87900', accent: '#ffe566', tertiary: '#8b1a1a', style: 'royal', anim: 'flow', premium: true },
    { id: 'peacock_pride', name: 'Peacock Pride', color: '#0a6e6a', accent: '#2d4fff', tertiary: '#00ffa3', style: 'scale', anim: 'wave', premium: true },
    { id: 'lotus_blush', name: 'Lotus Blush', color: '#ff4d8d', accent: '#ffd6e8', tertiary: '#9b59b6', style: 'nebula', anim: 'shimmer', premium: true },
    { id: 'mehendi_vine', name: 'Mehendi Vine', color: '#145a32', accent: '#e8b923', tertiary: '#c0392b', style: 'scale', anim: 'cycle', premium: true },
    { id: 'tiger_stripe', name: 'Tiger Stripe', color: '#f39c12', accent: '#1a1a1a', tertiary: '#ff6b35', style: 'scale', anim: 'inferno', premium: true },
    { id: 'midnight_gold', name: 'Midnight Gold', color: '#12162e', accent: '#ffd700', tertiary: '#c9a227', style: 'royal', anim: 'shimmer', premium: true },
    { id: 'neon_pulse', name: 'Neon Pulse', color: '#00f5d4', accent: '#9b5de5', tertiary: '#ff006e', style: 'plasma', anim: 'plasma', premium: true },
    { id: 'galaxy_violet', name: 'Galaxy Violet', color: '#2d1b69', accent: '#ff9ff3', tertiary: '#48dbfb', style: 'nebula', anim: 'wave', premium: true },
    { id: 'diamond_frost', name: 'Diamond Frost', color: '#c8d6e5', accent: '#74b9ff', tertiary: '#ffffff', style: 'metallic', anim: 'shimmer', premium: true },
    { id: 'holi_splash', name: 'Holi Splash', color: '#e84393', accent: '#00cec9', tertiary: '#fdcb6e', style: 'plasma', anim: 'cycle', premium: true },
    { id: 'royal_maroon', name: 'Royal Maroon', color: '#4a0e2e', accent: '#ffd166', tertiary: '#ff6b6b', style: 'royal', anim: 'flow', premium: true },
    { id: 'monsoon_teal', name: 'Monsoon Teal', color: '#056c6c', accent: '#7bed9f', tertiary: '#00d2d3', style: 'scale', anim: 'wave', premium: true },

    { id: 'aurora_flow', name: 'Aurora Flow', color: '#00f5d4', accent: '#9b5de5', tertiary: '#fee440', style: 'plasma', anim: 'flow', premium: true },
    { id: 'ember_pulse', name: 'Ember Pulse', color: '#c23616', accent: '#ffd166', tertiary: '#ff9f43', style: 'inferno', anim: 'inferno', premium: true },
    { id: 'neon_rain', name: 'Neon Rain', color: '#00cec9', accent: '#fd79a8', tertiary: '#a29bfe', style: 'plasma', anim: 'cycle', premium: true },
    { id: 'cosmic_shift', name: 'Cosmic Shift', color: '#2c2c54', accent: '#ff7979', tertiary: '#706fd3', style: 'nebula', anim: 'wave', premium: true },
    { id: 'poison_wave', name: 'Poison Wave', color: '#1e8449', accent: '#a3ff12', tertiary: '#00ff88', style: 'plasma', anim: 'plasma', premium: true },
    { id: 'frost_shimmer', name: 'Frost Shimmer', color: '#dff9fb', accent: '#74b9ff', tertiary: '#ffffff', style: 'metallic', anim: 'shimmer', premium: true },
    { id: 'sunset_cycle', name: 'Sunset Cycle', color: '#e17055', accent: '#fdcb6e', tertiary: '#d63031', style: 'royal', anim: 'cycle', premium: true },
    { id: 'electric_arc', name: 'Electric Arc', color: '#f9ca24', accent: '#0984e3', tertiary: '#ffffff', style: 'plasma', anim: 'plasma', premium: true },
    { id: 'magma_stream', name: 'Magma Stream', color: '#b71540', accent: '#fbc531', tertiary: '#eb2f06', style: 'inferno', anim: 'flow', premium: true },
    { id: 'cyber_prism', name: 'Cyber Prism', color: '#00d2ff', accent: '#ff6bcb', tertiary: '#7bed9f', style: 'metallic', anim: 'cycle', premium: true },
  ]);

  const SKIN_BY_ID = Object.freeze(
    Object.fromEntries(SKINS.map((skin) => [skin.id, skin])),
  );

  const SKIN_COLORS = Object.freeze(SKINS.map((skin) => skin.color));

  /**
   * @param {typeof SKINS[number]} skin
   * @returns {boolean}
   */
  function isAnimatedSkin(skin) {
    return typeof skin.anim === 'string' && skin.anim.length > 0;
  }

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
    isAnimatedSkin,
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
