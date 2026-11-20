/** The seat and armrests use the low contact pose of the authored Blender clip. */
export const CHAIR_FPS = 30;
export const CHAIR_SIT_FRAMES = 98;
export const CHAIR_SIT_SECONDS = (CHAIR_SIT_FRAMES - 1) / CHAIR_FPS;
export const CHAIR_CLIP_ORIGIN = .54;

interface ChairMotion {
  align: number;
  time: number;
  phase: 'align' | 'sit' | 'seated' | 'stand' | 'leave';
}

export const createChairMotion = (): ChairMotion => ({ align: 0, time: 0, phase: 'align' });

/** Align on the floor, then sample the same contact clip forward or backward. */
export function stepChairMotion(motion: ChairMotion, delta: number, exiting: boolean, reduced: boolean) {
  const dt = Math.max(0, Math.min(delta, .04));
  const alignSeconds = reduced ? .12 : .55;
  const speed = reduced ? CHAIR_SIT_SECONDS / .4 : 1;
  if (exiting) {
    if (motion.time > 0) {
      motion.phase = 'stand';
      motion.time = Math.max(0, motion.time - dt * speed);
    } else {
      motion.phase = 'leave';
      motion.align = Math.max(0, motion.align - dt / alignSeconds);
    }
  } else if (motion.align < 1) {
    motion.phase = 'align';
    motion.align = Math.min(1, motion.align + dt / alignSeconds);
  } else {
    motion.time = Math.min(CHAIR_SIT_SECONDS, motion.time + dt * speed);
    motion.phase = motion.time === CHAIR_SIT_SECONDS ? 'seated' : 'sit';
  }
  return {
    done: exiting && motion.align === 0 && motion.time === 0,
    weight: motion.align * motion.align * (3 - 2 * motion.align),
    offset: CHAIR_CLIP_ORIGIN,
  };
}
