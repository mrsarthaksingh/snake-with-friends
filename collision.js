'use strict';

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
function distanceBetweenPoints(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Shortest distance from a point to a line segment.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }} segStart
 * @param {{ x: number, y: number }} segEnd
 * @returns {number}
 */
function distancePointToSegment(point, segStart, segEnd) {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.0001) {
    return distanceBetweenPoints(point, segStart);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared),
  );
  return distanceBetweenPoints(point, {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  });
}

/**
 * Minimum distance between two line segments.
 * @param {{ x: number, y: number }} aStart
 * @param {{ x: number, y: number }} aEnd
 * @param {{ x: number, y: number }} bStart
 * @param {{ x: number, y: number }} bEnd
 * @returns {number}
 */
function distanceSegmentToSegment(aStart, aEnd, bStart, bEnd) {
  return Math.min(
    distancePointToSegment(aStart, bStart, bEnd),
    distancePointToSegment(aEnd, bStart, bEnd),
    distancePointToSegment(bStart, aStart, aEnd),
    distancePointToSegment(bEnd, aStart, aEnd),
  );
}

/**
 * Whether a head path hits a body bead (point test + swept motion segment).
 * @param {{ x: number, y: number } | null | undefined} prevHead
 * @param {{ x: number, y: number }} head
 * @param {{ x: number, y: number }} bodyPoint
 * @param {number} hitRadius
 * @returns {boolean}
 */
function headPathHitsPoint(prevHead, head, bodyPoint, hitRadius) {
  if (distanceBetweenPoints(head, bodyPoint) <= hitRadius) {
    return true;
  }
  if (!prevHead) {
    return false;
  }
  if (distanceBetweenPoints(prevHead, head) < 0.0001) {
    return false;
  }
  return distancePointToSegment(bodyPoint, prevHead, head) <= hitRadius;
}

/**
 * Whether two snake heads collide (point + swept paths).
 * @param {{ x: number, y: number } | null | undefined} prevHeadA
 * @param {{ x: number, y: number }} headA
 * @param {number} radiusA
 * @param {{ x: number, y: number } | null | undefined} prevHeadB
 * @param {{ x: number, y: number }} headB
 * @param {number} radiusB
 * @returns {boolean}
 */
function headsCollide(prevHeadA, headA, radiusA, prevHeadB, headB, radiusB) {
  const hitRadius = radiusA + radiusB;
  if (distanceBetweenPoints(headA, headB) <= hitRadius) {
    return true;
  }
  if (prevHeadA && headPathHitsPoint(prevHeadA, headA, headB, hitRadius)) {
    return true;
  }
  if (prevHeadB && headPathHitsPoint(prevHeadB, headB, headA, hitRadius)) {
    return true;
  }
  if (prevHeadA && prevHeadB) {
    return distanceSegmentToSegment(prevHeadA, headA, prevHeadB, headB) <= hitRadius;
  }
  return false;
}

/**
 * Resolve head-on collision: smaller score dies; equal scores = both die.
 * @param {{ id: string, score: number }} snake
 * @param {{ id: string, score: number }} other
 * @returns {Array<{ victimId: string, killerId: string | null }>}
 */
function resolveHeadOnKills(snake, other) {
  if (snake.score < other.score) {
    return [{ victimId: snake.id, killerId: other.id }];
  }
  if (other.score < snake.score) {
    return [{ victimId: other.id, killerId: snake.id }];
  }
  return [
    { victimId: snake.id, killerId: other.id },
    { victimId: other.id, killerId: snake.id },
  ];
}

module.exports = {
  distanceBetweenPoints,
  distancePointToSegment,
  distanceSegmentToSegment,
  headPathHitsPoint,
  headsCollide,
  resolveHeadOnKills,
};
