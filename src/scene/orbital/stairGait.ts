import { MathUtils } from 'three';
import profiles from '../../../assets/models/resident/luna-stair-gait.json' with { type: 'json' };
import { CABIN_STAIRS, STAIR_RISE, STAIR_TREAD_RUN } from './cabinStairs.ts';

type StairFoot = { z: number; y: number; pitch: number; swing: boolean; edgeBlend: number; surfaceCeiling: number };

export type StairGait = {
  feet: [StairFoot, StairFoot]; // Right, left
  ascending: boolean;
  yaw: number;
  lowerEdgeZ: number;
  weight: number;
  lean: number;
  arms: { shoulder: number; elbow: number; wrist: number }[];
  footfall: number;
  phase: number;
};

const { clamp, lerp, smoothstep } = MathUtils;
const { lowerZ, steps } = CABIN_STAIRS;
const stepCycle = (travel: number, ascending: boolean) =>
  travel + (ascending ? .78 : lerp(-.18, .22, travel / steps));

export function stairFootfall(progress: number, ascending: boolean) {
  return Math.floor(stepCycle(ascending ? progress : steps - progress, ascending));
}

/** From the lower landing (0) to the last tread, whose surface is flush with the upper landing. */
export function stairTreadSurface(z: number, edgeBlend = 0) {
  // The tread extends 12 mm past the nominal riser. Use its straight front edge.
  const tread = (lowerZ + .012 - z) / STAIR_TREAD_RUN;
  const level = Math.floor(tread);
  const easedLip = edgeBlend > 0 ? level + 1 + smoothstep(tread - level, 1 - edgeBlend, 1) : Math.ceil(tread);
  return clamp(easedLip, 0, steps) * STAIR_RISE;
}

function footAt(tread: number): StairFoot {
  return { z: lowerZ - (tread - .5) * STAIR_TREAD_RUN, y: clamp(tread, 0, steps) * STAIR_RISE, pitch: 0, swing: false, edgeBlend: 0, surfaceCeiling: Infinity };
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
  const sample = (channel: number, index = frame) =>
    lerp(clip[Math.floor(index)][channel], clip[Math.ceil(index)][channel], index % 1);
  const treadAt = (step: number) => ascending ? step : steps - step;
  const support = footAt(treadAt(footfall));
  const from = footAt(treadAt(footfall - 1)), to = footAt(treadAt(footfall + 1));
  const horizontalPhase = ascending ? clamp((phase - .17) / .83, 0, 1) : Math.min(phase / .88, 1);
  const advance = sample(0, (clip.length - 1) * horizontalPhase);

  // Upward swings lift before crossing a riser. Downward swings retain height until the rear of the foot clears it.
  const heightProgress = ascending
    ? .5 * (smoothstep(phase, 0, .26) + smoothstep(phase, .23, .55))
    : .5 * (smoothstep(advance, .51, .93) + smoothstep(phase, .69, 1));
  const height = lerp(from.y, to.y, heightProgress) + sample(1) * .24;
  const swing: StairFoot = {
    z: lerp(from.z, to.z, advance),
    y: height,
    pitch: clamp(sample(2) * .35, -.18, .24),
    swing: true,
    edgeBlend: ascending ? 0 : .30,
    surfaceCeiling: ascending ? Infinity : Math.min(from.y, height + .014),
  };

  return {
    feet: swingRight ? [swing, support] : [support, swing],
    ascending,
    lowerEdgeZ: lowerZ + .012,
    yaw: ascending ? Math.PI : 0,
    weight: smoothstep(Math.min(travel, steps - travel), -1.25, -.18),
    lean: reducedMotion ? 0 : sample(3) * (ascending ? .76 : .48),
    arms: [4, 7].map((channel, side) => {
      // Counterbalance the opposite leg, with the forearm and hand trailing the shoulder.
      if (reducedMotion) return { shoulder: 0, elbow: 0, wrist: 0 };
      const stride = Math.PI * (cycle + side + (ascending ? 0 : 1));
      return {
        shoulder: -.9 * sample(channel) - .35 * Math.cos(stride),
        elbow: -.72 * sample(channel + 1) - .12 + .10 * Math.cos(stride - .48),
        wrist: -.55 * sample(channel + 2) + .13 * Math.sin(stride - .40),
      };
    }),
    footfall,
    phase: (cycle / 2 + 1) % 1,
  };
}
