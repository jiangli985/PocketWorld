import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

import { CAT_HOME, CAT_YAW, CAT_MAT_Y, CAT_CUSHION_TOP } from '../cabinLayout.ts';

type CatRoute = { curve: CatmullRomCurve3; length: number };

export function planCatWalk(isClear: (x: number, z: number) => boolean, random = Math.random): CatRoute | null {
  const between = (min: number, max: number) => MathUtils.lerp(min, max, random());
  const startFar = random() < .55;
  const point = new Vector3();
  // Both directions through the passage beside the penguin share safe entry and return points.
  // Alternate short and longer candidates so a blocked pocket cannot prevent all outings.
  for (let attempt = 0; attempt < 8; attempt++) {
    const far = attempt % 2 === 0 ? startFar : !startFar;
    const points = [
      [0, 0], [between(-.26, -.18), between(.10, .17)],
      [between(-.53, -.40), between(-.05, .05)],
      [between(-.70, -.59), between(-.57, -.40)],
      ...(far ? [
        [between(-1.12, -.96), between(-.58, -.52)],
        [between(-1.75, -1.4), between(-1.12, -.95)],
        [between(-1.58, -1.24), between(-1.47, -1.25)],
        [between(-1.03, -.88), between(-.94, -.83)],
      ] : [[between(-.72, -.49), between(-.70, -.48)]]),
      [between(-.44, -.25), between(-.76, -.63)],
      [between(-.17, -.03), between(-.66, -.53)],
      [between(.06, .10), between(-.43, -.30)], [.12, -.15],
    ];
    const curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, 0, z)), true);
    const length = curve.getLength();
    const segments = Math.ceil(length / .04);
    let clear = true;
    for (let i = 0; i <= segments; i++) {
      curve.getPointAt(i / segments, point);
      if (!isClear(CAT_HOME[0] + point.x, CAT_HOME[1] + point.z)) {
        clear = false;
        break;
      }
    }
    if (clear) return { curve, length };
  }
  return null;
}

export function chooseCatReturnDirection(
  { curve, length }: CatRoute, distance: number, isClear: (x: number, z: number) => boolean,
): -1 | 1 {
  const closest = distance < length - distance ? -1 : 1;
  const point = new Vector3();
  function clearTo(end: number) {
    const segments = Math.ceil(Math.abs(end - distance) / .04);
    for (let i = 1; i <= segments; i++) {
      curve.getPointAt(MathUtils.lerp(distance, end, i / segments) / length, point);
      if (!isClear(CAT_HOME[0] + point.x, CAT_HOME[1] + point.z)) return false;
    }
    return true;
  }
  if (clearTo(closest < 0 ? 0 : length)) return closest;
  if (clearTo(closest < 0 ? length : 0)) return closest < 0 ? 1 : -1;
  return closest;
}

export const CAT_WALK_SPEED = .30;
// Travel per cycle, calibrated from the rearward sweep of the source paws.
export const CAT_WALK_STRIDE = .22;
const BLEND_DISTANCE = .19;

function ground(x: number, z: number) {
  // Ease between the top of the rounded cushion and the surrounding floor.
  return (CAT_MAT_Y + CAT_CUSHION_TOP) * (1 - MathUtils.smoothstep(Math.hypot(x, z), .28, .41));
}

export function sampleCatWalk({ curve, length }: CatRoute, distance: number, position: Vector3, tangent: Vector3, direction: -1 | 1 = 1) {
  const progress = MathUtils.clamp(distance / length, 0, 1);
  curve.getPointAt(progress, position);
  curve.getTangentAt(progress, tangent);
  const weight = MathUtils.smoothstep(Math.min(distance, length - distance), 0, BLEND_DISTANCE);
  position.y = ground(position.x, position.z);
  const heading = Math.atan2(direction * tangent.x, direction * tangent.z);
  const yaw = CAT_YAW + Math.atan2(Math.sin(heading - CAT_YAW), Math.cos(heading - CAT_YAW)) * weight;
  return { yaw, weight };
}
