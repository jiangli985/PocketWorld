import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { load } from './load-for-validation.mjs';

const source = readFileSync(new URL('./residentRig.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {}, require: () => THREE };
vm.runInNewContext(compiled, module);
const { createResidentRig, RESIDENT_SCALE } = module.exports;
const { gltf, mesh: reference, sample } = await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));

function instance() {
  const asset = clone(gltf.scene);
  const rig = createResidentRig(asset, gltf.animations[0]);
  const mesh = asset.getObjectByProperty('isSkinnedMesh', true);
  return { asset, rig, mesh };
}

test('the neutral stance puts both soles on the floor with separate foot positions', () => {
  const { asset, rig, mesh } = instance();
  try {
    rig.applyPose(0, 0);
    rig.mesh.updateMatrixWorld(true);
    const left = asset.getObjectByName('mixamorigLeftFoot').getWorldPosition(new THREE.Vector3());
    const right = asset.getObjectByName('mixamorigRightFoot').getWorldPosition(new THREE.Vector3());
    assert(left.x - right.x > .10);
    const min = { Left: Infinity, Right: Infinity };
    const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const point = new THREE.Vector3();
    for (let i = 0; i < indices.count; i++) for (let n = 0; n < 4; n++) {
      if (weights.array[i * 4 + n] < .4) continue;
      const name = mesh.skeleton.bones[indices.array[i * 4 + n]].name;
      const side = /^mixamorig(Left|Right)(?:Foot|Toe)/.exec(name)?.[1];
      if (side) {
        mesh.getVertexPosition(i, point);
        min[side] = Math.min(min[side], mesh.localToWorld(point).y);
      }
    }
    for (const [side, y] of Object.entries(min)) assert(y >= -.002 && y < .005, `${side} sole at ${y}`);
  } finally { rig.dispose(); }
});

test('room uses the authored walk at full weight and does not share bone poses between rooms', () => {
  const a = instance(), b = instance();
  const otherHips = b.asset.getObjectByName('mixamorigHips').matrix.clone();
  try {
    for (const time of [0, .137, .489, .748, .999]) {
      a.rig.applyPose(time, 1);
      a.rig.mesh.updateMatrixWorld(true);
      sample(time);
      for (let i = 0; i < reference.skeleton.bones.length; i++) {
        const expected = reference.skeleton.bones[i], actual = a.mesh.skeleton.bones[i];
        assert(actual.position.distanceTo(expected.position) < 1e-7, expected.name);
        assert(actual.quaternion.angleTo(expected.quaternion) < 0.001, expected.name);
      }
      assert(b.asset.getObjectByName('mixamorigHips').matrix.equals(otherHips));
    }
  } finally { a.rig.dispose(); b.rig.dispose(); }
});

test('interaction controls follow the skinned joints in room units and restore the walk', () => {
  const { asset, rig } = instance();
  try {
    rig.mesh.position.set(.4, .2, 1);
    rig.mesh.rotation.y = .86;
    rig.legs[0].thigh.rotation.x = -1.3;
    rig.legs[0].shin.rotation.x = 1.4;
    rig.arms[1].upper.rotation.set(-.55, .28, -.35);
    rig.arms[1].forearm.rotation.x = -.6;
    rig.applyPose(.4, 0);
    assert.equal(asset.scale.x, RESIDENT_SCALE);
    for (const [control, name] of [[rig.legs[0].foot, 'RightFoot'], [rig.arms[1].hand, 'LeftHand']]) {
      const actual = asset.getObjectByName('mixamorig' + name);
      assert(control.getWorldPosition(new THREE.Vector3()).distanceTo(actual.getWorldPosition(new THREE.Vector3())) < 1e-5, name);
    }
    const pose = asset.getObjectByName('mixamorigLeftArm').quaternion.clone();
    rig.applyPose(.4, 1);
    assert(pose.angleTo(asset.getObjectByName('mixamorigLeftArm').quaternion) > .1);
  } finally { rig.dispose(); }
});

test('hair and skirt follow movement without shifting body bones and settle after stopping', () => {
  const { asset, rig, mesh } = instance();
  const bones = mesh.skeleton.bones;
  const base = bones.map(() => new THREE.Quaternion());
  const dt = 1 / 60;
  const speed = .576 * RESIDENT_SCALE;
  function pose(phase, yaw, walkWeight, dx, dz, enabled = true) {
    rig.applyPose(phase, walkWeight);
    bones.forEach((bone, i) => base[i].copy(bone.quaternion));
    rig.followMotion(dt, enabled, yaw, dx, dz, phase);
    const angles = { Hair_: 0, Dress_: 0 };
    bones.forEach((bone, i) => {
      const part = Object.keys(angles).find(prefix => bone.name.startsWith(prefix));
      const angle = bone.quaternion.clone().normalize().angleTo(base[i].normalize());
      if (part) angles[part] = Math.max(angles[part], angle);
      else assert(bone.quaternion.clone().normalize().equals(base[i]), bone.name);
    });
    return angles;
  }
  try {
    let angles;
    for (let i = 0; i < 40; i++) {
      const yaw = Math.min(i, 25) * .035;
      angles = pose(i * dt, yaw, 1, Math.sin(yaw) * speed * dt, Math.cos(yaw) * speed * dt);
    }
    assert(angles.Hair_ > .02 && angles.Dress_ > .012);
    angles = pose(.65, .875, 0, 0, 0);
    assert(angles.Hair_ > .01 && angles.Dress_ > .01, 'stop retains momentum');
    for (let i = 0; i < 90; i++) angles = pose(.65, .875, 0, 0, 0);
    assert(angles.Hair_ < .00001 && angles.Dress_ < .00001, 'settles on the authored pose');

    // Rotate the real head in place as the standing idle layer does.
    const head = asset.getObjectByName('mixamorigHead');
    let maxHair = 0;
    for (let i = 0; i < 25; i++) {
      rig.applyPose(0, 0);
      const hair = asset.getObjectByName('Hair_Back_C_02');
      const rest = hair.quaternion.clone();
      head.rotateY(i * .02);
      rig.followMotion(dt, true, .875, 0, 0, 0);
      maxHair = Math.max(maxHair, hair.quaternion.clone().normalize().angleTo(rest.normalize()));
    }
    assert(maxHair > .01, 'hair follows a turn of the head while standing');
    angles = pose(.65, .875, 0, 0, 0, false);
    assert(angles.Hair_ < .00001 && angles.Dress_ < .00001, 'contact and reduced motion use the base pose');
  } finally { rig.dispose(); }
});
