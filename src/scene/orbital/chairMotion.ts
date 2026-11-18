/** The clip is authored against the unscaled rolling chair, with its gas lift lowered 25 cm. */
export const CHAIR_FPS = 30;
export const CHAIR_SIT_FRAMES = 98;
export const CHAIR_SIT_SECONDS = (CHAIR_SIT_FRAMES - 1) / CHAIR_FPS;
/** Blender frame 53 is the low, feet-planted pose from which Luna can propel the chair. */
export const CHAIR_PERCH_SECONDS = (53 - 1) / CHAIR_FPS;
export const CHAIR_LIFT_SECONDS = 1.5;
export const CHAIR_REST_LIFT = .08;
export const CHAIR_CLIP_ORIGIN = .54;
const smooth = (t: number) => t * t * (3 - 2 * t);
const ROLL_RELEASE_SECONDS = .8;
export interface ChairMotion {
  align: number; time: number; height: number; from: number; target: number; elapsed: number; idle: number;
  hasSeated: boolean;
  phase: 'align' | 'sit' | 'raise' | 'seated' | 'lower' | 'perch' | 'move' | 'stand' | 'leave';
}
export const createChairMotion = (): ChairMotion => ({ align: 0, time: 0, height: 0, from: 0, target: 0, elapsed: 0, idle: ROLL_RELEASE_SECONDS, hasSeated: false, phase: 'align' });

/** One writer owns clip time and lift height. Requests may reverse a lift, never jump it. */
export function stepChairMotion(s: ChairMotion, delta: number, exiting: boolean, moving: boolean, reduced: boolean) {
  const dt = Math.max(0, Math.min(delta, .04));
  const alignSeconds = reduced ? .12 : .55;
  const speed = reduced ? CHAIR_SIT_SECONDS / .4 : 1;
  s.idle = moving ? 0 : Math.min(ROLL_RELEASE_SECONDS, s.idle + dt);
  const seated = s.align === 1 && s.time === CHAIR_SIT_SECONDS;
  const rolling = s.hasSeated && s.idle < ROLL_RELEASE_SECONDS;
  const target = !exiting && seated && !rolling && !moving ? CHAIR_REST_LIFT : 0;
  if (s.target !== target) { s.from = s.height; s.target = target; s.elapsed = 0; }
  s.elapsed = Math.min(reduced ? .12 : CHAIR_LIFT_SECONDS, s.elapsed + dt);
  s.height = s.from + (s.target - s.from) * smooth(s.elapsed / (reduced ? .12 : CHAIR_LIFT_SECONDS));
  if (exiting) {
    if (s.height > 1e-7) s.phase = 'lower';
    else if (s.time > 0) { s.phase = 'stand'; s.time = Math.max(0, s.time - dt * speed); }
    else { s.phase = 'leave'; s.align = Math.max(0, s.align - dt / alignSeconds); }
  } else if (s.align < 1) { s.phase = 'align'; s.align = Math.min(1, s.align + dt / alignSeconds); }
  else if (rolling) {
    if (s.height > 0) s.phase = 'lower';
    else {
      s.time = Math.max(CHAIR_PERCH_SECONDS, s.time - dt * speed * 1.5);
      s.phase = s.time === CHAIR_PERCH_SECONDS ? 'move' : 'perch';
    }
  } else if (s.time < CHAIR_SIT_SECONDS) {
    s.phase = 'sit';
    s.time = Math.min(CHAIR_SIT_SECONDS, s.time + dt * speed);
    if (s.time === CHAIR_SIT_SECONDS) s.hasSeated = true;
  }
  else if (s.height !== s.target) s.phase = s.target > s.height ? 'raise' : 'lower';
  else s.phase = moving ? 'move' : 'seated';
  return { done: exiting && s.align === 0 && s.time === 0 && s.height === 0,
    canMove: !exiting && rolling && s.height === 0 && s.time === CHAIR_PERCH_SECONDS,
    weight: smooth(s.align), offset: CHAIR_CLIP_ORIGIN };
}
