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
  descent: { pelvisZ: number; headPitch: number; ankleSurface: number; settle: number } | null;
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
export function stairTreadSurface(z: number, heelRun = 0) {
  // The tread extends 12 mm past the nominal riser. Use its straight front edge.
  const tread = (treads.frontZ - z) / STAIR_TREAD_RUN;
  const level = Math.ceil(tread);
  const surface = clamp(level, 0, steps) * STAIR_RISE;
  if (heelRun === 0 || level < 0 || level >= steps) return surface;
  // The trailing heel clears the physical edge before it can lower onto the next step.
  const pastEdge = (level - tread) * STAIR_TREAD_RUN;
  return surface + STAIR_RISE * (1 - smoothstep(pastEdge, 0, heelRun));
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
  const descent = ascending ? null : {
    pelvisZ: support.z + sample(28) * STAIR_TREAD_RUN,
    headPitch: reducedMotion ? 0 : sample(30),
    ankleSurface: lerp(from.y, to.y, MathUtils.smootherstep(phase, .40, 1)),
    settle: smoothstep(phase, .32, .93),
  };
  const supportWeight = .5 + .5 * (ascending
    ? smoothstep(phase, 0, .23) * smoothstep(1 - phase, 0, .23)
    : smoothstep(phase, 0, .35) * smoothstep(1 - sample(29), 0, 1));
  // Lead with the foot as it passes the nosing. Both planted endpoints stay fixed.
  const lead = descent ? .35 * STAIR_TREAD_RUN * 4 * advance * (1 - advance) : 0;
  const swing: StairFoot = {
    z: lerp(from.z, to.z, advance) + lead, y: lerp(from.y, to.y, advance),
    pitch: heelRoll, clearance: sample(1), swing: true,
  };
  return {
    feet: swingRight ? [swing, support] : [support, swing],
    treads,
    yaw: ascending ? Math.PI : 0,
    weight: smoothstep(Math.min(travel, steps - travel), -1.25, -.18),
    lean: reducedMotion ? 0 : sample(3),
    legs: [4, 7].map(i => ({ flexion: sample(i), hipForward: sample(i + 1), hipSide: sample(i + 2) })),
    supportWeight, descent,
    arms: reducedMotion ? [] : [10, 19].map(i => Array.from({ length: 9 }, (_, j) => sample(i + j))),
    footfall,
    phase: (cycle / 2 + 1) % 1,
  };
}
