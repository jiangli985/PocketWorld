import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { load } from '../load-for-validation.mjs';
import { createCatMotion } from './catMotion.ts';

const path = new URL('../../../../assets/public/models/cat/', import.meta.url);
const { gltf: cat } = await load(new URL('cat.glb', path));
const raw = await readFile(new URL('tuanzi-motion.glb', path));
const { animations } = await new GLTFLoader().parseAsync(Uint8Array.from(raw).buffer, '');

function setup() {
  const root = clone(cat.scene);
  const pelvis = root.getObjectByName('Cat_Pelvis');
  const rest = pelvis.position.y;
  const motion = createCatMotion(root, animations);
  assert(motion);
  return { motion, pelvis, rest };
}

function advance(motion, seconds, petActive = false) {
  for (let i = 0; i < seconds * 60; i++) {
    motion.update(1 / 60, false, petActive, false, () => {});
  }
}

test('the separate clips animate the cat skin and petting can wake it during a nap', () => {
  const { motion, pelvis, rest } = setup();
  try {
    advance(motion, 4.6);
    assert(pelvis.position.y > rest + .006, 'stretch raises the hips');
    advance(motion, 10.4);
    assert(pelvis.position.y < rest - .18, 'nap lowers the hips');
    motion.update(1 / 60, true, true, false, () => {});
    advance(motion, 2, true);
    assert.equal(pelvis.position.y, rest);
  } finally {
    motion.dispose();
  }
});

test('petting reverses a partial lie-down, and reduced motion restores the neutral pose', () => {
  const { motion, pelvis, rest } = setup();
  try {
    advance(motion, 12.8);
    assert(pelvis.position.y > rest - .18 && pelvis.position.y < rest - .05);
    const during = pelvis.position.y;
    motion.update(1 / 60, true, true, false, () => {});
    assert(pelvis.position.y > during && pelvis.position.y < rest);
    advance(motion, 1.5, true);
    assert.equal(pelvis.position.y, rest);
    advance(motion, 8);
    assert(pelvis.position.y < rest - .18);
    motion.update(1 / 60, false, false, true, () => {});
    assert.equal(pelvis.position.y, rest);
  } finally {
    motion.dispose();
  }
});
