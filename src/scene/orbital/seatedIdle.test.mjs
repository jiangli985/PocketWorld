import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { load } from './load-for-validation.mjs';
import { createCabinActionPlayer } from './cabinActions.ts';

const modules = new Map([['three', THREE], ['three/examples/jsm/loaders/GLTFLoader.js', { GLTFLoader }]]);
function local(name) {
  if (!modules.has(name)) {
    const code = readFileSync(new URL(name + '.ts', import.meta.url), 'utf8');
    const scope = { exports: {}, require: local };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope);
    modules.set(name, scope.exports);
  }
  return modules.get(name);
}

const { createSeatedIdle, seatedIdleWeight, stepSeatedIdle, createSeatedIdlePlayer } = local('./seatedIdle');
const { createResidentRig } = local('./residentRig');
const { createChairAnimation, readSeatContactCache } = local('./chairAnimation');
const { CHAIR_SIT_SECONDS } = local('./chairMotion');
const { sofaPlayer } = local('./sofaMotion');

test('seated idles wait, pause between gestures and clear on leaving or disabling the pose', () => {
  const idle = createSeatedIdle();
  for (let frame = 0; frame < 30; frame++) stepSeatedIdle(idle, 1 / 60, 'sofa', false);
  assert.equal(idle.weight, 0);
  for (let frame = 0; frame < 110; frame++) stepSeatedIdle(idle, 1 / 60, 'sofa', false);
  assert.equal(idle.weight, 1);
  const time = idle.time;
  assert.equal(stepSeatedIdle(idle, .04, 'sofa', true), true);
  assert.equal(idle.time, time);
  assert.equal(stepSeatedIdle(idle, .04, null, true), false);
  assert.deepEqual(idle, createSeatedIdle());

  const releaseTimes = [1 / 30, 1 / 60, 1 / 120].map(dt => {
    for (let frame = 0; frame < 2 / dt; frame++) stepSeatedIdle(idle, dt, 'chair', false);
    let releaseTime = dt;
    while (stepSeatedIdle(idle, dt, 'chair', true)) releaseTime += dt;
    assert.equal(idle.weight, 0);
    stepSeatedIdle(idle, dt, null, false);
    return releaseTime;
  });
  assert(releaseTimes.every(seconds => seconds >= .32 && seconds <= .36));
  for (let frame = 0; frame < 5 * 60; frame++) stepSeatedIdle(idle, 1 / 60, 'chair', false);
  assert.equal(idle.weight, 0, 'the chair stops swinging for a while');
  for (let frame = 0; frame < 4 * 60; frame++) stepSeatedIdle(idle, 1 / 60, 'chair', false);
  assert.equal(idle.weight, 1, 'a new chair gesture can begin after the rest');
});

test('seated overlays alternate with the original gestures and release before the seat is left', () => {
  const clips = { sofaDoze: { duration: 6 }, chairGlance: { duration: 6 }, floorGlance: { duration: 6 } };
  for (const [seat, overlay] of Object.entries({ sofa: 'sofaDoze', chair: 'chairGlance', floor: 'floorGlance' })) {
    const idle = createSeatedIdle(), gestures = [];
    for (let i = 0; i < 60 * 55; i++) {
      assert.equal(stepSeatedIdle(idle, 1 / 60, seat, false, clips), false);
      if (idle.weight > 0 && (gestures.length === 0 || gestures.at(-1) !== idle.overlay)) gestures.push(idle.overlay);
    }
    assert.deepEqual(gestures.slice(0, seat === 'floor' ? 1 : 3),
      seat === 'floor' ? [overlay] : [null, overlay, null]);
    for (let i = 0; i < 60 * 30 && (idle.overlay !== overlay || idle.weight !== 1); i++) {
      stepSeatedIdle(idle, 1 / 60, seat, false, clips);
    }
    assert.equal(idle.overlay, overlay);
    assert.equal(idle.weight, 1);
    const time = idle.time;
    let previous = 1;
    for (let i = 1; i <= 20; i++) {
      assert.equal(stepSeatedIdle(idle, 1 / 60, seat, true, clips), i < 20);
      assert.equal(idle.time, time);
      const weight = seatedIdleWeight(idle);
      assert(weight <= previous);
      previous = weight;
    }
    stepSeatedIdle(idle, 1 / 60, null, false, clips);
    assert.deepEqual(idle, createSeatedIdle());
  }
});

const assets = new URL('../../../assets/public/models/resident/', import.meta.url);
const raw = readFileSync(new URL('luna-sofa-low-sit.glb', assets));
const { animations: [sofa] } = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
const outfits = {
  everyday: ['luna-walk-room', 'luna-seat-contact'],
  cardigan: ['luna-cardigan', 'luna-cardigan-seat'],
};
for (const [outfit, [model, seatCache]] of Object.entries(outfits)) {
  test(`${outfit} keeps the hips and planted feet on the sofa, and swings both feet below fixed knees on the chair`, async () => {
    const { gltf: { scene, animations } } = await load(new URL(model + '.glb', assets));
    const clip = name => animations.find(clip => clip.name === name);
    const rig = createResidentRig(scene, clip('Walk_Grounded_Loop'), outfit !== 'everyday');
    const data = readFileSync(new URL(seatCache + '.bin', assets));
    const chair = createChairAnimation(scene, clip('ChairSit_Contact'),
      readSeatContactCache(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
    const sofaClip = clip('Luna_CMU_75_20') ?? sofa;
    const applySofa = sofaPlayer(rig.mesh, sofaClip);
    const applyIdle = createSeatedIdlePlayer(rig, outfit);
    const bone = name => scene.getObjectByName('mixamorig' + name);
    const position = name => bone(name).getWorldPosition(new THREE.Vector3());
    const feet = ['LeftFoot', 'RightFoot'];
    try {
      const sample = (seat, time, release = 0) => {
        rig.applyPose(0, 0);
        chair.apply(CHAIR_SIT_SECONDS, Number(seat === 'chair'));
        if (seat === 'sofa') applySofa(sofaClip.duration);
        if (time !== undefined) applyIdle({ seat, time, weight: 1, release });
      };
      const supports = ['Hips', ...feet, 'LeftToeBase', 'RightToeBase'];
      sample('sofa');
      const sofaSupports = supports.map(position);
      const cheek = position('Head'), wrist = position('LeftHand');
      const armLength = position('LeftHand').distanceTo(position('LeftForeArm'));
      for (let i = 0; i <= 48; i++) {
        sample('sofa', i / 10);
        supports.forEach((name, index) => assert(position(name).distanceTo(sofaSupports[index]) < 1e-5, name));
        assert(Math.abs(position('LeftHand').distanceTo(position('LeftForeArm')) - armLength) < 1e-5);
        if (i === 20) {
          assert(position('Head').distanceTo(cheek) > .18);
          assert(position('LeftHand').distanceTo(position('Head')) < .14);
          if (outfit === 'cardigan') assert(position('RightHand').y < .64);
          else assert(position('RightHand').distanceTo(position('LeftForeArm')) < .10);
        }
      }
      sample('sofa', 2, 1);
      assert(position('LeftHand').distanceTo(wrist) < 1e-5, 'release returns to the seat contact pose');

      sample('chair');
      const knees = ['LeftLeg', 'RightLeg'];
      const kneePositions = knees.map(position);
      const footPositions = feet.map(position);
      const chairHips = position('Hips');
      const range = feet.map(() => ({ min: Infinity, max: -Infinity }));
      for (let i = 0; i <= 62; i++) {
        sample('chair', i / 20);
        assert(position('Hips').distanceTo(chairHips) < 1e-5);
        knees.forEach((name, j) => assert(position(name).distanceTo(kneePositions[j]) < 1e-5));
        feet.forEach((name, j) => {
          const foot = position(name);
          assert(foot.y > .25 && position(name.replace('Foot', 'ToeBase')).y > .16);
          range[j].min = Math.min(range[j].min, foot.z);
          range[j].max = Math.max(range[j].max, foot.z);
        });
      }
      assert(range.every(({ min, max }) => max - min > .12));
      sample('chair', 1.6, 1);
      feet.forEach((name, j) => assert(position(name).distanceTo(footPositions[j]) < 1e-5));
    } finally {
      chair.dispose();
      rig.dispose();
    }
  });
}

test(`everyday composes the authored overlays without altering seated contacts`, async () => {
  const { gltf: { scene, animations } } = await load(new URL('luna-walk-room.glb', assets));
  const clip = name => animations.find(clip => clip.name === name);
  const rig = createResidentRig(scene, clip('Walk_Grounded_Loop'), false);
  const data = readFileSync(new URL('luna-seat-contact.bin', assets));
  const cache = readSeatContactCache(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const chair = createChairAnimation(scene, clip('ChairSit_Contact'), cache);
  const sofaClip = clip('Luna_CMU_75_20') ?? sofa;
  const applySofa = sofaPlayer(rig.mesh, sofaClip);
  const raw = readFileSync(new URL('luna-cabin-actions-everyday.glb', assets));
  const fitted = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  const clips = Object.fromEntries(fitted.animations.map(clip => [clip.name, clip]));
  const apply = createCabinActionPlayer(rig.mesh, clips);
  const bone = name => scene.getObjectByName('mixamorig' + name);
  const supports = ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
  const matrix = name => bone(name).matrixWorld.clone();
  try {
    for (const [gesture, base] of [
      ['chairGlance', () => chair.apply(CHAIR_SIT_SECONDS, 1)],
      ['sofaDoze', () => applySofa(sofaClip.duration)],
      ['floorGlance', () => apply('floorSit', clips.floorSit.duration)],
    ]) {
      const reset = () => { rig.applyPose(0, 0); chair.apply(0, 0); base(); scene.updateMatrixWorld(true); };
      reset();
      const initial = supports.map(matrix), head = bone('Head').getWorldQuaternion(new THREE.Quaternion());
      const arms = ['LeftHand', 'RightHand'].map(matrix);
      let maxHeadTurn = 0;
      for (let i = 0; i <= 20; i++) {
        reset();
        apply(gesture, clips[gesture].duration * i / 20);
        scene.updateMatrixWorld(true);
        supports.forEach((name, index) => assert(matrix(name).equals(initial[index]), name));
        if (gesture === 'chairGlance') {
          ['LeftHand', 'RightHand'].forEach((name, index) => assert(matrix(name).equals(arms[index]), name));
        }
        maxHeadTurn = Math.max(maxHeadTurn, head.angleTo(bone('Head').getWorldQuaternion(new THREE.Quaternion())));
      }
      assert.ok(maxHeadTurn >= .10 && maxHeadTurn < .58, gesture + ' moves the head within its fitted range');
    }
  } finally { chair.dispose(); rig.dispose(); }
});
