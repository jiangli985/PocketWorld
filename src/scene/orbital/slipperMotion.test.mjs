import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSlipperPair,
  SLIPPER_FLIP_APPROACH,
  slipperFloorY,
  slipperSupportHeight,
  stepSlippers,
} from './slipperMotion.ts';

const bounds = { left: -6, right: 4, back: -3, front: 3 };
const still = { x: -3, z: 0, vx: 0, vz: 0, active: true };

test('a walking foot kicks the slipper away and drag settles it', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  for (let i = 0; i < 6; i++) stepSlippers([slipper], 1 / 60, { x: -0.3, z: 0, vx: 1.6, vz: 0, active: true }, [], bounds, false, () => 0.9);
  assert.ok(slipper.vx > 0.5, `kick velocity ${slipper.vx}`);
  assert.ok(slipper.x > 0, 'slipper is pushed out of the body');
  for (let i = 0; i < 600; i++) stepSlippers([slipper], 1 / 60, still, [], bounds, false, () => 0.9);
  assert.equal(slipper.vx, 0);
  assert.equal(slipper.vz, 0);
  assert.equal(slipper.spin, 0);
  assert.equal(slipper.y, 0);
  assert.equal(slipper.vy, 0);
  assert.equal(slipper.rollVel, 0);
});

test('a gentle nudge slides without flipping the slipper upside down', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  const gentle = SLIPPER_FLIP_APPROACH - 0.12;
  for (let i = 0; i < 8; i++) stepSlippers([slipper], 1 / 60, { x: -0.31, z: 0, vx: gentle, vz: 0, active: true }, [], bounds, false, () => 0.01);
  for (let i = 0; i < 360; i++) stepSlippers([slipper], 1 / 60, still, [], bounds, false, () => 0.01);
  assert.ok(slipper.x > 0.1);
  assert.equal(slipper.flipped, false);
  assert.equal(slipper.roll, 0);
  assert.equal(slipper.y, 0);
});

test('a hard kick can hop and flip the slipper upside down, and another hard kick can flip it back', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  let maxY = 0;
  for (let i = 0; i < 6; i++) {
    stepSlippers([slipper], 1 / 60, { x: -0.31 + i * 0.82 / 60, z: 0, vx: 0.82, vz: 0, active: true }, [], bounds, false, () => 0.15);
    maxY = Math.max(maxY, slipper.y);
  }
  for (let i = 0; i < 360; i++) {
    stepSlippers([slipper], 1 / 60, still, [], bounds, false, () => 0.15);
    maxY = Math.max(maxY, slipper.y);
  }
  assert.ok(maxY > 0.05, `expected airborne hop > 5cm, got ${maxY}`);
  assert.equal(slipper.flipped, true, 'strong kick should flip slipper upside down');
  assert.ok(Math.abs(Math.abs(slipper.roll) - Math.PI) < 1e-4, `settled upside-down roll=${slipper.roll}`);
  assert.equal(slipper.y, 0);
  assert.equal(slipper.rollVel, 0);

  // Kicking the upside-down slipper briskly again flips it back right-side up.
  const startX = slipper.x;
  for (let i = 0; i < 6; i++) {
    stepSlippers([slipper], 1 / 60, { x: startX - 0.31 + i * 0.82 / 60, z: slipper.z, vx: 0.82, vz: 0, active: true }, [], bounds, false, () => 0.15);
  }
  for (let i = 0; i < 360; i++) stepSlippers([slipper], 1 / 60, still, [], bounds, false, () => 0.15);
  assert.equal(slipper.flipped, false, 'second strong kick should flip slipper back upright');
  assert.ok(Math.abs(slipper.roll) < 1e-4, `settled upright roll=${slipper.roll}`);
});

test('a hard kick does not always flip: a high random draw wobbles and lands back upright', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  let maxRoll = 0;
  for (let i = 0; i < 6; i++) {
    stepSlippers([slipper], 1 / 60, { x: -0.31 + i * 0.82 / 60, z: 0, vx: 0.82, vz: 0, active: true }, [], bounds, false, () => 0.95);
    maxRoll = Math.max(maxRoll, Math.abs(slipper.roll));
  }
  for (let i = 0; i < 360; i++) {
    stepSlippers([slipper], 1 / 60, still, [], bounds, false, () => 0.95);
    maxRoll = Math.max(maxRoll, Math.abs(slipper.roll));
  }
  assert.ok(maxRoll > 0.15, `expected visible wobble during non-flip hard kick, got ${maxRoll}`);
  assert.equal(slipper.flipped, false);
  assert.equal(slipper.roll, 0);
});

test('a slipper stays on the floor and cannot slide into furniture', () => {
  const [slipper] = createSlipperPair([[3.7, 0]], [0.12]);
  slipper.vx = 2.4;
  for (let i = 0; i < 120; i++) stepSlippers([slipper], 1 / 60, still, [], bounds, false, () => 0.9);
  assert.ok(slipper.x <= bounds.right, `wall keeps the slipper inside: ${slipper.x}`);

  const [blocked] = createSlipperPair([[-1.2, 0]], [0.12]);
  blocked.vx = 2;
  for (let i = 0; i < 120; i++) stepSlippers([blocked], 1 / 60, still, [[-1, 1, -1, 1]], bounds, false, () => 0.9);
  assert.ok(blocked.x <= -1, `furniture keeps the slipper outside: ${blocked.x}`);
});

test('support height and floor elevation keep upright, sideways and upside-down slippers grounded', () => {
  const h = 0.056, w = 0.08, l = 0.17;
  assert.ok(Math.abs(slipperSupportHeight(0, 0, h, w, l) - h) < 1e-6);
  assert.ok(Math.abs(slipperSupportHeight(Math.PI, 0, h, w, l) - h) < 1e-6);
  assert.ok(Math.abs(slipperSupportHeight(Math.PI / 2, 0, h, w, l) - w) < 1e-6);
  assert.equal(slipperFloorY(-4.05, 0.11, 0.0134), 0.0134);
  assert.equal(slipperFloorY(0, 0, 0.0134), 0.001);
});

test('reduced motion kicks without spinning, hopping or flipping the slipper', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  for (let i = 0; i < 8; i++) stepSlippers([slipper], 1 / 60, { x: -0.28, z: 0.04, vx: 1.5, vz: 0.4, active: true }, [], bounds, true, () => 0.01);
  assert.ok(slipper.vx > 0.4);
  assert.equal(slipper.spin, 0);
  assert.equal(slipper.yaw, 0);
  assert.equal(slipper.y, 0);
  assert.equal(slipper.roll, 0);
  assert.equal(slipper.flipped, false);
});

test('idle or seated residents do not move the slippers', () => {
  const [slipper] = createSlipperPair([[0, 0]], [0.12]);
  for (let i = 0; i < 120; i++) stepSlippers([slipper], 1 / 60, { x: -0.2, z: 0, vx: 1.5, vz: 0, active: false }, [], bounds);
  assert.equal(slipper.x, 0);
  assert.equal(slipper.vx, 0);
  assert.equal(slipper.flipped, false);
});
