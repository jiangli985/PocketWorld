type Point = { x: number; y: number };

/** First contact with a circle expanded by the projectile radius, along [start, end]. */
export function segmentCircleEntry(start: Point, end: Point, center: Point, radius: number): number | null {
  if (![start.x, start.y, end.x, end.y, center.x, center.y, radius].every(Number.isFinite) || radius < 0) return null;
  const dx = end.x - start.x, dy = end.y - start.y, mx = start.x - center.x, my = start.y - center.y;
  const c = mx * mx + my * my - radius * radius;
  if (c <= 1e-9 * Math.max(1, radius * radius)) return 0;
  const a = dx * dx + dy * dy;
  if (a <= Number.EPSILON) return null;
  const halfB = mx * dx + my * dy, discriminant = halfB * halfB - a * c;
  const tolerance = 1e-9 * Math.max(1, halfB * halfB, Math.abs(a * c));
  if (discriminant < -tolerance || halfB >= 0) return null;
  // This form avoids cancellation for an entry very close to the start.
  const t = c / (-halfB + Math.sqrt(Math.max(0, discriminant)));
  return t >= -1e-9 && t <= 1 + 1e-9 ? Math.max(0, Math.min(1, t)) : null;
}
