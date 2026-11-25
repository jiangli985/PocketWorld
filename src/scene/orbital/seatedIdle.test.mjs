import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { load } from './load-for-validation.mjs';

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

const { createSeatedIdle, stepSeatedIdle, createSeatedIdlePlayer } = local('./seatedIdle');
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

const assets = new URL('../../../assets/public/models/resident/', import.meta.url);
const raw = readFileSync(new URL('luna-sofa-low-sit.glb', assets));
const { animations: [sofa] } = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
const outfits = {
  everyday: ['luna-walk-room', 'luna-seat-contact'],
  snowflower: ['luna-snowflower', 'luna-snowflower-seat'],
  cloudhoodie: ['luna-cloudhoodie', 'luna-cloudhoodie-seat'],
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
          if (outfit === 'cloudhoodie') assert(position('RightHand').y < .64);
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
