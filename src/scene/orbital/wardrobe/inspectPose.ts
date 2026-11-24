import { MathUtils } from 'three';
import type { ResidentRig } from '../ResidentModel';

export const INSPECTION_SECONDS = 2.65;

/** Layer on the standing controls before skinning. Both soles stay planted. */
export function inspectOutfit(rig: ResidentRig, time: number) {
  const ramp = (from: number, to: number) => MathUtils.smootherstep(time, from, to);
  const gaze = ramp(0, .50) * (1 - ramp(1.94, 2.60));
  const sleeve = ramp(.21, .92) * (1 - ramp(1.54, 2.36));
  const hem = ramp(.95, 1.60) * (1 - ramp(1.85, 2.58));
  rig.torso.rotation.set(.10 * gaze, .13 * sleeve - .12 * hem, -.035 * sleeve);
  rig.neck.rotation.set(.24 * gaze, .14 * sleeve - .20 * hem, -.045 * sleeve);
  rig.head?.rotation.set(.13 * gaze, .09 * sleeve - .11 * hem, 0);
  const [right, left] = rig.arms;
  left.upper.rotation.set(-.37 * sleeve, 0, .34 * sleeve);
  left.forearm.rotation.set(-.86 * sleeve, -.22 * sleeve, 0);
  left.hand.rotation.set(.08 * sleeve, .37 * sleeve, .10 * sleeve);
  right.upper.rotation.set(-.21 * hem, .05 * hem, -.29 * hem);
  right.forearm.rotation.set(-.26 * hem, .13 * hem, 0);
  right.hand.rotation.set(.12 * hem, -.17 * hem, 0);
}
