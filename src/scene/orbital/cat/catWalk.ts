import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

import { CAT_YAW, CAT_MAT_Y, CAT_CUSHION_TOP } from '../cabinLayout';

const route = new CatmullRomCurve3([
  [0, 0], [-.22, .14], [-.52, .04], [-.68, -.40], [-.61, -.60],
  [-.32, -.76], [-.06, -.62], [.14, -.46], [.14, -.15],
].map(([x, z]) => new Vector3(x, 0, z)), true);
export const CAT_WALK_LENGTH = route.getLength();
export const CAT_WALK_SPEED = .30;
// Travel per cycle, calibrated from the rearward sweep of the source paws.
export const CAT_WALK_STRIDE = .22;
const BLEND_DISTANCE = .19;

function ground(x: number, z: number) {
  // Ease between the top of the rounded cushion and the surrounding floor.
  return (CAT_MAT_Y + CAT_CUSHION_TOP) * (1 - MathUtils.smoothstep(Math.hypot(x, z), .28, .41));
}

function routePoint(distance: number, target: Vector3) {
  return route.getPointAt(MathUtils.clamp(distance / CAT_WALK_LENGTH, 0, 1), target);
}

export function sampleCatWalk(distance: number, position: Vector3, tangent: Vector3) {
  routePoint(distance, position);
  route.getTangentAt(MathUtils.clamp(distance / CAT_WALK_LENGTH, 0, 1), tangent);
  const weight = MathUtils.smoothstep(Math.min(distance, CAT_WALK_LENGTH - distance), 0, BLEND_DISTANCE);
  position.y = ground(position.x, position.z);
  const direction = Math.atan2(tangent.x, tangent.z);
  const yaw = CAT_YAW + Math.atan2(Math.sin(direction - CAT_YAW), Math.cos(direction - CAT_YAW)) * weight;
  return { yaw, weight };
}
