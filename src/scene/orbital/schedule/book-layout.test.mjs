import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(output, context);
  return context.exports;
}
const { BOOK, coverPose, leafPose } = load('../journal/bookModel.ts');
const { SCHEDULE_BOOK_POSITION: position, SCHEDULE_BOOK_SCALE: scale, SCHEDULE_BOOK_YAW: yaw } = load('./bookLayout.ts');

test('the planner stays clear of the import disc and keyboard throughout opening and page turns', () => {
  const check = (x, z) => {
    const worldX = position[0] + x * scale * 0.237 * Math.cos(yaw) + z * scale * 0.27 * Math.sin(yaw);
    assert.ok(worldX >= 0.28 + 0.145 + 0.02, `planner overlaps the import disc at x=${worldX}`);
    assert.ok(worldX <= 1.15 - 0.02, `planner overlaps the keyboard at x=${worldX}`);
  };
  for (let step = 0; step <= 20; step++) {
    const opening = step / 20, cover = coverPose(opening);
    for (const x of [0, 1.49]) for (const y of [-BOOK.board / 2, BOOK.board / 2]) for (const z of [-1.04, 1.04]) {
      check(cover.x + x * Math.cos(cover.angle) - y * Math.sin(cover.angle), z);
    }
    for (const x of [0.045, 1.535]) for (const z of [-1.04, 1.04]) check(x, z);
    for (let cursor = 0; cursor <= BOOK.leaves; cursor += 0.25) {
      for (const index of new Set([0, BOOK.leaves - 1, Math.min(BOOK.leaves - 1, Math.floor(cursor))])) {
        const leaf = leafPose(index, Math.max(0, Math.min(1, cursor - index)), opening, cursor, BOOK.leaves);
        for (const point of leaf.points) for (const z of [-BOOK.height / 2, BOOK.height / 2]) check(point.x, z);
      }
    }
  }
});
