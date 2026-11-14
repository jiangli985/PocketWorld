import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const STANDING_IDLE = {
  delay: 6, firstYawn: [50, 70], repeatYawn: [65, 95],
  firstLook: [20, 30], repeatLook: [24, 36], gestureGap: 8,
  fadeIn: 1.2, fadeOut: .28, yawnBlend: .85,
  breathPeriod: 4.8, breathPitch: .025, swayPeriod: 9, swayRoll: .035,
  headTurn: .055, shoulderRoll: .025, armSwing: .075, elbowRelax: .12,
} as const;
const smooth = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const interval = (range: readonly number[], random: () => number) => range[0] + random() * (range[1] - range[0]);

export function createIdleState(random = Math.random) {
  return { elapsed: 0, phase: 0, weight: 0, yawnTime: -1, yawnWeight: 0,
    nextYawn: interval(STANDING_IDLE.firstYawn, random), interrupted: false,
    lookTime: -1, lookWeight: 0, nextLook: interval(STANDING_IDLE.firstLook, random), nextGesture: 0 };
}
export type IdleState = ReturnType<typeof createIdleState>;

export function stepIdle(state: IdleState, delta: number, eligible: boolean, duration: number, random = Math.random, lookDuration = 0) {
  const dt = THREE.MathUtils.clamp(delta, 0, .05);
  if (state.weight > 0 || eligible) state.phase += dt;
  if (!eligible) {
    if (state.elapsed > 0) {
      state.nextYawn = interval(STANDING_IDLE.firstYawn, random);
      state.nextLook = interval(STANDING_IDLE.firstLook, random);
      state.nextGesture = 0;
    }
    state.elapsed = 0;
    state.interrupted = true;
    state.weight = Math.max(0, state.weight - dt / STANDING_IDLE.fadeOut);
    state.yawnWeight = Math.max(0, state.yawnWeight - dt / STANDING_IDLE.fadeOut);
    if (!state.yawnWeight) state.yawnTime = -1;
    state.lookWeight = Math.max(0, state.lookWeight - dt / STANDING_IDLE.fadeOut);
    if (!state.lookWeight) state.lookTime = -1;
    return;
  }
  state.elapsed += dt;
  state.weight = Math.min(1, state.weight + (state.elapsed >= STANDING_IDLE.delay ? dt / STANDING_IDLE.fadeIn : -dt / STANDING_IDLE.fadeOut));
  state.weight = Math.max(0, state.weight);
  if (state.interrupted && (state.yawnTime >= 0 || state.lookTime >= 0)) {
    state.yawnWeight = Math.max(0, state.yawnWeight - dt / STANDING_IDLE.fadeOut);
    if (!state.yawnWeight) state.yawnTime = -1;
    state.lookWeight = Math.max(0, state.lookWeight - dt / STANDING_IDLE.fadeOut);
    if (!state.lookWeight) state.lookTime = -1;
    return;
  }
  state.interrupted = false;
  // Due yawns take priority, but never truncate a look; leave ordinary idle between gestures.
  if (state.yawnTime < 0 && state.lookTime < 0 && state.elapsed >= state.nextGesture) {
    if (duration > 0 && state.elapsed >= state.nextYawn) state.yawnTime = 0;
    else if (lookDuration > 0 && state.elapsed >= state.nextLook) state.lookTime = 0;
  }
  if (state.lookTime >= 0) {
    state.lookTime += dt;
    state.lookWeight = smooth(state.lookTime / STANDING_IDLE.yawnBlend)
      * smooth((lookDuration - state.lookTime) / STANDING_IDLE.yawnBlend);
    if (state.lookTime >= lookDuration) {
      state.lookTime = -1;
      state.lookWeight = 0;
      state.nextLook = state.elapsed + interval(STANDING_IDLE.repeatLook, random);
      state.nextGesture = state.elapsed + STANDING_IDLE.gestureGap;
    }
  }
  if (state.yawnTime < 0) return;
  state.yawnTime += dt;
  state.yawnWeight = smooth(state.yawnTime / STANDING_IDLE.yawnBlend)
    * smooth((duration - state.yawnTime) / STANDING_IDLE.yawnBlend);
  if (state.yawnTime >= duration) {
    state.yawnTime = -1;
    state.yawnWeight = 0;
    state.nextYawn = state.elapsed + interval(STANDING_IDLE.repeatYawn, random);
    state.nextGesture = state.elapsed + STANDING_IDLE.gestureGap;
  }
}

let pendingLook: Promise<THREE.AnimationClip> | undefined;
export function loadLookingAround() {
  return pendingLook ??= new GLTFLoader().loadAsync('./models/resident/luna-looking-around.glb').then(({ animations }) => {
    const clip = animations.find(value => value.name === 'Luna_Looking_Around');
    if (!clip) throw new Error('Luna looking around animation missing');
    return clip;
  }).catch(error => { pendingLook = undefined; throw error; });
}

let pending: Promise<THREE.AnimationClip> | undefined;
export function loadYawn() {
  return pending ??= new GLTFLoader().loadAsync('./models/resident/luna-yawn.glb').then(({ animations }) => {
    const clip = animations.find(value => value.name === 'Luna_Yawn');
    if (!clip) throw new Error('Luna yawn animation missing');
    return clip;
  }).catch(error => { pending = undefined; throw error; });
}

/** Called after the resident's base pose. Only upper-body rotations are owned here. */
export function createIdlePlayer(root: THREE.Object3D, clip?: THREE.AnimationClip, lookClip?: THREE.AnimationClip) {
  const bind = (motion?: THREE.AnimationClip) => motion?.tracks.map(track => {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const joint = root.getObjectByName(nodeName);
    if (!joint || propertyName !== 'quaternion' || !/Spine|Neck|Head|Shoulder|Arm|Hand/.test(nodeName)) {
      throw new Error('Incompatible idle track ' + track.name);
    }
    return { joint, curve: track.createInterpolant() };
  }) ?? [];
  const channels = bind(clip), lookChannels = bind(lookClip);
  const spine = root.getObjectByName('mixamorigSpine2')!;
  const neck = root.getObjectByName('mixamorigNeck')!;
  const arms = ['Right', 'Left'].map(side => ({
    shoulder: root.getObjectByName('mixamorig' + side + 'Shoulder')!,
    upper: root.getObjectByName('mixamorig' + side + 'Arm')!,
    forearm: root.getObjectByName('mixamorig' + side + 'ForeArm')!,
  }));
  const identity = new THREE.Quaternion(), rotation = new THREE.Quaternion(), euler = new THREE.Euler();
  const offset = (joint: THREE.Object3D, x: number, y: number, z: number, weight: number) => {
    rotation.setFromEuler(euler.set(x, y, z)).slerp(identity, 1 - weight);
    joint.quaternion.multiply(rotation);
  };
  return (state: IdleState) => {
    const breath = Math.sin(state.phase * Math.PI * 2 / STANDING_IDLE.breathPeriod);
    const sway = Math.sin(state.phase * Math.PI * 2 / STANDING_IDLE.swayPeriod);
    const weight = smooth(state.weight);
    offset(spine, breath * STANDING_IDLE.breathPitch, 0, sway * STANDING_IDLE.swayRoll, weight);
    offset(neck, -breath * .012, sway * STANDING_IDLE.headTurn, -sway * .015, weight);
    arms.forEach((arm, side) => {
      const direction = side ? 1 : -1;
      offset(arm.shoulder, 0, 0, direction * breath * STANDING_IDLE.shoulderRoll, weight);
      offset(arm.upper, sway * STANDING_IDLE.armSwing, 0, direction * .025, weight);
      offset(arm.forearm, STANDING_IDLE.elbowRelax * (.65 + .35 * breath), 0, 0, weight);
    });
    const time = state.lookTime >= 0 ? state.lookTime : state.yawnTime;
    const gestureWeight = state.lookTime >= 0 ? state.lookWeight : state.yawnWeight;
    if (time < 0 || !gestureWeight) return;
    for (const { joint, curve } of state.lookTime >= 0 ? lookChannels : channels) {
      rotation.fromArray(curve.evaluate(time));
      joint.quaternion.slerp(rotation, gestureWeight);
    }
  };
}
