import { AnimationClip, MathUtils, Object3D, PropertyBinding } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FLOOR_SOFA } from './cabinLayout';
import { WALK_SPEED } from './residentRig';

// Route to the rug outside the blanket's navigation box. Only the last
// straight backward steps enter that conservative box, along the open front.
const approachDepth = 1.50;
const seatCenterX = -.16;
const standingDepth = .725;
export const SOFA_ENTRY: [number, number] = [
  FLOOR_SOFA.position[0] + Math.sin(FLOOR_SOFA.yaw) * approachDepth + Math.cos(FLOOR_SOFA.yaw) * seatCenterX,
  FLOOR_SOFA.position[2] + Math.cos(FLOOR_SOFA.yaw) * approachDepth - Math.sin(FLOOR_SOFA.yaw) * seatCenterX,
];
export const SOFA_STEPS = (approachDepth - standingDepth) / WALK_SPEED;
let pending: Promise<AnimationClip> | undefined;
export function loadSofaClip() {
  return pending ??= new GLTFLoader().loadAsync('./models/resident/luna-sofa-low-sit.glb').then(asset => {
    const clip = asset.animations.find(animation => animation.name === 'Luna_CMU_75_20');
    if (!clip) throw new Error('Missing CMU 75_20');
    return clip;
  }).catch(error => { pending = undefined; throw error; });
}
export function sofaPlayer(root: Object3D, clip: AnimationClip) {
  const channels = clip.tracks.map(track => {
    const { nodeName, propertyName } = PropertyBinding.parseTrackName(track.name);
    const joint = root.getObjectByName(nodeName);
    if (!joint || (propertyName !== 'position' && propertyName !== 'quaternion')) throw new Error(track.name);
    return { property: joint[propertyName], sample: track.createInterpolant() };
  });
  return (time: number) => {
    for (const channel of channels) channel.property.fromArray(channel.sample.evaluate(MathUtils.clamp(time, 0, clip.duration)));
  };
}

// Loaded cushion deflection in millimetres, sampled against Luna's skinned
// triangles every two 30 Hz bake frames. The last sample is the held pose.
const compression = [0, 4, 14, 22, 30, 39, 42, 48, 52, 55, 59, 67, 74, 76, 76, 74, 74, 72, 69, 65, 62, 58, 57, 56, 56];
export function sofaPressure(time: number | null) {
  if (time === null || time <= 1.2) return 0;
  const frame = MathUtils.clamp((time * 30 - 36) / 2, 0, compression.length - 1);
  const left = Math.floor(frame);
  return MathUtils.lerp(compression[left], compression[Math.min(left + 1, compression.length - 1)], frame - left) / 80;
}
