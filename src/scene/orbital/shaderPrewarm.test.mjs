import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWarmupPlan, createWarmupRunner } from './shaderPrewarm.ts';

test('createWarmupPlan deduplicates shared textures and materials into bounded batches', () => {
  const root = new THREE.Group();
  const texA = new THREE.Texture();
  const texB = new THREE.Texture();
  const matA = new THREE.MeshStandardMaterial({ map: texA, roughnessMap: texB });
  const matB = new THREE.MeshStandardMaterial({ map: texA });
  const matC = new THREE.MeshStandardMaterial();
  const matD = new THREE.MeshStandardMaterial();

  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(), matA),
    new THREE.Mesh(new THREE.BoxGeometry(), matA),
    new THREE.Mesh(new THREE.BoxGeometry(), matB),
    new THREE.Mesh(new THREE.BoxGeometry(), matC),
    new THREE.Mesh(new THREE.BoxGeometry(), matD),
  );

  const plan = createWarmupPlan(root, 2);
  assert.equal(plan.textures.length, 2);
  assert.deepEqual(plan.batches.map(b => b.length), [2, 2]);
  assert.equal(plan.batches[0][0].receiveShadow, true);
});

test('createWarmupRunner uploads textures before compiling shader batches incrementally', () => {
  const root = new THREE.Group();
  const tex1 = new THREE.Texture();
  const tex2 = new THREE.Texture();
  const tex3 = new THREE.Texture();
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex1 })),
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex2 })),
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex3 })),
  );

  const plan = createWarmupPlan(root, 2);
  const runner = createWarmupRunner(plan, { texturesPerFrame: 2 });
  const initCalls = [];
  const compileBatchSizes = [];
  const gl = {
    initTexture: t => { initCalls.push(t); },
    compile: group => { compileBatchSizes.push(group.children.length); },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  assert.equal(runner.done, false);
  assert.equal(runner.step(gl, scene, camera), false);
  assert.equal(initCalls.length, 2);
  assert.equal(compileBatchSizes.length, 0);

  assert.equal(runner.step(gl, scene, camera), false);
  assert.equal(initCalls.length, 3);
  assert.equal(compileBatchSizes.length, 0);

  assert.equal(runner.step(gl, scene, camera), false);
  assert.deepEqual(compileBatchSizes, [2]);

  assert.equal(runner.step(gl, scene, camera), true);
  assert.deepEqual(compileBatchSizes, [2, 1]);
  assert.equal(runner.done, true);
});
