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
const { createIdleState, stepIdle, createIdlePlayer } = compile('./standingIdle.ts');
const { createResidentRig } = compile('./residentRig.ts');
const random = () => .5;
const raw = readFileSync(new URL('../../../assets/public/models/resident/luna-yawn.glb', import.meta.url));
const { animations: [clip] } = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
const lookRaw = readFileSync(new URL('../../../assets/public/models/resident/luna-looking-around.glb', import.meta.url));
const { animations: [lookClip] } = await new GLTFLoader().parseAsync(lookRaw.buffer.slice(lookRaw.byteOffset, lookRaw.byteOffset + lookRaw.byteLength), '');

test('both gestures finish once, never overlap, and ordinary > looking > yawn at 30/60/120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    for (const sample of [0, .5, .999]) {
      const rng = () => sample, state = createIdleState(rng);
      const counts = [0, 0], seconds = [0, 0];
      let previous = -1, started = 0, ended = -Infinity;
      for (let frame = 0; frame < hz * 1200; frame++) {
        stepIdle(state, 1 / hz, true, clip.duration, rng, lookClip.duration);
        assert(!(state.yawnTime >= 0 && state.lookTime >= 0));
        const active = state.lookTime >= 0 ? 0 : state.yawnTime >= 0 ? 1 : -1;
        if (active >= 0) seconds[active] += 1 / hz;
        if (active !== previous) {
          if (previous >= 0) {
            assert.equal(active, -1, 'must return to ordinary idle');
            const duration = previous === 0 ? lookClip.duration : clip.duration;
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
      assert(1200 - seconds[0] - seconds[1] > 1200 * .65);
    }
  }
});

test('looking interruption holds current sample while fading, resets deadlines, and absent clips never block yawns', () => {
  const state = createIdleState(random);
  for (let i = 0; i < 27 * 60; i++) stepIdle(state, 1 / 60, true, clip.duration, random, lookClip.duration);
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
    assert.equal(count, 7);
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

test('云朵连帽衫的两个待机动作均可绑定，并驱动两侧手腕', async () => {
  const { gltf } = await load(new URL('../../../assets/public/models/resident/luna-cloudhoodie.glb', import.meta.url));
  const fitted = [clip, lookClip].map(original => {
    const motion = gltf.animations.find(animation => animation.name === original.name);
    assert.ok(motion, original.name);
    assert.ok(Math.abs(motion.duration - original.duration) < 1e-5);
    for (const side of ['Left', 'Right']) {
      assert.ok(motion.tracks.some(track => track.name === 'mixamorig' + side + 'Hand.quaternion'));
    }
    return motion;
  });
  const player = createIdlePlayer(gltf.scene, ...fitted);
  const state = createIdleState(random);
  for (const [index, gesture] of ['yawn', 'look'].entries()) {
    state[gesture + 'Time'] = fitted[index].duration / 2;
    state[gesture + 'Weight'] = 1;
    player(state);
    for (const side of ['Left', 'Right']) {
      const name = 'mixamorig' + side + 'Hand';
      const sample = fitted[index].tracks.find(track => track.name === name + '.quaternion')
        .createInterpolant().evaluate(state[gesture + 'Time']);
      const expected = new THREE.Quaternion().fromArray(sample).normalize();
      assert.ok(gltf.scene.getObjectByName(name).quaternion.angleTo(expected) < .001);
    }
    state[gesture + 'Time'] = -1;
    state[gesture + 'Weight'] = 0;
  }
});

test('云朵装两侧 Shape Keys 随各自的手臂受压和回弹', async () => {
  const { createSleeveContact } = compile('./wardrobe/sleeveContact.ts');
  const { gltf } = await load(new URL('../../../assets/public/models/resident/luna-cloudhoodie.glb', import.meta.url));
  const rig = createResidentRig(gltf.scene, gltf.animations.find(a => a.name === 'Walk_Grounded_Loop'), true);
  try {
    const update = createSleeveContact(gltf.scene);
    const cloth = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
    const left = cloth.morphTargetDictionary.SleeveContact_L, right = cloth.morphTargetDictionary.SleeveContact_R;
    const offsets = cloth.geometry.morphAttributes.position;
    assert.ok(offsets[left].array.some(value => value < -.01));
    assert.ok(offsets[right].array.some(value => value > .01));
    rig.applyPose(0, 0);
    update();
    assert.deepEqual([cloth.morphTargetInfluences[left], cloth.morphTargetInfluences[right]], [1, 1]);
    const yawn = gltf.animations.find(a => a.name === 'Luna_Yawn');
    const gesture = createIdlePlayer(rig.mesh, yawn);
    const state = createIdleState(random);
    let asymmetric = false, intermediate = false;
    for (let i = 0; i <= 60; i++) {
      rig.applyPose(0, 0);
      state.yawnTime = i / 60 * yawn.duration;
      state.yawnWeight = 1;
      gesture(state);
      update();
      const a = cloth.morphTargetInfluences[left], b = cloth.morphTargetInfluences[right];
      if (Math.abs(a - b) > .45) asymmetric = true;
      if ([a, b].some(value => value > .05 && value < .95)) intermediate = true;
    }
    assert.ok(asymmetric && intermediate);
    rig.applyPose(0, 0);
    update();
    assert.deepEqual([cloth.morphTargetInfluences[left], cloth.morphTargetInfluences[right]], [1, 1]);
  } finally { rig.dispose(); }
});

test('云朵装贴臂时两只袖筒在肘部上下都保有宽度和厚度', async () => {
  const path = new URL('../../../assets/public/models/resident/luna-cloudhoodie.glb', import.meta.url);
  const { gltf } = await load(path);
  const rig = createResidentRig(gltf.scene, gltf.animations.find(a => a.name === 'Walk_Grounded_Loop'), true);
  try {
    rig.applyPose(0, 0);
    compile('./wardrobe/sleeveContact.ts').createSleeveContact(gltf.scene)();
    rig.mesh.updateMatrixWorld(true);
    const cloth = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
    const { skinIndex, position } = cloth.geometry.attributes;
    const point = new THREE.Vector3();
    for (const side of ['Left', 'Right']) {
      const [upper, elbow, wrist] = ['Arm', 'ForeArm', 'Hand'].map(name =>
        cloth.skeleton.getBoneByName('mixamorig' + side + name));
      const height = joint => cloth.worldToLocal(joint.getWorldPosition(point)).y;
      const bands = [upper, wrist].map(joint => ({
        y: THREE.MathUtils.lerp(height(elbow), height(joint), .32),
        section: new THREE.Box3(),
      }));
      for (let i = 0; i < position.count; i++) {
        const primary = cloth.skeleton.bones[skinIndex.getX(i)];
        if (primary !== upper && primary !== elbow) continue;
        cloth.getVertexPosition(i, point);
        for (const band of bands) {
          if (Math.abs(point.y - band.y) < .006) band.section.expandByPoint(point);
        }
      }
      for (const { section } of bands) {
        const { x: width, z: depth } = section.getSize(point);
        assert.ok(width > .032 && depth > .040 && width / depth > .44,
          side + ' sleeve cross-section ' + JSON.stringify({ width, depth }));
      }
    }
  } finally { rig.dispose(); }
});
