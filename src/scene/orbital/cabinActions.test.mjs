import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Raycaster, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CABIN_ACTIONS, advanceCabinPerformance, applyCabinPerformance, createCabinActionPlayer,
  leaveCabinPerformance, newRugPerformance, setRugPose,
} from './cabinActions.ts';
import { createIdleState, stepIdle } from './standingIdle.ts';
import { createResidentRig } from './residentRig.ts';
import { load } from './load-for-validation.mjs';

const model = name => new URL('../../../assets/public/models/resident/luna-' + name + '.glb', import.meta.url);

test('rug exit undoes a partial sit and uses the authored rise after either held pose', () => {
  const clips = { floorSit: { duration: 5 }, hugKnees: { duration: 6 }, floorStand: { duration: 5 } };
  const partial = newRugPerformance(() => .5);
  advanceCabinPerformance(partial, .9, clips);
  leaveCabinPerformance(partial);
  assert.equal(partial.phase, 'undo-sit');
  assert.equal(advanceCabinPerformance(partial, .9, clips), true);
  const rest = newRugPerformance(() => 0);
  advanceCabinPerformance(rest, 5, clips);
  assert.equal(rest.phase, 'hug');
  advanceCabinPerformance(rest, 5.8, clips);
  leaveCabinPerformance(rest);
  assert.equal(rest.phase, 'unhug');
  setRugPose(rest, true);
  advanceCabinPerformance(rest, 3, clips);
  assert.equal(rest.phase, 'rise');
  const applied = [];
  applyCabinPerformance(rest, clips, (...args) => applied.push(args));
  assert.deepEqual(applied, [['floorSit', 5], ['floorStand', 0, 0]]);
  assert.equal(advanceCabinPerformance(rest, 5, clips), true);
});

test('rug entry draws either resting pose once and respects a later manual selection', () => {
  const clips = { floorSit: { duration: 5 } };
  for (const [draw, phase] of [[0, 'hug'], [.4999, 'hug'], [.5, 'seated'], [.9999, 'seated']]) {
    let draws = 0;
    const seat = newRugPerformance(() => { draws++; return draw; });
    advanceCabinPerformance(seat, 2, clips);
    advanceCabinPerformance(seat, 3, clips);
    assert.equal(seat.phase, phase);
    setRugPose(seat, phase === 'seated');
    assert.equal(seat.phase, phase === 'seated' ? 'hug' : 'unhug');
    assert.equal(draws, 1);
  }
});

test('interrupted pickup returns to the start without visiting the completion pose', () => {
  const pickup = { kind: 'paper', time: 0, leaving: false };
  const clips = { pickUp: { duration: 4 } };
  assert.equal(advanceCabinPerformance(pickup, 2.4, clips), false);
  leaveCabinPerformance(pickup);
  assert.equal(advanceCabinPerformance(pickup, 2.4, clips), true);
  assert.equal(pickup.time, 0);
});

test('rub eye and think participate in the short idle schedule without overlapping bigger motions', () => {
  const idle = createIdleState(() => 0);
  const seen = new Set();
  for (let i = 0; i < 3600; i++) {
    stepIdle(idle, .05, true, 8, () => 0, 6, true, { rubEye: 3, think: 5 });
    assert.ok([idle.yawnTime, idle.lookTime, idle.shortTime].filter(time => time >= 0).length <= 1);
    if (idle.shortTime >= 0) seen.add(idle.shortKind);
  }
  assert.deepEqual([...seen], ['listen', 'clasp', 'rubEye', 'think']);
  stepIdle(idle, .05, false, 8, () => 0, 6);
  assert.equal(idle.elapsed, 0);
});

function checkLapCoverage(root) {
  root.updateMatrixWorld(true);
  const surfaces = [];
  root.traverse(mesh => {
    if (mesh.isSkinnedMesh) {
      mesh.skeleton.update();
      mesh.computeBoundingSphere();
      surfaces.push(mesh);
    }
  });
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0);
  for (const side of ['Left', 'Right']) {
    const point = bone => root.getObjectByName('mixamorig' + side + bone).getWorldPosition(new Vector3());
    const hip = point('UpLeg'), knee = point('Leg');
    for (const fraction of [.85, .96]) {
      const origin = hip.clone().lerp(knee, fraction);
      origin.y = 1;
      ray.set(origin, down);
      const hits = [];
      for (const mesh of surfaces) SkinnedMesh.prototype.raycast.call(mesh, ray, hits);
      hits.sort((a, b) => a.distance - b.distance);
      const joint = hit => {
        const { skinIndex, skinWeight } = hit.object.geometry.attributes;
        const vertex = hit.face.a;
        let strongest = 0;
        for (let slot = 1; slot < 4; slot++) {
          if (skinWeight.getComponent(vertex, slot) > skinWeight.getComponent(vertex, strongest)) strongest = slot;
        }
        return hit.object.skeleton.bones[skinIndex.getComponent(vertex, strongest)].name;
      };
      const cloth = hits.find(hit => joint(hit).startsWith('Dress_Front'));
      const leg = hits.find(hit => ['mixamorig' + side + 'Leg', 'mixamorig' + side + 'UpLeg'].includes(joint(hit)));
      assert.ok(cloth && leg && cloth.point.y > leg.point.y + .002, side + ' front skirt clears the bent knee at ' + fraction);
    }
  }
}

for (const [outfit, name] of [['everyday', 'walk-room'], ['snowflower', 'snowflower'], ['cloudhoodie', 'cloudhoodie']]) {
  test(`seven MotionSmith takes bind and keep ${outfit} close to the rug during floor holds`, async () => {
    const data = await readFile(model('cabin-actions-' + outfit));
    const { animations } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    assert.deepEqual(animations.map(clip => clip.name), CABIN_ACTIONS);
    const { gltf } = await load(model(name));
    const rig = createResidentRig(gltf.scene, gltf.animations.find(clip => clip.name === 'Walk_Grounded_Loop'), outfit !== 'everyday');
    try {
      const clips = Object.fromEntries(animations.map(clip => [clip.name, clip]));
      const apply = createCabinActionPlayer(rig.mesh, clips);
      const point = new Vector3();
      const boneY = name => rig.mesh.getObjectByName('mixamorig' + name).getWorldPosition(point).y;
      for (const clip of animations) {
        assert.ok(clip.duration > 2.9 && clip.duration < 6.1);
        assert.ok(clip.tracks.every(track => track.values.every(Number.isFinite)));
        rig.applyPose(0, 0);
        apply(clip.name, clip.duration * .5);
        assert.ok(Number.isFinite(boneY('Hips')));
      }
      for (const action of ['floorSit', 'hugKnees']) {
        rig.applyPose(0, 0);
        apply(action, clips[action].duration);
        assert.ok(boneY('Hips') < .23, 'seated pelvis stays close to the rug');
        assert.ok(Math.min(boneY('LeftFoot'), boneY('RightFoot')) < .16);
        if (action === 'floorSit' && outfit !== 'cloudhoodie') checkLapCoverage(rig.mesh);
      }
      rig.applyPose(0, 0);
      apply('floorStand', clips.floorStand.duration);
      assert.ok(boneY('Hips') > .65);
      rig.applyPose(0, 0);
      apply('pickUp', 1.90);
      assert.ok(boneY('RightHand') < .25);
    } finally { rig.dispose(); }
  });
}
