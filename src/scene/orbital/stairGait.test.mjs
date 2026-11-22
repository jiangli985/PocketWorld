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
      if (i === 0 || i === 18 * 24) assert.equal(pose.weight, 0);
    }
    assert.deepEqual([...contacts].sort((a, b) => a - b), Array.from({ length: 19 }, (_, i) => i));
    assert.equal(supportSides.size, 2);
  }
  assert.notEqual(sampleStairGait(5.4, true).lean, sampleStairGait(12.6, false).lean);
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
        for (let i = 0; i <= 18 * 24; i++) {
          const travel = i / 24;
          const progress = ascending ? travel : CABIN_STAIRS.steps - travel;
          const gait = sampleStairGait(progress, ascending);
          if (gait.weight < 1) continue;
          rig.mesh.position.set(CABIN_STAIRS.x, progress * STAIR_RISE, CABIN_STAIRS.lowerZ - progress * STAIR_TREAD_RUN);
          rig.applyPose((i * .013) % 1, 1);
          rig.applyStairPose(gait, CABIN_STAIRS.x, stairTreadSurface);
          rig.mesh.updateMatrixWorld(true);
          for (const [side, vertices] of soles.entries()) {
            const foot = gait.feet[side];
            let gap = Infinity;
            for (const { mesh, vertex } of vertices) {
              mesh.getVertexPosition(vertex, position).applyMatrix4(mesh.matrixWorld);
              gap = Math.min(gap, position.y - foot.y);
              assert(position.y >= stairTreadSurface(position.z) - .003,
                `${sides[side]} sole intersected a riser at ${progress.toFixed(3)} while walking ${ascending ? 'up' : 'down'}`);
            }
            if (!foot.swing) assert(gap >= -.002 && gap < .005, `supporting sole is ${gap} m from the tread`);
          }
        }
      }
    } finally { rig.dispose(); }
  });
}
