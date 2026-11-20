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

test('a natural wake makes the retargeted four-paw walk available with a seamless loop', () => {
  const root = clone(cat.scene);
  const motion = createCatMotion(root, animations);
  const paws = ['FrontL', 'FrontR', 'HindL', 'HindR'].map(side => {
    const paw = root.getObjectByName(`Cat_${side}_Paw`);
    return { paw, point: paw.position.clone(), rest: paw.getWorldPosition(paw.position.clone()).y };
  });
  try {
    let walkReady = false;
    for (let i = 0; i < 1800 && !walkReady; i++) {
      walkReady = motion.update(1 / 60, false, false, false, () => {}).walkReady;
    }
    assert(walkReady);
    const player = motion.walk;
    assert(player);
    player.sample(0, 1);
    const first = paws.map(({ paw, point }) => paw.getWorldPosition(point.clone()));
    const maxLift = [0, 0, 0, 0];
    for (let i = 0; i <= 80; i++) {
      player.sample(i / 80, 1);
      paws.forEach(({ paw, point, rest }, index) => {
        const height = paw.getWorldPosition(point).y - rest;
        maxLift[index] = Math.max(maxLift[index], height);
        assert(height > -.007, `${paw.name} penetrates the floor at sample ${i}: ${height}`);
      });
    }
    paws.forEach(({ point }, index) => {
      assert(point.distanceTo(first[index]) < 1e-6);
      assert(maxLift[index] > .015);
    });
    player.stop();
    paws.forEach(({ paw, point, rest }) => assert(Math.abs(paw.getWorldPosition(point).y - rest) < 1e-6));
  } finally {
    motion.dispose();
  }
});

test('a cat sent to its bed stays to rest before naturally leaving again', () => {
  const { motion, pelvis, rest } = setup();
  try {
    motion.settleAtHome(7);
    advance(motion, 3.5);
    assert(pelvis.position.y < rest - .18, 'the cat lies down soon after reaching the bed');
    for (let i = 0; i < 330; i++) {
      const pose = motion.update(1 / 60, false, false, false, () => {});
      assert(!pose.walkReady, 'the cat stays during its scheduled rest');
    }
    let departed = false;
    for (let i = 0; i < 180 && !departed; i++) {
      departed = motion.update(1 / 60, false, false, false, () => {}).walkReady;
    }
    assert(departed, 'the cat leaves after its rest and get-up animation');
  } finally {
    motion.dispose();
  }
});
