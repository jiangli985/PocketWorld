import { MathUtils } from 'three';
import profiles from '../../../assets/models/resident/luna-stair-gait.json' with { type: 'json' };
import { CABIN_STAIRS, STAIR_RISE, STAIR_TREAD_RUN } from './cabinStairs.ts';

type StairFoot = { z: number; y: number; pitch: number; swing: boolean; clearance: number };

export type StairGait = {
  feet: [StairFoot, StairFoot]; // Right, left
  yaw: number;
  treads: typeof treads;
  weight: number;
  lean: number;
  arms: number[][];
  legs: { flexion: number; hipForward: number; hipSide: number }[];
  supportWeight: number;
  footfall: number;
  phase: number;
};

const { clamp, lerp, smoothstep } = MathUtils;
const { lowerZ, steps } = CABIN_STAIRS;
const treads = { frontZ: lowerZ + .012, count: steps, rise: STAIR_RISE, run: STAIR_TREAD_RUN };
const stepCycle = (travel: number, ascending: boolean) =>
  travel + (ascending ? .78 : lerp(-.18, .22, travel / steps));

export function stairFootfall(progress: number, ascending: boolean) {
  return Math.floor(stepCycle(ascending ? progress : steps - progress, ascending));
}

/** From the lower landing (0) to the last tread, whose surface is flush with the upper landing. */
export function stairTreadSurface(z: number) {
  // The tread extends 12 mm past the nominal riser. Use its straight front edge.
  const tread = (treads.frontZ - z) / STAIR_TREAD_RUN;
  return clamp(Math.ceil(tread), 0, steps) * STAIR_RISE;
}

function footAt(tread: number, ascending: boolean): StairFoot {
  // On descent the ball of the foot rolls over the open edge of the tread.
  const center = ascending ? .5 : .8;
  return { z: lowerZ - (tread - center) * STAIR_TREAD_RUN, y: clamp(tread, 0, steps) * STAIR_RISE, pitch: 0, swing: false, clearance: 0 };
}

/** Distance determines cadence and support positions, so changing speed cannot move a planted foot. */
export function sampleStairGait(progress: number, ascending: boolean, reducedMotion = false): StairGait {
  const travel = ascending ? progress : steps - progress;
  const cycle = stepCycle(travel, ascending);
  const footfall = Math.floor(cycle);
  const phase = cycle - footfall;
  const swingRight = (footfall & 1) === (ascending ? 0 : 1);
  const clip = profiles[ascending ? 'up' : 'down'][swingRight ? 0 : 1];
  const frame = phase * (clip.length - 1);
  const before = clip[Math.floor(frame)], after = clip[Math.ceil(frame)];
  const sample = (channel: number) => lerp(before[channel], after[channel], frame % 1);
  const treadAt = (step: number) => ascending ? step : steps - step;
  const support = footAt(treadAt(footfall), ascending);
  const from = footAt(treadAt(footfall - 1), ascending), to = footAt(treadAt(footfall + 1), ascending);
  const advance = sample(0);
  // With Luna’s shorter shins the unscaled heel roll would fold the knee back into the dress.
  // Keep toe-off and flattening in phase with Manny while the foot crosses the higher nosing.
  const pitch = sample(2);
  const heelRoll = ascending ? pitch : .25 * Math.tanh(pitch / .25);
  const swing: StairFoot = {
    z: lerp(from.z, to.z, advance), y: lerp(from.y, to.y, advance),
    pitch: heelRoll, clearance: sample(1), swing: true,
  };
  return {
    feet: swingRight ? [swing, support] : [support, swing],
    treads,
    yaw: ascending ? Math.PI : 0,
    weight: smoothstep(Math.min(travel, steps - travel), -1.25, -.18),
    lean: reducedMotion ? 0 : sample(3),
    legs: [4, 7].map(i => ({ flexion: sample(i), hipForward: sample(i + 1), hipSide: sample(i + 2) })),
    supportWeight: .5 + .5 * smoothstep(phase, 0, .23) * smoothstep(1 - phase, 0, .23),
    arms: reducedMotion ? [] : [10, 19].map(i => Array.from({ length: 9 }, (_, j) => sample(i + j))),
    footfall,
    phase: (cycle / 2 + 1) % 1,
  };
}
