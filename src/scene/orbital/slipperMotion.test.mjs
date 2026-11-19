import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlipperPair, stepSlippers } from './slipperMotion.ts';

const bounds = { left: -6, right: 4, back: -3, front: 3 };
const still = { x: -3, z: 0, vx: 0, vz: 0, active: true };

test('a walking foot kicks the slipper away and drag settles it', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  for (let i = 0; i < 6; i++) stepSlippers([slipper], 1 / 60, { x: -0.3, z: 0, vx: 1.6, vz: 0, active: true }, [], bounds);
  assert.ok(slipper.vx > 0.5, `kick velocity ${slipper.vx}`);
  assert.ok(slipper.x > 0, 'slipper is pushed out of the body');
  for (let i = 0; i < 600; i++) stepSlippers([slipper], 1 / 60, still, [], bounds);
  assert.equal(slipper.vx, 0);
  assert.equal(slipper.vz, 0);
  assert.equal(slipper.spin, 0);
});

test('a slipper stays on the floor and cannot slide into furniture', () => {
  const [slipper] = createSlipperPair([[3.7, 0]], [0.12]);
  slipper.vx = 2.4;
  for (let i = 0; i < 120; i++) stepSlippers([slipper], 1 / 60, still, [], bounds);
  assert.ok(slipper.x <= bounds.right, `wall keeps the slipper inside: ${slipper.x}`);

  const [blocked] = createSlipperPair([[-1.2, 0]], [0.12]);
  blocked.vx = 2;
  for (let i = 0; i < 120; i++) stepSlippers([blocked], 1 / 60, still, [[-1, 1, -1, 1]], bounds);
  assert.ok(blocked.x <= -1, `furniture keeps the slipper outside: ${blocked.x}`);
});

test('reduced motion kicks without spinning the slipper', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  for (let i = 0; i < 8; i++) stepSlippers([slipper], 1 / 60, { x: -0.28, z: 0.04, vx: 1.5, vz: 0.4, active: true }, [], bounds, true);
  assert.ok(slipper.vx > 0.4);
  assert.equal(slipper.spin, 0);
  assert.equal(slipper.yaw, 0);
});

test('idle or seated residents do not move the slippers', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  for (let i = 0; i < 120; i++) stepSlippers([slipper], 1 / 60, { x: -0.2, z: 0, vx: 1.5, vz: 0, active: false }, [], bounds);
  assert.equal(slipper.x, 0);
  assert.equal(slipper.vx, 0);
});
