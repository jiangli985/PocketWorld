import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { load } from './load-for-validation.mjs';

function compile(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const context = { exports: {}, require: name => name === 'three' ? THREE : { GLTFLoader } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const { createIdleState, stepIdle, createIdlePlayer, STANDING_IDLE } = compile('./standingIdle.ts');
const { createResidentRig } = compile('./residentRig.ts');
const random = () => .5;
const raw = readFileSync(new URL('../../../assets/public/models/resident/luna-yawn.glb', import.meta.url));
const { animations: [clip] } = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
const lookRaw = readFileSync(new URL('../../../assets/public/models/resident/luna-looking-around.glb', import.meta.url));
const { animations: [lookClip] } = await new GLTFLoader().parseAsync(lookRaw.buffer.slice(lookRaw.byteOffset, lookRaw.byteOffset + lookRaw.byteLength), '');

test('all gestures finish without overlap and ordinary idle dominates at 30/60/120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    for (const sample of [0, .5, .999]) {
      const rng = () => sample, state = createIdleState(rng);
      const counts = [0, 0, 0, 0], seconds = [0, 0, 0, 0];
      const durations = [lookClip.duration, clip.duration, STANDING_IDLE.shortDuration.listen, STANDING_IDLE.shortDuration.clasp];
      let previous = -1, started = 0, ended = -Infinity;
      for (let frame = 0; frame < hz * 1200; frame++) {
        stepIdle(state, 1 / hz, true, clip.duration, rng, lookClip.duration);
        assert([state.lookTime, state.yawnTime, state.shortTime].filter(time => time >= 0).length <= 1);
        const active = state.lookTime >= 0 ? 0 : state.yawnTime >= 0 ? 1
          : state.shortTime < 0 ? -1 : state.shortKind === 'listen' ? 2 : 3;
        if (active >= 0) seconds[active] += 1 / hz;
        if (active !== previous) {
          if (previous >= 0) {
            assert.equal(active, -1, 'must return to ordinary idle');
            const duration = durations[previous];
            assert(Math.abs(frame / hz - started - duration) <= 2 / hz);
            ended = frame / hz;
          } else {
            assert(frame / hz - ended >= 8 - 2 / hz);
            counts[active]++;
            started = frame / hz;
          }
        }
        previous = active;
      }
      assert(counts[0] > counts[1]);
      assert(seconds[0] > seconds[1]);
      assert(counts[2] > 0 && Math.abs(counts[2] - counts[3]) <= 1);
      assert(1200 - seconds.reduce((total, time) => total + time) > 1200 * .60);
    }
  }
});

test('looking interruption holds current sample while fading, resets deadlines, and absent clips never block yawns', () => {
  const state = createIdleState(random);
  for (let i = 0; i < 31 * 60; i++) stepIdle(state, 1 / 60, true, clip.duration, random, lookClip.duration);
  assert(state.lookTime > 1);
  const held = state.lookTime;
  stepIdle(state, 1 / 60, false, clip.duration, random, lookClip.duration);
  assert.equal(state.lookTime, held);
  assert.equal(state.elapsed, 0);
  assert.equal(state.nextLook, 25);
  for (let i = 0; i < 60; i++) stepIdle(state, 1 / 60, true, clip.duration, random, lookClip.duration);
  assert.equal(state.lookTime, -1);
  assert.equal(state.lookWeight, 0);
  const offline = createIdleState(random);
  for (let i = 0; i < 62 * 60; i++) stepIdle(offline, 1 / 60, true, clip.duration, random, 0);
  assert(offline.yawnTime > 1);
  assert.equal(offline.lookTime, -1);
});

test('real looking clip keeps root and foot matrices fixed and blends continuously into walking', async () => {
  const { gltf } = await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));
  const rig = createResidentRig(gltf.scene, gltf.animations.find(c => c.name === 'Walk_Grounded_Loop'));
  const player = createIdlePlayer(rig.mesh, clip, lookClip);
  assert.equal(lookClip.name, 'Luna_Looking_Around');
  assert(Math.abs(lookClip.duration - 190 / 30) < 1e-6);
  assert.equal(lookClip.tracks.length, 54);
  rig.applyPose(0, 0); rig.mesh.updateMatrixWorld(true);
  const fixed = ['Hips', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map(n => rig.mesh.getObjectByName('mixamorig' + n));
  const anchors = fixed.map(b => b.matrixWorld.clone());
  const bones = []; rig.mesh.traverse(b => { if (b.isBone) bones.push(b); });
  const state = createIdleState(random);
  let previous;
  try {
    for (let i = 0; i < 34 * 120; i++) {
      stepIdle(state, 1 / 120, true, clip.duration, random, lookClip.duration);
      rig.applyPose(0, 0); player(state); rig.mesh.updateMatrixWorld(true);
      fixed.forEach((b, k) => assert.deepEqual(b.matrixWorld.elements, anchors[k].elements));
      bones.forEach(b => assert(b.quaternion.toArray().every(Number.isFinite)));
      if (previous) bones.forEach((b, k) => assert(b.quaternion.angleTo(previous[k]) < .12, 'pose pop at ' + i));
      previous = bones.map(b => b.quaternion.clone());
    }
    for (const time of [.5, 2, 4, 5.8]) {
      Object.assign(state, { lookTime: time, lookWeight: 1, weight: 1, elapsed: 27, interrupted: false });
      previous = undefined;
      for (let i = 0; i <= 60; i++) {
        stepIdle(state, 1 / 120, false, clip.duration, random, lookClip.duration);
        rig.applyPose(i / 120, Math.min(1, i / 36));
        rig.mesh.updateMatrixWorld(true);
        const walkingFeet = fixed.map(b => b.matrixWorld.clone());
        player(state); rig.mesh.updateMatrixWorld(true);
        fixed.forEach((b, k) => assert.deepEqual(b.matrixWorld.elements, walkingFeet[k].elements));
        if (previous) bones.forEach((b, k) => assert(b.quaternion.angleTo(previous[k]) < .22, 'walk interruption pop'));
        previous = bones.map(b => b.quaternion.clone());
      }
      assert.equal(state.lookTime, -1);
    }
  } finally { rig.dispose(); }
});

test('ordinary idle dominates ten minutes at 30/60/120 Hz and yawns play once in full', () => {
  for (const hz of [30, 60, 120]) {
    const state = createIdleState(random);
    let yawnSeconds = 0, first = 0, count = 0, previous = -1;
    for (let frame = 0; frame < hz * 600; frame++) {
      stepIdle(state, 1 / hz, true, clip.duration, random);
      if (frame < hz * 5) assert.equal(state.weight, 0);
      if (state.yawnTime >= 0) {
        yawnSeconds += 1 / hz;
        if (previous < 0) { count++; first ||= frame / hz; }
      }
      previous = state.yawnTime;
    }
    assert(first >= 59.9 && first <= 60.1);
    assert(count >= 6 && count <= 7);
    assert(Math.abs(yawnSeconds - count * clip.duration) < .3);
    assert(yawnSeconds < 600 * .12);
  }
});

test('interruptions reset eligibility and fade the held gesture without restarting it', () => {
  const state = createIdleState(random);
  for (let i = 0; i < 62 * 60; i++) stepIdle(state, 1 / 60, true, clip.duration, random);
  assert(state.yawnTime > 1);
  const held = state.yawnTime;
  stepIdle(state, 1 / 60, false, clip.duration, random);
  assert.equal(state.elapsed, 0);
  assert.equal(state.yawnTime, held);
  for (let i = 0; i < 30; i++) stepIdle(state, 1 / 60, true, clip.duration, random);
  assert.equal(state.yawnTime, -1);
  assert.equal(state.yawnWeight, 0);
  stepIdle(state, 300, true, clip.duration, random);
  assert(state.elapsed < 1);
});

test('exported yawn binds to Luna and preserves every foot and root transform', async () => {
  const { gltf } = await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));
  const rig = createResidentRig(gltf.scene, gltf.animations.find(c => c.name === 'Walk_Grounded_Loop'));
  const player = createIdlePlayer(rig.mesh, clip);
  rig.applyPose(0, 0);
  rig.mesh.updateMatrixWorld(true);
  const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map(name => rig.mesh.getObjectByName('mixamorig' + name));
  const anchors = feet.map(bone => bone.matrixWorld.clone());
  const state = createIdleState(random);
  state.weight = 1;
  state.yawnWeight = 1;
  for (let frame = 0; frame <= 1000; frame++) {
    rig.applyPose(0, 0);
    state.elapsed = frame / 120;
    state.yawnTime = Math.min(frame / 120, clip.duration);
    player(state);
    rig.mesh.updateMatrixWorld(true);
    feet.forEach((bone, i) => assert.deepEqual(bone.matrixWorld.elements, anchors[i].elements));
    rig.mesh.traverse(bone => { if (bone.isBone) assert(bone.quaternion.toArray().every(Number.isFinite)); });
  }
  assert(Math.abs(clip.duration - 250 / 30) < 1e-6);
  assert.equal(clip.tracks.length, 54);
  rig.dispose();
});


test('ordinary idle visibly moves head and hands while preserving planted feet', async () => {
  const { gltf } = await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));
  const rig = createResidentRig(gltf.scene, gltf.animations.find(c => c.name === 'Walk_Grounded_Loop'));
  const player = createIdlePlayer(rig.mesh);
  const state = createIdleState(random);
  state.weight = 1;
  const names = ['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'];
  const joints = names.map(name => rig.mesh.getObjectByName('mixamorig' + name));
  const bounds = joints.map(() => new THREE.Box3());
  const point = new THREE.Vector3();
  try {
    for (let frame = 0; frame <= 9 * 60; frame++) {
      rig.applyPose(0, 0);
      state.phase = frame / 60;
      player(state);
      rig.mesh.updateMatrixWorld(true);
      joints.forEach((joint, i) => bounds[i].expandByPoint(joint.getWorldPosition(point)));
    }
    const travel = bounds.map(box => box.getSize(new THREE.Vector3()).length());
    for (let i = 0; i < 3; i++) assert(travel[i] > .015 && travel[i] < .14, names[i] + ' travel ' + travel[i]);
    assert(travel[3] < 1e-8 && travel[4] < 1e-8);
    console.log('ordinary idle movement in metres', Object.fromEntries(names.map((name, i) => [name, travel[i]])));
  } finally { rig.dispose(); }
});

test('resting arms lower independently with cloth correctives and release for a reach or interaction', async () => {
  const { gltf, mesh } = await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));
  const rig = createResidentRig(gltf.scene, gltf.animations.find(c => c.name === 'Walk_Grounded_Loop'));
  const player = createIdlePlayer(rig.mesh);
  const state = createIdleState(random);
  const bone = name => rig.mesh.getObjectByName('mixamorig' + name);
  const left = mesh.morphTargetDictionary.LeftArmContact;
  const right = mesh.morphTargetDictionary.RightArmContact;
  assert.notEqual(left, right);
  const weights = mesh.morphTargetInfluences;
  const place = name => bone(name).getWorldPosition(new THREE.Vector3());
  const w = () => ['LeftHand', 'RightHand'].map(place);
  const apply = (animated = true) => {
    rig.applyPose(0, 0);
    player(state, animated);
    rig.applyArmCorrectives(true);
  };
  try {
    apply();
    const initial = w();
    for (let i = 0; i < 60; i++) stepIdle(state, 1 / 60, false, 0, random, 0, true);
    apply(false);
    assert.equal(state.weight, 0);
    assert.equal(state.shortTime, -1);
    assert(w().every((point, i) => Math.abs(point.x) < Math.abs(initial[i].x) - .03));
    assert(weights[left] > .42 && weights[right] > .42);

    // Lift one arm from the same pose; the opposite skirt side retains its own weight.
    const rightAtRest = weights[right];
    bone('LeftArm').rotateX(1.05);
    rig.applyArmCorrectives(true);
    assert(weights[left] < .15);
    assert.equal(weights[right], rightAtRest);

    Object.assign(state, { shortKind: 'clasp', shortTime: 2, shortWeight: 1, weight: 1 });
    apply();
    assert(place('LeftHandMiddle4').distanceTo(place('RightHandIndex4')) < .11);
    assert(weights[left] < .15 && weights[right] < .15);
    rig.applyArmCorrectives(false);
    assert(weights.every(value => value === 0));
  } finally {
    rig.dispose();
  }
});
