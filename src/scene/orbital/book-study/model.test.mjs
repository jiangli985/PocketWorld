import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK, leafPose, coverPose, paperHalfThickness } from './model.ts';

test('settled sheets keep their order on both sides, including the binding', () => {
  for (const turn of [0, 1]) {
    const sheets = Array.from({ length: BOOK.leaves }, (_, i) => leafPose(i, turn, 1));
    for (let i = 1; i < sheets.length; i++) {
      for (let j = 0; j <= BOOK.segments; j++) {
        const separation = sheets[i].points[j].y - sheets[i - 1].points[j].y;
        assert.ok(turn ? separation > 0.00005 : separation < -0.00005, `sheet order: side ${turn}, leaf ${i}, joint ${j}`);
      }
    }
  }
});

test('a traveling leaf keeps its width and stays above the boards throughout the turn', () => {
  assert.ok(leafPose(15, 0, 1).points.at(-1).x > 1.3);
  assert.ok(leafPose(15, 1, 1).points.at(-1).x < -1.3);
  assert.ok(leafPose(15, 0.5, 1).points.at(-1).y > 1.3);
  for (const leaf of [0, 15, 31]) for (let frame = 0; frame <= 100; frame++) {
    const { points } = leafPose(leaf, frame / 100, 1);
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j];
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - BOOK.width / BOOK.segments) < 1e-9, 'paper must not stretch');
      assert.ok(b.y > BOOK.board, `leaf ${leaf}, frame ${frame}, joint ${j} intersects cover`);
    }
  }
});

test('the rigid cover closes above the paper and opens with its underside on the desk', () => {
  const closed = coverPose(0), open = coverPose(1);
  assert.ok(closed.y - BOOK.board / 2 > leafPose(0, 0, 0).points[0].y + BOOK.thickness / 2);
  assert.ok(Math.abs(open.y - BOOK.board / 2) < 1e-9);
  assert.equal(open.angle, Math.PI);
});

test('neighboring settled sheets leave room for their thickness at every spread', () => {
  function crossSection(points, x) {
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j];
      if ((x - a.x) * (x - b.x) > 1e-12) continue;
      const t = (x - a.x) / (b.x - a.x), u = (j - 1 + t) / BOOK.segments;
      const cos = Math.abs(b.x - a.x) / (BOOK.width / BOOK.segments);
      return { y: a.y * (1 - t) + b.y * t, half: paperHalfThickness(u) / cos };
    }
    throw Error('sample outside paper');
  }
  for (let spread = 0; spread <= BOOK.leaves; spread++) for (let i = 1; i < BOOK.leaves; i++) {
    if (i === spread) continue;
    const left = i < spread;
    const a = leafPose(i - 1, Number(left), 1, spread).points, b = leafPose(i, Number(left), 1, spread).points;
    const low = Math.max(Math.min(a[0].x, a.at(-1).x), Math.min(b[0].x, b.at(-1).x));
    const high = Math.min(Math.max(a[0].x, a.at(-1).x), Math.max(b[0].x, b.at(-1).x));
    for (let j = 0; j <= 100; j++) {
      const x = low + (high - low) * j / 100, aa = crossSection(a, x), bb = crossSection(b, x);
      const clearance = (bb.y - aa.y) * (left ? 1 : -1) - aa.half - bb.half;
      assert.ok(clearance > 0, `paper thickness intersects: spread ${spread}, leaf ${i}, x ${x}, clearance ${clearance}`);
    }
  }
});
