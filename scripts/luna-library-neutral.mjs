// Export the exact runtime standing pose for Blender's entry and release frames.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { load } from '../src/scene/orbital/load-for-validation.mjs';

const source = fs.readFileSync(new URL('../src/scene/orbital/residentRig.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
vm.runInNewContext(outputText, { exports, require: () => THREE });
const path = new URL('../assets/public/models/resident/luna-walk-room.glb', import.meta.url);
const { gltf } = await load(path);
const rig = exports.createResidentRig(gltf.scene, gltf.animations.find(clip => clip.name === 'Walk_Grounded_Loop'));
rig.applyPose(0, 0);
gltf.scene.updateMatrixWorld(true);
const pose = {};
gltf.scene.traverse(joint => {
  if (joint.isBone) pose[joint.name] = joint.matrixWorld.toArray();
});
process.stdout.write(JSON.stringify(pose));
