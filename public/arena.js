'use strict';

/**
 * Arena geometry (rect freeroam + circular Arena mode). Node + browser.
 */
(function attachSnakeArena(root) {
  const BORDER_PADDING = 8;
  const MAP_EDGE_PADDING = 0.05;

  /**
   * @param {number} mapSize
   * @returns {{ x: number, y: number }}
   */
  function arenaCenter(mapSize) {
    return { x: mapSize / 2, y: mapSize / 2 };
  }

  /**
   * @param {number} mapSize
   * @returns {number}
   */
  function arenaMaxRadius(mapSize) {
    return (mapSize / 2) * (1 - MAP_EDGE_PADDING);
  }

  /**
   * @param {number} mapSize
   * @param {number} radiusRatio
   * @returns {number}
   */
  function playableRadius(mapSize, radiusRatio) {
    const safeRatio = Math.max(0.1, Math.min(1, Number(radiusRatio) || 1));
    return arenaMaxRadius(mapSize) * safeRatio;
  }

  /**
   * @param {number} mapSize
   * @param {number} insetRatio
   * @returns {{ min: number, max: number }}
   */
  function arenaBounds(mapSize, insetRatio) {
    const inset = Math.max(0, Number(insetRatio) || 0);
    return {
      min: mapSize * inset,
      max: mapSize * (1 - inset),
    };
  }

  /**
   * @param {{ x: number, y: number }} point
   * @param {number} mapSize
   * @returns {number}
   */
  function distanceFromCenter(point, mapSize) {
    const center = arenaCenter(mapSize);
    return Math.hypot(point.x - center.x, point.y - center.y);
  }

  /**
   * @param {{ x: number, y: number }} point
   * @param {number} bodyRadius
   * @param {number} mapSize
   * @param {number} [insetRatio]
   * @returns {boolean}
   */
  function isInsideRect(point, bodyRadius, mapSize, insetRatio = 0) {
    const bounds = arenaBounds(mapSize, insetRatio);
    const edge = BORDER_PADDING + bodyRadius;
    return (
      point.x >= bounds.min + edge &&
      point.y >= bounds.min + edge &&
      point.x <= bounds.max - edge &&
      point.y <= bounds.max - edge
    );
  }

  /**
   * @param {{ x: number, y: number }} point
   * @param {number} bodyRadius
   * @param {number} mapSize
   * @param {number} [insetRatio]
   * @returns {{ x: number, y: number }}
   */
  function clampPointToRect(point, bodyRadius, mapSize, insetRatio = 0) {
    const bounds = arenaBounds(mapSize, insetRatio);
    const edge = BORDER_PADDING + Math.max(0, bodyRadius);
    return {
      x: Math.min(bounds.max - edge, Math.max(bounds.min + edge, point.x)),
      y: Math.min(bounds.max - edge, Math.max(bounds.min + edge, point.y)),
    };
  }

  /**
   * @param {{ x: number, y: number }} point
   * @param {number} bodyRadius
   * @param {number} mapSize
   * @param {number} [radiusRatio]
   * @returns {boolean}
   */
  function isInsideCircle(point, bodyRadius, mapSize, radiusRatio = 1) {
    const edge = BORDER_PADDING + bodyRadius;
    const maxRadius = Math.max(0, playableRadius(mapSize, radiusRatio) - edge);
    return distanceFromCenter(point, mapSize) <= maxRadius;
  }

  /**
   * @param {{ x: number, y: number }} point
   * @param {number} bodyRadius
   * @param {number} mapSize
   * @param {number} [radiusRatio]
   * @returns {{ x: number, y: number }}
   */
  function clampPointToCircle(point, bodyRadius, mapSize, radiusRatio = 1) {
    const center = arenaCenter(mapSize);
    const edge = BORDER_PADDING + Math.max(0, bodyRadius);
    const maxRadius = Math.max(0, playableRadius(mapSize, radiusRatio) - edge);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxRadius || dist < 0.0001) {
      return point;
    }
    const scale = maxRadius / dist;
    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    };
  }

  const api = Object.freeze({
    BORDER_PADDING,
    MAP_EDGE_PADDING,
    arenaCenter,
    arenaMaxRadius,
    playableRadius,
    arenaBounds,
    distanceFromCenter,
    isInsideRect,
    clampPointToRect,
    isInsideCircle,
    clampPointToCircle,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SnakeArena = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined);
