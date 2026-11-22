import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CABIN_STAIRS, STAIR_RISE, STAIR_TREAD_RUN } from './cabinStairs.ts';
import { createResidentRig } from './residentRig.ts';
import { sampleStairGait, stairFootfall, stairTreadSurface } from './stairGait.ts';
import { load } from './load-for-validation.mjs';

const sides = ['Right', 'Left'];

test('the two stair gaits alternate support and place a contact on all 18 treads', () => {
  for (const ascending of [true, false]) {
    const contacts = new Set();
    const supportSides = new Set();
    for (let i = 0; i <= 18 * 24; i++) {
      const travel = i / 24;
      const progress = ascending ? travel : CABIN_STAIRS.steps - travel;
      const pose = sampleStairGait(progress, ascending);
      assert.equal(pose.footfall, stairFootfall(progress, ascending));
      const support = pose.feet.findIndex(foot => !foot.swing);
      assert.notEqual(support, -1);
      assert.equal(pose.feet.filter(foot => foot.swing).length, 1);
      assert.ok(Math.abs(stairTreadSurface(pose.feet[support].z) - pose.feet[support].y) < 1e-10);
      const tread = Math.round(pose.feet[support].y / STAIR_RISE);
      contacts.add(tread);
      supportSides.add(support);
      if (i === 0 || i === 18 * 24) assert.equal(pose.weight, 1);
    }
    assert.deepEqual([...contacts].sort((a, b) => a - b), Array.from({ length: 19 }, (_, i) => i));
    assert.equal(supportSides.size, 2);
  }
  assert.notEqual(sampleStairGait(5.4, true).lean, sampleStairGait(12.6, false).lean);
});

// Independent same-side knee measurements (degrees) from the two 30 Hz Manny GLBs.
test('the baked gait preserves the right and left knee curves of each MotionSmith Take 1', () => {
  for (const [ascending, travel, reference] of [
    [true, 8 + 8 / 16 - .78, [91.1, 18.9]],   // ascent frame 56
    [true, 9 + 8 / 16 - .78, [27.8, 91.7]],   // ascent frame 72
    [false, (9 + 8 / 19 + .18) / (1 + .4 / 18), [83.7, 14.9]],  // descent frame 62
    [false, (10 + 8 / 19 + .18) / (1 + .4 / 18), [12.8, 83.0]], // descent frame 81
  ]) {
    const gait = sampleStairGait(ascending ? travel : CABIN_STAIRS.steps - travel, ascending);
    gait.legs.forEach((leg, side) => assert(Math.abs(leg.flexion * 180 / Math.PI - reference[side]) < .1));
  }
});

test('both elbows and wrists articulate as the hands exchange leading sides', async () => {
  const { gltf } = await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));
  const asset = clone(gltf.scene);
  const rig = createResidentRig(asset, gltf.animations.find(clip => clip.name === 'Walk_Grounded_Loop'));
  try {
    for (const ascending of [true, false]) {
      rig.mesh.rotation.y = ascending ? Math.PI : 0;
      const angles = sides.map(() => [[], []]), leads = [];
      for (let i = 0; i <= 48; i++) {
        const progress = 6 + i / 24, gait = sampleStairGait(progress, ascending);
        rig.mesh.position.set(CABIN_STAIRS.x, progress * STAIR_RISE, CABIN_STAIRS.lowerZ - progress * STAIR_TREAD_RUN);
        rig.applyPose(gait.phase, 0);
        rig.applyStairPose(gait, CABIN_STAIRS.x, stairTreadSurface);
        const hands = sides.map((side, index) => {
          const [elbow, wrist] = ['ForeArm', 'Hand'].map(name => asset.getObjectByName('mixamorig' + side + name));
          for (const [jointIndex, joint] of [elbow, wrist].entries()) angles[index][jointIndex].push(joint.quaternion.clone());
          return wrist.getWorldPosition(new Vector3()).z;
        });
        leads.push(hands[0] - hands[1]);
      }
      assert.ok(Math.min(...leads) < -.10 && Math.max(...leads) > .10);
      for (const arm of angles) for (const samples of arm)
        assert.ok(samples.some(rotation => rotation.angleTo(samples[0]) > .045), 'the elbow and wrist must articulate locally');
    }
  } finally { rig.dispose(); }
});

function soleVertices(asset) {
  const position = new Vector3();
  const vertices = [[], []];
  asset.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const { skinIndex, skinWeight } = mesh.geometry.attributes;
    for (const [side, name] of sides.entries()) {
      const joints = ['Foot', 'ToeBase'].map(bone => mesh.skeleton.bones.findIndex(joint => joint.name === 'mixamorig' + name + bone));
      for (let vertex = 0; vertex < skinIndex.count; vertex++) {
        let weight = 0;
        for (let channel = 0; channel < 4; channel++) {
          if (joints.includes(skinIndex.getComponent(vertex, channel))) weight += skinWeight.getComponent(vertex, channel);
        }
        if (weight < .5) continue;
        mesh.getVertexPosition(vertex, position).applyMatrix4(mesh.matrixWorld);
        if (position.y < .026) vertices[side].push({ mesh, vertex });
      }
    }
  });
  return vertices;
}

for (const file of ['luna-walk-room.glb', 'luna-snowflower.glb', 'luna-cloudhoodie.glb']) {
  test(`${file} keeps the supporting sole on the tread during both gaits`, async () => {
    const { gltf } = await load(new URL(`../../../assets/public/models/resident/${file}`, import.meta.url));
    const asset = clone(gltf.scene);
    const rig = createResidentRig(asset, gltf.animations.find(clip => clip.name === 'Walk_Grounded_Loop'), file !== 'luna-walk-room.glb');
    try {
      rig.applyPose(0, 0);
      rig.mesh.updateMatrixWorld(true);
      const soles = soleVertices(asset);
      assert(soles.every(vertices => vertices.length > 100));
      const position = new Vector3();
      for (const ascending of [true, false]) {
        rig.mesh.rotation.y = ascending ? Math.PI : 0;
        const kneeError = [0, 0], sampleCount = [0, 0];
        let maxSwing = 0;
        for (let i = -30; i <= 18 * 24 + 30; i++) {
          const travel = i / 24;
          const progress = ascending ? travel : CABIN_STAIRS.steps - travel;
          const gait = sampleStairGait(progress, ascending);

          rig.mesh.position.set(CABIN_STAIRS.x, Math.max(0, Math.min(progress, 18)) * STAIR_RISE, CABIN_STAIRS.lowerZ - progress * STAIR_TREAD_RUN);
          rig.applyPose(gait.phase, 1 - gait.weight);
          rig.applyStairPose(gait, CABIN_STAIRS.x, stairTreadSurface);
          rig.mesh.updateMatrixWorld(true);
          for (const [side, vertices] of soles.entries()) {
            const foot = gait.feet[side];
            if (travel >= 7 && travel < 9) {
              const [hip, knee, ankle] = ['UpLeg', 'Leg', 'Foot'].map(name =>
                asset.getObjectByName('mixamorig' + sides[side] + name).getWorldPosition(new Vector3()));
              const angle = knee.clone().sub(hip).angleTo(ankle.sub(knee));
              const role = foot.swing ? 1 : 0;
              kneeError[role] += Math.abs(angle - gait.legs[side].flexion) * 180 / Math.PI;
              sampleCount[role]++;
              if (foot.swing) maxSwing = Math.max(maxSwing, angle * 180 / Math.PI);
            }
            let gap = Infinity;
            for (const { mesh, vertex } of vertices) {
              mesh.getVertexPosition(vertex, position).applyMatrix4(mesh.matrixWorld);
              gap = Math.min(gap, position.y - foot.y);
              assert(position.y >= stairTreadSurface(position.z) - .003,
                `${sides[side]} sole intersected a riser at ${progress.toFixed(3)} while walking ${ascending ? 'up' : 'down'}`);
            }
            if (!foot.swing && gait.weight === 1) assert(gap >= -.002 && gap < .005, `supporting sole is ${gap} m from the tread`);
          }
        }
        assert(kneeError[0] / sampleCount[0] < 7, 'support knee must follow the recorded bend through weight transfer');
        assert(kneeError[1] / sampleCount[1] < 9, 'swing knee must track the reference through the step');
        if (!ascending) assert(maxSwing < 99, 'the descending heel must not kick back into the skirt');
      }
    } finally { rig.dispose(); }
  });
}
