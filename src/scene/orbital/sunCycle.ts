/**
 * Compressed orbital day. The Sun travels on a great circle that passes behind Earth, so
 * the habitat falls into Earth's shadow once per lap. Pure maths, no Three.js, so the
 * timing can be unit-tested.
 *
 * Phase 0 is orbital noon (Sun opposite Earth) and phase 0.5 is the middle of the eclipse.
 */
export type Vec3 = readonly [number, number, number];

/** One full lap, in real seconds at speed 1. */
export const SUN_CYCLE_SECONDS = 480;
/** Share of the lap during which the Sun is hidden behind Earth. */
export const ECLIPSE_FRACTION = 0.2;
/** The original fixed key-light direction; the visit starts with the Sun here. */
export const BASE_SUN_DIRECTION: Vec3 = [-0.534522, 0.801784, 0.267261];
/** Room key light never drops below this height, so the cabin stays readable. */
export const ROOM_LIGHT_MIN_ELEVATION = 0.3;

const DEG = Math.PI / 180;
const TWILIGHT_IN = -0.7;
const TWILIGHT_OUT = 1.5;
const WARM_BAND = 12;

export interface SunOrbit {
  /** Unit vector toward Earth's centre. */
  earth: Vec3;
  /** Unit vector in the orbit plane, perpendicular to `earth`. */
  axis: Vec3;
  /** Earth's apparent radius in degrees. */
  angularRadius: number;
  /** Easing exponent: slows the Sun near Earth so the eclipse lasts ECLIPSE_FRACTION of a lap. */
  exponent: number;
}

export interface SunSample {
  direction: [number, number, number];
  /** Degrees between the Sun and Earth's limb; negative while hidden. */
  separation: number;
  /** 0 inside Earth's shadow, 1 in full sunlight. */
  daylight: number;
  /** 1 when the Sun grazes the limb (light through the atmosphere), 0 far from it. */
  warmth: number;
}

function length(v: Vec3) { return Math.hypot(v[0], v[1], v[2]); }
function normalize(v: Vec3): [number, number, number] {
  const l = length(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dot(a: Vec3, b: Vec3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createSunOrbit(earthPosition: Vec3, earthRadius: number, reference: Vec3 = BASE_SUN_DIRECTION): SunOrbit {
  const earth = normalize(earthPosition);
  const ref = normalize(reference);
  const along = dot(ref, earth);
  const axis = normalize([ref[0] - along * earth[0], ref[1] - along * earth[1], ref[2] - along * earth[2]]);
  const angularRadius = Math.asin(Math.min(1, earthRadius / length(earthPosition))) / DEG;
  const exponent = Math.log(angularRadius / 180) / Math.log(ECLIPSE_FRACTION);
  return { earth, axis, angularRadius, exponent };
}

/** Signed angle in degrees from Earth's centre along the orbit. */
export function sunAngle(orbit: SunOrbit, phase: number) {
  const p = phase - Math.floor(phase);
  const t = 1 - 2 * p;
  return 180 * Math.sign(t) * Math.abs(t) ** orbit.exponent;
}

/** Inverse of `sunAngle` for the descending half (0 < angle <= 180) or the rising half (negative). */
export function sunPhaseForAngle(orbit: SunOrbit, angle: number) {
  const t = Math.sign(angle) * (Math.min(180, Math.abs(angle)) / 180) ** (1 / orbit.exponent);
  return (1 - t) / 2;
}

/** Phase at which the Sun sits at `reference`, used as the start of every visit. */
export function startPhase(orbit: SunOrbit, reference: Vec3 = BASE_SUN_DIRECTION) {
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(normalize(reference), orbit.earth)))) / DEG;
  return sunPhaseForAngle(orbit, angle);
}

export function sampleSun(orbit: SunOrbit, phase: number): SunSample {
  const angle = sunAngle(orbit, phase);
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);
  const { earth: e, axis: a } = orbit;
  const direction = normalize([e[0] * c + a[0] * s, e[1] * c + a[1] * s, e[2] * c + a[2] * s]);
  const separation = Math.abs(angle) - orbit.angularRadius;
  return {
    direction,
    separation,
    daylight: smoothstep(TWILIGHT_IN, TWILIGHT_OUT, separation),
    warmth: 1 - smoothstep(0, WARM_BAND, separation),
  };
}

/** Key-light direction for the room: Sun azimuth, but never from below the floor. */
export function roomLightDirection(direction: Vec3, minElevation = ROOM_LIGHT_MIN_ELEVATION): [number, number, number] {
  if (direction[1] >= minElevation) return normalize(direction);
  const flat = Math.hypot(direction[0], direction[2]);
  if (flat < 1e-6) return [0, 1, 0];
  const horizontal = Math.sqrt(1 - minElevation * minElevation) / flat;
  return [direction[0] * horizontal, minElevation, direction[2] * horizontal];
}

export interface SunOverrides {
  /** Fixed phase from `?sun=`, or null to run the cycle. */
  phase: number | null;
  /** Speed multiplier from `?sunSpeed=`. */
  speed: number;
}

export function readSunOverrides(search: string): SunOverrides {
  const params = new URLSearchParams(search);
  const rawPhase = params.get('sun');
  const rawSpeed = params.get('sunSpeed');
  const phase = rawPhase === null || rawPhase.trim() === '' ? NaN : Number(rawPhase);
  const speed = rawSpeed === null || rawSpeed.trim() === '' ? NaN : Number(rawSpeed);
  return {
    phase: Number.isFinite(phase) ? phase - Math.floor(phase) : null,
    speed: Number.isFinite(speed) ? Math.min(240, Math.max(0, speed)) : 1,
  };
}
