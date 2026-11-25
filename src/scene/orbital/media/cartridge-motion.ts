import type { GameId } from '../../../types/game';

export type CartridgePoint = [number, number, number];
export const CARTRIDGE_SLOT: CartridgePoint = [2.26, 1.27, -2.05];
export const CARTRIDGE_DOCK_ORIGIN: CartridgePoint = [2.365, 1.12, -2.05];
export const CARTRIDGE_PAUSE_POS: CartridgePoint = [2.57, 1.224, -2.05];
export const CARTRIDGE_STAND_ORIGIN: CartridgePoint = [2.61, 1.12, -2.63];
export const CARTRIDGE_STAND_LEAN = -0.244;
export const CARTRIDGE_DRAG_HEIGHT = 1.44;
export const CARTRIDGE_HEIGHT = 0.25;
// Seated in the 2-slot walnut display stand (slot felt floor at Y = 1.148, tilted -14 deg).
export const CARTRIDGE_REST_HEIGHT = 1.12 + 0.156;
// Both cartridges rest side-by-side in the dedicated 2-slot angled display stand behind the dock.
export const cartridgePosition = (game: GameId): CartridgePoint => [
  CARTRIDGE_STAND_ORIGIN[0] + (game === 'mario' ? -0.128 : 0.128),
  CARTRIDGE_REST_HEIGHT,
  CARTRIDGE_STAND_ORIGIN[2],
];

export function clampCartridgeDrag(point: CartridgePoint): CartridgePoint {
  // Keep the entire cartridge in front of the monitor and above the desk/keyboard/dock.
  return [Math.max(0, Math.min(2.8, point[0])), Math.max(CARTRIDGE_DRAG_HEIGHT, Math.min(2.7, point[1])), CARTRIDGE_SLOT[2]];
}

export function isCartridgeDrop(point: CartridgePoint): boolean {
  return point.every(Number.isFinite) && Math.abs(point[0] - CARTRIDGE_SLOT[0]) <= 0.25
    && point[1] >= CARTRIDGE_SLOT[1] - 0.12 && point[1] <= CARTRIDGE_SLOT[1] + 0.42
    && Math.abs(point[2] - CARTRIDGE_SLOT[2]) <= 0.12;
}

export function cartridgeDragState(intended: CartridgePoint) {
  // Collision clamping must not turn a release far below the desk into a valid drop.
  return { point: clampCartridgeDrag(intended), nearSlot: isCartridgeDrop(intended) };
}

const isStandPoint = (point: CartridgePoint) => Math.abs(point[2] - CARTRIDGE_STAND_ORIGIN[2]) < 0.08;

/** Smoothly pitches between the -14 deg display-stand lean and upright 0 deg for dock insertion/ejection. */
export function cartridgeTransferPitch(from: CartridgePoint, to: CartridgePoint, progress: number): number {
  const fromPitch = isStandPoint(from) ? CARTRIDGE_STAND_LEAN : 0;
  const toPitch = isStandPoint(to) ? CARTRIDGE_STAND_LEAN : 0;
  if (fromPitch === toPitch) return fromPitch;
  // Hold slot lean while lifting out of the stand (or settling into it), and rotate smoothly mid-flight.
  const t = Math.max(0, Math.min(1, (progress - 0.20) / 0.56));
  const eased = t * t * (3 - 2 * t);
  return fromPitch + (toPitch - fromPitch) * eased;
}

/** Lift cleanly out of the stand or dock, traverse above hardware, then drop straight vertically into target. */
export function cartridgeTransferPoint(from: CartridgePoint, to: CartridgePoint, progress: number): CartridgePoint {
  const height = Math.max(CARTRIDGE_REST_HEIGHT + CARTRIDGE_HEIGHT + 0.025, from[1], to[1]);
  const points: CartridgePoint[] = [from, [from[0], height, from[2]], [from[0], height, CARTRIDGE_SLOT[2]],
    [to[0], height, CARTRIDGE_SLOT[2]], [to[0], height, to[2]], to];
  const scaled = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const t = scaled - index, eased = t * t * (3 - 2 * t);
  return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * eased) as CartridgePoint;
}
