import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { load } from './load-for-validation.mjs';

const { gltf, mesh, update, rest } = await load(new URL('../../../assets/public/models/cat/cat.glb', import.meta.url));
update();
const points = mesh.geometry.attributes.position;
const paw = ['FrontL', 'FrontR', 'HindL', 'HindR'];
const sole = paw.map(() => []);
const face = [], tip = [];
const point = new Vector3();
for (let i = 0; i < points.count; i++) {
  const { x, y, z } = point.fromBufferAttribute(points, i);
  if (y < .01) {
    // Four geometric regions, independent of what the exported skin claims should move.
    const index = z > 0 ? (x > -.07 ? 0 : 1) : (x > -.017 ? 2 : 3);
    sole[index].push(i);
  }
  if (z > .34 && y > .54) face.push(i);
  if (z < -.49 && y > .55) tip.push(i);
}
const capture = vertices => vertices.map(i => mesh.getVertexPosition(i, new Vector3()));
const averageMovement = (vertices, before) => vertices.reduce((sum, i, j) =>
  sum + mesh.getVertexPosition(i, point).distanceTo(before[j]), 0) / vertices.length;
const joint = name => gltf.scene.getObjectByName(name);
const rotateYaw = (bone, angle) => {
  const parentInverse = bone.parent.getWorldQuaternion(new Quaternion()).invert();
  const up = new Vector3(0, 1, 0).applyQuaternion(parentInverse);
  bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(up, angle));
  update();
};

test('each cartoon cat sole rests on the pad and is skinned to its own limb', () => {
  const original = sole.map(capture);
  assert(sole.every(vertices => vertices.length > 50));
  for (const [target, label] of paw.entries()) {
    try {
      assert(Math.abs(Math.min(...original[target].map(p => p.y))) < .002);
      // Move a whole upper limb along the model's Y axis; all bones in that limb inherit its lift.
      const bone = joint(`Cat_${label}_Upper`);
      const axis = new Vector3(0, 1, 0).applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
      bone.position.addScaledVector(axis, .06);
      update();
      sole.forEach((region, other) => {
        const displacement = averageMovement(region, original[other]);
        assert(other === target ? displacement > .055 : displacement < .001, `${label} → ${paw[other]}: ${displacement}`);
      });
    } finally {
      rest();
    }
  }
});

test('head turn and base-to-tip tail yaw deform their own regions without shifting the four paws', () => {
  const tail = ['Base', 'Mid', 'Upper', 'Tip'].map(segment => joint(`Cat_Tail${segment}`));
  assert(tail.every((bone, i) => bone.isBone && (!i || bone.parent === tail[i - 1])));
  assert(face.length > 50 && tip.length > 50);
  const faceRest = capture(face), tailRest = capture(tip), soles = sole.flat(), solesRest = capture(soles);
  try {
    rotateYaw(joint('Cat_Head'), .27);
    assert(averageMovement(face, faceRest) > .03);
    assert(averageMovement(tip, tailRest) < .001);
    assert(averageMovement(soles, solesRest) < .001);
    rest();
    rotateYaw(tail[0], .28);
    assert(averageMovement(tip, tailRest) > .07);
    assert(averageMovement(face, faceRest) < .001);
    assert(averageMovement(soles, solesRest) < .001);
  } finally {
    rest();
  }
});
