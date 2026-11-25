import { readFileSync, writeFileSync } from 'node:fs';
import { AnimationMixer, LoopOnce, MathUtils, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const [upstairs, downstairs] = process.argv.slice(2);
if (!upstairs || !downstairs) throw new Error('Pass the MotionSmith walk_upstairs_take1 and walk_downstairs_take1 GLBs.');

// Sample toe-off to contralateral toe-off on the UE5 Manny skeleton. Coordinates are metres, +Z forward.
async function extract(path, name, contacts) {
  const raw = readFileSync(path);
  const gltf = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  const clip = gltf.animations.find(clip => clip.name === name);
  if (!clip) throw new Error('Missing source clip ' + name);
  const head = gltf.scene.getObjectByName('head');
  const headRestInverse = head.getWorldQuaternion(new Quaternion()).invert();
  const supportOffsets = [];
  const mixer = new AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  const point = name => gltf.scene.getObjectByName(name).getWorldPosition(new Vector3());
  const samples = [0, 1].map(index => {
    const side = index === 0 ? 'r' : 'l';
    const start = contacts[index], end = contacts[index + 1];
    const frames = Array.from({ length: end - start + 1 }, (_, n) => {
      action.time = (start + n) / 30;
      mixer.update(0);
      const ankle = point('foot_' + side), toes = point('ball_' + side).sub(ankle);
      const pelvis = point('pelvis');
      const trunk = point('neck_01').sub(pelvis);
      const legs = [], arms = [];
      let swingLength = 0;
      for (const s of ['r', 'l']) {
        const hip = point('thigh_' + s), knee = point('calf_' + s), foot = point('foot_' + s);
        const thigh = knee.clone().sub(hip), shin = foot.clone().sub(knee);
        const length = thigh.length() + shin.length();
        if (s === side) swingLength = length;
        legs.push(thigh.angleTo(shin), (hip.z - foot.z) / length, (hip.x - foot.x) / length);
        const chain = ['upperarm_', 'lowerarm_', 'hand_', 'middle_01_'].map(n => point(n + s));
        for (let j = 1; j < chain.length; j++) arms.push(...chain[j].clone().sub(chain[j - 1]).normalize().toArray());
      }
      const facing = new Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new Quaternion()).multiply(headRestInverse));
      const headPitch = Math.atan2(-facing.y, Math.hypot(facing.x, facing.z));
      const supportZ = point(index === 0 ? 'foot_l' : 'foot_r').z;
      return { ankle, supportZ, headPitch, pelvis, swingLength, pitch: -Math.atan2(toes.y, toes.z), lean: Math.atan2(trunk.z, trunk.y), legs, arms };
    });
    const first = frames[0], last = frames.at(-1);
    const plantedZ = frames.reduce((sum, frame) => sum + frame.supportZ, 0) / frames.length;
    supportOffsets.push((first.pelvis.z - plantedZ) / (last.pelvis.z - first.pelvis.z));
    let advance = 0;
    return frames.map((f, n) => {
      advance = MathUtils.clamp((f.ankle.z - first.ankle.z) / (last.ankle.z - first.ankle.z), advance, 1);
      const clearance = f.ankle.y - MathUtils.lerp(first.ankle.y, last.ankle.y, advance);
      const row = [advance, clearance / f.swingLength, f.pitch - MathUtils.lerp(first.pitch, last.pitch, n / (end - start)), f.lean, ...f.legs, ...f.arms];
      for (const axis of ['z', 'y']) row.push((f.pelvis[axis] - first.pelvis[axis]) / (last.pelvis[axis] - first.pelvis[axis]));
      row.push(f.headPitch);
      return row;
    });
  });
  // Both steps share a measured origin relative to the planted ankle, so swapping feet preserves continuity.
  const origin = (supportOffsets[0] + supportOffsets[1]) / 2;
  for (const step of samples) for (const row of step) row[28] += origin;
  // Close the outer seam of the angular channels. The travel channels span a whole step.
  const [right, left] = samples;
  for (let i = 3; i < right[0].length; i++) {
    if (i === 28 || i === 29) continue;
    const delta = (left.at(-1)[i] - right[0][i]) / 2;
    for (let n = 0; n < 4; n++) {
      const blend = 1 - MathUtils.smoothstep(n, 0, 4);
      right[n][i] += delta * blend;
      left[left.length - 1 - n][i] -= delta * blend;
    }
  }
  return samples.map(step => step.map(row => row.map(x => Number(x.toFixed(5)))));
}

const up = await extract(upstairs, 'walk_upstairs_take1', [48, 64, 80]);
const down = await extract(downstairs, 'walk_downstairs_take1', [57, 76, 94]);
const output = new URL('../assets/models/resident/luna-stair-gait.json', import.meta.url);
const formatSteps = steps => steps.map(rows => '[\n      ' + rows.map(row => JSON.stringify(row)).join(',\n      ') + '\n    ]').join(', ');
writeFileSync(output, '{\n  "up": [' + formatSteps(up) + '],\n  "down": [' + formatSteps(down) + ']\n}\n');
