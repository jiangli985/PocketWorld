import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import * as cutaway from './cabinCutaway.ts';
const { cabinDeckOpacity, quickCabinFrame } = cutaway;

test('single-floor framing hides the other room while overview shows both', () => {
  assert.deepEqual(cabinDeckOpacity('overview'), { lower: 1, upper: 1 });
  assert.deepEqual(cabinDeckOpacity('lower'), { lower: 1, upper: 0 });
  assert.deepEqual(cabinDeckOpacity('upper'), { lower: 0, upper: 1 });
});

test('a fading room preserves shared materials and restores the original mesh and shadows', () => {
  const room = new Group();
  const shared = new MeshStandardMaterial({ opacity: .8, transparent: true });
  const inner = new Mesh(undefined, shared);
  const outer = new Mesh(undefined, shared);
  inner.castShadow = true;
  room.add(inner);
  const fade = cutaway.createCabinGroupFade();
  fade.set(room, .25);
  assert.ok(room.visible);
  assert.equal(inner.material.opacity, .2);
  assert.equal(outer.material.opacity, .8);
  assert.equal(inner.castShadow, false);
  fade.set(room, 0);
  assert.equal(room.visible, false);
  assert.equal(inner.material, shared);
  fade.set(room, 1);
  assert.ok(room.visible);
  assert.equal(inner.material, shared);
  assert.equal(inner.castShadow, true);
});

test('walking opens the next room early and fades the old room toward the landing', () => {
  for (const [from, to] of [['lower', 'upper'], ['upper', 'lower']]) {
    const sample = progress => cabinDeckOpacity(from, from === 'lower' ? progress : 1 - progress, from);
    assert.deepEqual(sample(0), cabinDeckOpacity(from));
    assert.ok(sample(.12)[to] > 0 && sample(.12)[to] < 1);
    assert.deepEqual(sample(.5), { lower: 1, upper: 1 });
    assert.ok(sample(.89)[from] > 0 && sample(.89)[from] < 1);
    assert.deepEqual(sample(1), cabinDeckOpacity(to));
  }
  assert.deepEqual(cabinDeckOpacity('overview', 0, 'lower'), { lower: 1, upper: 1 });
});

test('quick travel conceals Luna and the old room at relocation on either deck', () => {
  for (const [from, to] of [['lower', 'upper'], ['upper', 'lower']]) {
    const initial = cabinDeckOpacity(from);
    const start = quickCabinFrame(0, initial, to);
    const moving = quickCabinFrame(.30, initial, to);
    const relocation = quickCabinFrame(.50, initial, to);
    const end = quickCabinFrame(1, initial, to);
    assert.deepEqual(start, { ...initial, resident: 1, relocate: false });
    assert.ok(moving[from] > 0 && moving[from] < 1);
    assert.ok(moving[to] > 0 && moving[to] < 1);
    assert.equal(relocation.relocate, true);
    assert.equal(relocation.resident, 0);
    assert.equal(relocation[from], 0);
    assert.deepEqual(end, { ...cabinDeckOpacity(to), resident: 1, relocate: true });
  }
});
