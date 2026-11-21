import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARTRIDGE_HEIGHT,
  CARTRIDGE_REST_HEIGHT,
  CARTRIDGE_SLOT,
  CARTRIDGE_STAND_LEAN,
  cartridgePosition,
  clampCartridgeDrag,
  isCartridgeDrop,
  cartridgeDragState,
  cartridgeTransferPitch,
  cartridgeTransferPoint,
} from './cartridge-motion.ts';

const { CRT_SIZE } = await import('./computerLayout.ts');
const monitor = { min: [1.55 - CRT_SIZE[0] / 2, 1.12, -2.67 - CRT_SIZE[2] / 2],
  max: [1.55 + CRT_SIZE[0] / 2, 1.12 + CRT_SIZE[1], -2.67 + CRT_SIZE[2] / 2] };
const halfSize = [.11, CARTRIDGE_HEIGHT / 2, .025];
const overlapsMonitor = point => point.every((value, axis) => value + halfSize[axis] > monitor.min[axis] && value - halfSize[axis] < monitor.max[axis]);

test('only the slot accepts a cartridge, including a forgiving approach from the front', () => {
  for (const point of [CARTRIDGE_SLOT, [2.06, 1.44, -2.05], [2.46, 1.65, -2.05]]) assert.ok(isCartridgeDrop(point));
  for (const point of [cartridgePosition('mario'), cartridgePosition('shooter'), [1.55, 1.68, -2.05], [2.26, 2, -2.05], [2.26, 1.1, -2.05], [2.26, 1.44, -2.56], [NaN, 1.44, -2.05]]) assert.equal(isCartridgeDrop(point), false);
});

test('desk collision cannot accept a release far below the slot', () => {
  for (const y of [-10, 0, .5, 1.1]) {
    const drag = cartridgeDragState([CARTRIDGE_SLOT[0], y, CARTRIDGE_SLOT[2]]);
    assert.ok(drag.point[1] > 1.4);
    assert.equal(drag.nearSlot, false);
  }
  assert.equal(cartridgeDragState([2.26, 1.27, -2.05]).nearSlot, true);
});

test('held cartridges stay in front of the entire monitor and above the keyboard', () => {
  for (let x = -1; x <= 4; x += .1) for (let y = 0; y <= 4; y += .1) {
    const point = clampCartridgeDrag([x, y, -2.56]);
    assert.equal(overlapsMonitor(point), false);
    assert.ok(point[1] - halfSize[1] > 1.2);
  }
});

test('both display-stand positions and all insertion, ejection and return paths clear the CRT and each other', () => {
  for (const game of ['mario', 'shooter']) {
    const shelf = cartridgePosition(game);
    const other = cartridgePosition(game === 'mario' ? 'shooter' : 'mario');
    assert.equal(shelf[1], CARTRIDGE_REST_HEIGHT, 'cartridge seats inside display stand felt cradle');
    assert.ok(shelf[1] - halfSize[1] > 1.12, 'cartridge clears desk surface inside stand');
    const paths = [[shelf, CARTRIDGE_SLOT], [CARTRIDGE_SLOT, shelf], [[1.55, 1.7, -2.05], shelf], [[2.8, 2.7, -2.05], shelf], [[2.1, 1.44, -2.05], CARTRIDGE_SLOT]];
    assert.equal(overlapsMonitor(shelf), false);
    for (const [from, to] of paths) {
      assert.deepEqual(cartridgeTransferPoint(from, to, 0), from);
      assert.deepEqual(cartridgeTransferPoint(from, to, 1), to);
      for (let step = 0; step <= 1000; step++) {
        const point = cartridgeTransferPoint(from, to, step / 1000);
        assert.equal(overlapsMonitor(point), false, `${game} crossed monitor at ${point}`);
        assert.ok(point[1] - halfSize[1] >= 1.12 - 1e-9, 'cartridge crossed desk');
        assert.ok(point.some((value, axis) => Math.abs(value - other[axis]) >= 2 * halfSize[axis]), 'cartridge crossed the other cartridge');
      }
    }
    // Verify smooth pitch transition between angled display stand (-14 deg) and upright dock (0 deg).
    assert.equal(cartridgeTransferPitch(shelf, CARTRIDGE_SLOT, 0), CARTRIDGE_STAND_LEAN);
    assert.equal(cartridgeTransferPitch(shelf, CARTRIDGE_SLOT, 1), 0);
    assert.equal(cartridgeTransferPitch(CARTRIDGE_SLOT, shelf, 0), 0);
    assert.equal(cartridgeTransferPitch(CARTRIDGE_SLOT, shelf, 1), CARTRIDGE_STAND_LEAN);
  }
});

test('all four retro cartridge, display-stand and expansion-dock GLB assets are valid glTF 2.0', () => {
  const expected = [
    ['cartridge-mario.glb', ['Cartridge_mario_Root', 'Cart_mario_CoverSticker', 'Cart_mario_SpineSticker', 'Cart_mario_PCB', 'Cart_mario_GoldPin_0']],
    ['cartridge-shooter.glb', ['Cartridge_shooter_Root', 'Cart_shooter_CoverSticker', 'Cart_shooter_SpineSticker', 'Cart_shooter_PCB', 'Cart_shooter_GoldPin_0']],
    ['cartridge-stand.glb', ['CartridgeStand_Root', 'Stand_CenterDivider', 'Stand_BrassBackRail', 'Stand_SlotFelt_0', 'Stand_SlotFelt_1']],
    ['cartridge-dock.glb', ['CartridgeDock_Root', 'Dock_SlotCollar_Front', 'Dock_SlotPin_0', 'Dock_SwitchBushing', 'Dock_LedBezel']],
  ];
  for (const [file, requiredNodes] of expected) {
    const glbPath = path.resolve('assets/public/models/furniture', file);
    assert.ok(fs.existsSync(glbPath), `${file} must exist`);
    const buf = fs.readFileSync(glbPath);
    assert.equal(buf.toString('ascii', 0, 4), 'glTF');
    assert.equal(buf.readUInt32LE(4), 2);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const names = new Set((gltf.nodes ?? []).map(n => n.name));
    for (const node of requiredNodes) assert.ok(names.has(node), `${file} missing node ${node}`);
    assert.ok(buf.length < 1024 * 1024, `${file} unexpectedly large: ${buf.length} bytes`);
  }
});
