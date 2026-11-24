import { dropSpot } from './plushCarry.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlushBodies,
  isValidPlushBody,
  PLUSH_TOPPLE_APPROACH,
  plushFloorY,
  plushObstacleBoxes,
  plushSupportHeight,
  resolveMoverAgainstPlush,
  stepPlushDolls,
} from './plushMotion.ts';

const bounds = { left: -6.42, right: 4.02, back: -3.18, front: 3.02 };
const still = [{ x: -4, z: -2, vx: 0, vz: 0, radius: 0.23, active: true }];

const makeDoll = (id, x, z, radius = 0.22, yaw = 0) => ({
  id,
  name: id,
  path: `furniture/${id}.glb`,
  position: [x, 0, z],
  yaw,
  height: 0.52,
  radius,
  footprint: { left: -radius, right: radius, back: -radius, front: radius },
});

test('a gentle walk nudges a plush doll forward with wobble and settles back sitting upright', () => {
  const [doll] = createPlushBodies([makeDoll('plush-bunny', 0, 0, 0.20)]);
  const gentle = PLUSH_TOPPLE_APPROACH - 0.14;
  let maxTilt = 0;
  for (let i = 0; i < 8; i++) {
    stepPlushDolls([doll], 1 / 60, [{ x: -0.39, z: 0, vx: gentle, vz: 0, radius: 0.23, active: true }], [], bounds, false, () => 0.1);
    maxTilt = Math.max(maxTilt, Math.hypot(doll.roll, doll.pitch));
  }
  for (let i = 0; i < 420; i++) {
    stepPlushDolls([doll], 1 / 60, still, [], bounds, false, () => 0.1);
    maxTilt = Math.max(maxTilt, Math.hypot(doll.roll, doll.pitch));
  }
  assert.ok(doll.x > 0.12, `expected gentle nudge slide, got x=${doll.x}`);
  assert.ok(maxTilt > 0.05, `expected soft plush wobble, got maxTilt=${maxTilt}`);
  assert.equal(doll.toppled, false);
  assert.equal(doll.roll, 0);
  assert.equal(doll.pitch, 0);
  assert.equal(doll.y, 0);
  assert.equal(doll.vx, 0);
});

test('a brisk kick hops and topples a plush doll, and kicking it again can pop it back upright', () => {
  const [doll] = createPlushBodies([makeDoll('plush-bear', 0, 0, 0.23)]);
  let maxY = 0;
  for (let i = 0; i < 6; i++) {
    stepPlushDolls([doll], 1 / 60, [{ x: -0.41 + i * 1.2 / 60, z: 0, vx: 1.2, vz: 0, radius: 0.23, active: true }], [], bounds, false, () => 0.15);
    maxY = Math.max(maxY, doll.y);
  }
  for (let i = 0; i < 420; i++) {
    stepPlushDolls([doll], 1 / 60, still, [], bounds, false, () => 0.15);
    maxY = Math.max(maxY, doll.y);
  }
  assert.ok(maxY > 0.04, `expected airborne plush hop, got ${maxY}`);
  assert.equal(doll.toppled, true, 'brisk kick with low random draw should topple plush doll');
  assert.ok(Math.abs(Math.max(Math.abs(doll.roll), Math.abs(doll.pitch)) - Math.PI / 2) < 0.03);
  assert.equal(doll.y, 0);

  // Kicking the toppled plush doll briskly again pops it back sitting upright.
  const startX = doll.x;
  for (let i = 0; i < 6; i++) {
    stepPlushDolls([doll], 1 / 60, [{ x: startX - 0.41 + i * 1.2 / 60, z: doll.z, vx: 1.2, vz: 0, radius: 0.23, active: true }], [], bounds, false, () => 0.2);
  }
  for (let i = 0; i < 420; i++) stepPlushDolls([doll], 1 / 60, still, [], bounds, false, () => 0.2);
  assert.equal(doll.toppled, false, 'second brisk kick should pop toppled doll back upright');
  assert.equal(doll.roll, 0);
  assert.equal(doll.pitch, 0);
});

test('a plush doll stays inside cabin walls and bounces off static furniture without clipping', () => {
  const [wallDoll] = createPlushBodies([makeDoll('plush-penguin', 3.6, 0, 0.22)]);
  wallDoll.vx = 2.6;
  for (let i = 0; i < 120; i++) stepPlushDolls([wallDoll], 1 / 60, still, [], bounds, false, () => 0.9);
  assert.ok(wallDoll.x <= bounds.right - wallDoll.radius + 1e-5, `wall boundary respected: ${wallDoll.x}`);

  const [furnDoll] = createPlushBodies([makeDoll('plush-bunny', -1.5, 0, 0.20)]);
  furnDoll.vx = 2.2;
  const obstacle = [-1.0, 1.0, -1.0, 1.0];
  for (let i = 0; i < 120; i++) stepPlushDolls([furnDoll], 1 / 60, still, [obstacle], bounds, false, () => 0.9);
  assert.ok(furnDoll.x <= obstacle[0] - furnDoll.radius + 1e-5, `furniture kept doll outside: ${furnDoll.x}`);
});

test('a wall-pinned plush doll retains a solid collision volume that blocks the resident', () => {
  const [doll] = createPlushBodies([makeDoll('plush-penguin', bounds.right - 0.22, 0, 0.22)]);
  const resident = { x: doll.x - 0.35, z: 0 };
  stepPlushDolls([doll], 1 / 60, [{ x: resident.x, z: resident.z, vx: 1.2, vz: 0, radius: 0.23, active: true }], [], bounds, false, () => 0.9);
  const blocked = resolveMoverAgainstPlush(resident, 0.23, [doll], () => true);
  assert.equal(blocked, true);
  assert.ok(doll.x - resident.x >= 0.23 + doll.radius - 1e-4, `resident pushed cleanly outside pinned doll: gap=${doll.x - resident.x}`);
});

test('kicking one plush doll into another separates both solidly and transfers momentum', () => {
  const dolls = createPlushBodies([
    makeDoll('plush-bunny', 0, 0, 0.20),
    makeDoll('plush-penguin', 0.65, 0, 0.22),
  ]);
  dolls[0].vx = 1.9;
  for (let i = 0; i < 90; i++) stepPlushDolls(dolls, 1 / 60, still, [], bounds, false, () => 0.9);
  const gap = Math.hypot(dolls[1].x - dolls[0].x, dolls[1].z - dolls[0].z);
  assert.ok(dolls[1].x > 0.72, `second doll should be knocked forward, got x=${dolls[1].x}`);
  assert.ok(gap >= dolls[0].radius + dolls[1].radius - 1e-3, `dolls must never overlap: gap=${gap}`);
});

test('reduced motion slides plush dolls smoothly upright without hopping, spinning or toppling', () => {
  const [doll] = createPlushBodies([makeDoll('plush-bunny', 0, 0, 0.20, 0.26)]);
  for (let i = 0; i < 8; i++) {
    stepPlushDolls([doll], 1 / 60, [{ x: -0.36, z: 0.05, vx: 1.4, vz: 0.3, radius: 0.23, active: true }], [], bounds, true, () => 0.01);
  }
  assert.ok(doll.vx > 0.4);
  assert.equal(doll.spin, 0);
  assert.equal(doll.yaw, 0.26);
  assert.equal(doll.y, 0);
  assert.equal(doll.roll, 0);
  assert.equal(doll.pitch, 0);
  assert.equal(doll.toppled, false);
  assert.equal(isValidPlushBody(doll), true);
});

test('support height, rug floor elevation and live obstacle boxes stay physically consistent', () => {
  const w = 0.20, h = 0.29, d = 0.17;
  assert.ok(Math.abs(plushSupportHeight(0, 0, w, h, d) - h) < 1e-6);
  assert.ok(Math.abs(plushSupportHeight(Math.PI / 2, 0, w, h, d) - w) < 1e-6);
  assert.ok(Math.abs(plushSupportHeight(0, Math.PI / 2, w, h, d) - d) < 1e-6);
  assert.equal(plushFloorY(-4.05, 0.11), 0.0125);
  assert.equal(plushFloorY(0, 0), 0);

  const bodies = createPlushBodies([makeDoll('plush-bunny', 1.2, 0.5, 0.20)]);
  const [box] = plushObstacleBoxes(bodies, 0.11);
  assert.ok(Math.abs(box[0] - (1.2 - 0.31)) < 1e-6 && Math.abs(box[1] - (1.2 + 0.31)) < 1e-6);
});

test('placement chooses clear ground beside the carrier on the current deck', () => {
  const [toy, other] = createPlushBodies([makeDoll('plush-penguin', 1, 1), makeDoll('plush-bunny', -4, .5)]);
  const spot = dropSpot(toy, -4, 0, 0, [], [toy, other]);
  assert.ok(spot && spot.x < -2);
  assert.ok(Math.hypot(spot.x - other.x, spot.z - other.z) >= toy.radius + other.radius);
  assert.equal(dropSpot(toy, -4, 0, 0, [[-5, -3, -1, 1]], [toy]), null);
});
