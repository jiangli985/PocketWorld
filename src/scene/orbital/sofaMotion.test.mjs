import * as assetQueue from './assetQueue.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { load } from './load-for-validation.mjs';
import { FLOOR_SOFA } from './cabinLayout.ts';

function module(file, dependencies) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const context = { exports: {}, require: id => id === './assetQueue.ts' ? assetQueue : dependencies[id] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const resident = module('./residentRig.ts', { three: THREE });
const { sofaPlayer, sofaPressure } = module('./sofaMotion.ts', {
  three: THREE, './cabinLayout': { FLOOR_SOFA }, './residentRig': resident,
  'three/examples/jsm/loaders/GLTFLoader.js': { GLTFLoader },
});

test('Low Sit matches standing, plants both feet throughout descent and restores the entry on reversal', async () => {
  const dir = new URL('../../../assets/public/models/resident/', import.meta.url);
  const { gltf } = await load(new URL('luna-walk-room.glb', dir));
  const rig = resident.createResidentRig(gltf.scene, gltf.animations.find(c => c.name === 'Walk_Grounded_Loop'));
  try {
    const raw = fs.readFileSync(new URL('luna-sofa-low-sit.glb', dir));
    const { animations: [clip] } = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
    assert.equal(clip.name, 'Luna_CMU_75_20');
    const apply = sofaPlayer(rig.mesh, clip);
    const position = name => rig.mesh.getObjectByName('mixamorig' + name).getWorldPosition(new THREE.Vector3());
    rig.applyPose(0, 0);
    const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
    const planted = feet.map(position);
    const standing = position('Hips');
    const drift = new THREE.Vector3();
    for (let sample = 0; sample <= 166; sample++) {
      apply(sample / 60);
      feet.forEach((name, i) => {
        drift.copy(position(name)).sub(planted[i]);
        assert(drift.length() < .001, name + ' drift ' + drift.length());
      });
    }
    const seated = position('Hips');
    assert(seated.y < standing.y - .18 && seated.z < standing.z - .4);
    apply(clip.duration * 3);
    assert(position('Hips').distanceTo(seated) < 1e-6);
    apply(0);
    assert(position('Hips').distanceTo(standing) < 1e-6);
  } finally { rig.dispose(); }
});

test('the cushion stays unloaded during approach and follows the seated sample in either direction', () => {
  assert.equal(sofaPressure(null), 0);
  assert.equal(sofaPressure(-.6), 0);
  assert.equal(sofaPressure(1.2), 0);
  assert(sofaPressure(2.1) > sofaPressure(2.76));
  assert.equal(sofaPressure(10), 54 / 80);
  assert.equal(sofaPressure(0), 0);
});
