import type { SkiPlayer } from './model.ts';

export interface Circle { x: number; y: number; radius: number }
export const NAIWA_SCALE = 0.36;
export const SKI_HALF_LENGTH = 39;
export const rideHeight = (p: SkiPlayer) => p.partner === 'slide' ? 22 : p.partner === 'charge' ? 42 : 0;
export const rideOffsetX = (p: SkiPlayer) => p.partner === 'charge' ? 7 : 0;
export const playerPivot = (p: SkiPlayer) => p.crashTime > 0 ? 18 : 32;

export function bodyPose(p: SkiPlayer) {
  return {
    lean: p.tucked ? p.partner ? .55 : 1.15 : p.grounded ? -Math.max(-0.35, Math.min(0.35, p.angle * 0.28)) : 0,
    compression: p.partner ? (p.tucked ? 13 : 9) + p.squash * 2 : p.tucked ? 14 : p.squash * 8 + (!p.grounded && p.flipping ? 3 : 0),
  };
}

function rotate(x: number, y: number, angle: number) {
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

function worldCircle(p: SkiPlayer, circle: Circle): Circle {
  const pivot = playerPivot(p);
  const point = rotate(circle.x, circle.y + pivot, p.angle);
  return { x: p.x + point.x, y: p.y - pivot + point.y, radius: circle.radius };
}

export function playerBody(p: SkiPlayer): Circle[] {
  if (p.crashTime > 0) return [worldCircle(p, { x: 0, y: -18, radius: 16 })];
  const pose = bodyPose(p);
  const circles = [{ x: -1, y: -34, radius: 17 }, { x: 4, y: -49, radius: 11 }, { x: 9, y: -63, radius: 8 }];
  return circles.map(circle => {
    const point = rotate(circle.x, circle.y + 30, pose.lean);
    return worldCircle(p, { x: point.x, y: point.y - 30 + pose.compression, radius: circle.radius });
  });
}

export function skiContacts(p: SkiPlayer): Circle[] {
  if (p.crashTime > 0) return [];
  if (p.partner) return [{ x: p.x, y: p.y + rideHeight(p), radius: 0 }];
  return [-SKI_HALF_LENGTH, 0, SKI_HALF_LENGTH].map(x => worldCircle(p, { x, y: -2, radius: 2 }));
}
