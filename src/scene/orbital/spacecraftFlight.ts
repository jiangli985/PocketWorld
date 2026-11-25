import * as THREE from 'three';
import { CAMERA_FOV } from './cabinView.ts';

export type SpacecraftViewMode = 'approach' | 'orbit' | 'entering-cabin' | 'leaving-cabin' | 'cabin';

export const SHIP_TARGET = new THREE.Vector3(-1.15, 1.85, -0.115);
/** Front-left-above orbital framing: showcases hero triptych windows, bow canopy, solar wings, plumes, and Earth behind. */
export const ORBIT_DIRECTION = new THREE.Vector3(-3.8, 6.2, 16.0).normalize();
/** Opening deep-space approach vector: starts farther out & slightly aft-high, swooping gracefully to ORBIT_DIRECTION. */
export const APPROACH_DIRECTION = new THREE.Vector3(-10.5, 9.2, 22.5).normalize();

export const APPROACH_DURATION = 2.6;
export const ENTER_CABIN_DURATION = 1.15;
export const LEAVE_CABIN_DURATION = 1.05;
export const REDUCED_TRANSITION_DURATION = 0.14;

/** Up to 36x orbital time speed at full boost (~13.3 s per full orbital day/night cycle). */
export const BOOST_TIME_SCALE_EXTRA = 35;
export const BASE_EARTH_SPIN_SPEED = 0.008;
export const BOOST_EARTH_SPIN_SPEED = 0.34;
export const BASE_DRIFT_SPEED = 1.6;
export const BOOST_DRIFT_SPEED = 36.0;
export const BOOST_FOV_KICK = 5.5;

const orbitRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), ORBIT_DIRECTION).normalize();
const orbitUp = new THREE.Vector3().crossVectors(ORBIT_DIRECTION, orbitRight);
const orbitVerticalSlope = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));

export interface SpacecraftFlightState {
  mode: SpacecraftViewMode;
  boosting: boolean;
  /** Smoothed thruster boost intensity in [0, 1]. */
  boost: number;
  /** Time multiplier applied to orbital sun cycle (>= 1). */
  timeScale: number;
  /** Accumulated Earth spin angle (radians) driven by cruise + boost. */
  earthSpinAngle: number;
  /** Accumulated orbital ground-track roll (radians) driven by cruise + boost. */
  earthOrbitSweep: number;
  /** Accumulated aft space-dust drift distance. */
  travelDrift: number;
  /** Current spacecraft hull opacity in [0, 1]. */
  hullOpacity: number;
  /** Uniform wrapper synced with `boost` for Cosmos particle shaders. */
  boostUniform: { value: number };
  /** Uniform wrapper synced with `travelDrift` for Cosmos particle shaders. */
  travelUniform: { value: number };
  /** Progress in [0, 1] of opening approach glide. */
  approachProgress: number;
  /** Continuous elapsed flight time in seconds. */
  clock: number;
}

export function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function easeOutQuart(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) ** 4;
}

export function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - ((-2 * c + 2) ** 3) / 2;
}

export function readInitialViewMode(search: string, reducedMotion: boolean): SpacecraftViewMode {
  const params = new URLSearchParams(search);
  const dev = params.get('dev');
  if (dev === 'mario' || dev === 'shooter') return 'cabin';
  const view = params.get('view')?.trim().toLowerCase();
  if (view === 'cabin') return 'cabin';
  if (view === 'orbit') return 'orbit';
  return reducedMotion ? 'orbit' : 'approach';
}

export function createFlightState(initialMode: SpacecraftViewMode): SpacecraftFlightState {
  const inCabin = initialMode === 'cabin';
  return {
    mode: initialMode,
    boosting: false,
    boost: 0,
    timeScale: 1,
    earthSpinAngle: 0,
    earthOrbitSweep: 0,
    travelDrift: 0,
    hullOpacity: inCabin ? 0 : 1,
    boostUniform: { value: 0 },
    travelUniform: { value: 0 },
    approachProgress: initialMode === 'approach' ? 0 : 1,
    clock: 0,
  };
}

/**
 * Compute orbital camera distance so the entire spacecraft (fuselage, solar wings, thrusters)
 * sits comfortably framed with deep-space & Earth context at both desktop and mobile portrait.
 */
export function orbitDistanceForAspect(aspect: number): number {
  const safeAspect = Math.max(0.35, Number.isFinite(aspect) ? aspect : 16 / 9);
  let distance = 22;
  // Spacecraft visual envelope in Three.js Y-up coordinates (hull + wings + tail + plumes)
  for (const x of [-10.8, 8.2]) for (const y of [-1.3, 6.4]) for (const z of [-8.2, 8.2]) {
    const corner = new THREE.Vector3(x, y, z).sub(SHIP_TARGET);
    distance = Math.max(
      distance,
      corner.dot(ORBIT_DIRECTION) + Math.max(
        Math.abs(corner.dot(orbitRight)) / (0.66 * orbitVerticalSlope * safeAspect),
        Math.abs(corner.dot(orbitUp)) / (0.64 * orbitVerticalSlope),
      ),
    );
  }
  return distance;
}

/** Starting far-space camera position for the opening approach glide. */
export function approachStartPosition(aspect: number): THREE.Vector3 {
  const orbitDist = orbitDistanceForAspect(aspect);
  return SHIP_TARGET.clone().addScaledVector(APPROACH_DIRECTION, orbitDist * 2.45);
}

/** Target orbital cruise camera position. */
export function orbitHomePosition(aspect: number): THREE.Vector3 {
  return SHIP_TARGET.clone().addScaledVector(ORBIT_DIRECTION, orbitDistanceForAspect(aspect));
}

/** Compute hull opacity during orbit, cabin, and cutaway transitions. */
export function hullOpacityForTransition(mode: SpacecraftViewMode, progress: number): number {
  if (mode === 'approach' || mode === 'orbit') return 1;
  if (mode === 'cabin') return 0;
  if (mode === 'entering-cabin') return 1 - smoothstep01(0.18, 0.80, progress);
  return smoothstep01(0.14, 0.78, progress);
}

/** Let the two models overlap while the camera passes between exterior and interior framing. */
export function cabinOpacityForTransition(mode: SpacecraftViewMode, progress: number): number {
  if (mode === 'approach' || mode === 'orbit') return 0;
  if (mode === 'cabin') return 1;
  if (mode === 'entering-cabin') return smoothstep01(0.16, 0.72, progress);
  return 1 - smoothstep01(0.25, 0.80, progress);
}

/** Advance orbital cruise, boost inertia, time acceleration, and Earth sweep by dt seconds. */
export function stepFlightState(flight: SpacecraftFlightState, dt: number, reducedMotion: boolean): boolean {
  const step = Math.max(0, Math.min(dt, 0.1));
  if (!reducedMotion) flight.clock += step;

  const canBoost = flight.mode === 'orbit' || flight.mode === 'approach';
  const targetBoost = canBoost && flight.boosting ? 1 : 0;
  const tau = targetBoost > flight.boost ? 0.30 : 0.85;
  const blend = 1 - Math.exp(-step / tau);
  flight.boost += (targetBoost - flight.boost) * blend;
  if (Math.abs(flight.boost - targetBoost) < 0.0005) flight.boost = targetBoost;

  flight.timeScale = 1 + flight.boost * BOOST_TIME_SCALE_EXTRA;
  flight.boostUniform.value = reducedMotion ? 0 : flight.boost;

  // Earth sweeps smoothly during cruise and speeds dramatically during boost
  const earthRate = (reducedMotion && flight.boost === 0)
    ? 0
    : BASE_EARTH_SPIN_SPEED + flight.boost * BOOST_EARTH_SPIN_SPEED;
  flight.earthSpinAngle += step * earthRate;
  if (!reducedMotion) {
    flight.earthOrbitSweep += step * (0.0018 + flight.boost * 0.085);
    const driftRate = (flight.mode === 'cabin' ? 0 : BASE_DRIFT_SPEED) + flight.boost * BOOST_DRIFT_SPEED;
    flight.travelDrift += step * driftRate;
    flight.travelUniform.value = flight.travelDrift;
  }

  let finishedApproach = false;
  if (flight.mode === 'approach') {
    if (reducedMotion) {
      flight.approachProgress = 1;
      flight.mode = 'orbit';
      finishedApproach = true;
    } else {
      flight.approachProgress = Math.min(1, flight.approachProgress + step / APPROACH_DURATION);
      if (flight.approachProgress >= 1) {
        flight.mode = 'orbit';
        finishedApproach = true;
      }
    }
  }
  return finishedApproach;
}
