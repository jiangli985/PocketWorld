import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('./dustPromptEngine.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module, exports: module.exports },
);

const {
  MAX_DUST_PARTICLES,
  createDustPromptState,
  decimatePoints,
  splitPromptLines,
  setDustTargets,
  stepDustPrompt,
} = module.exports;

function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('decimatePoints bounds large glyph point sets uniformly', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i * 0.5 }));
  const bounded = decimatePoints(many, MAX_DUST_PARTICLES);
  assert.equal(bounded.length, MAX_DUST_PARTICLES);
  assert.equal(bounded[0].x, 0);
  assert.ok(bounded[bounded.length - 1].x > 4990);
});

test('splitPromptLines wraps long hints cleanly at separator boundaries', () => {
  const measure = value => value.length * 10;
  assert.deepEqual(Array.from(splitPromptLines('E · 使用电脑', measure, 200)), ['E · 使用电脑']);
  const lines = splitPromptLines('点击书页书写 · ← / → 翻页 · 自动保存 · Esc 返回', measure, 200);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].length > 0 && lines[1].length > 0);
});

test('particles converge onto glyph targets and disperse away when cleared', () => {
  const state = createDustPromptState();
  const rng = makeRng(42);
  const targets = [
    { x: 280, y: 30 },
    { x: 300, y: 36 },
    { x: 320, y: 40 },
    { x: 340, y: 34 },
  ];

  setDustTargets(state, 'E · 使用电脑', targets, 310, 36, false, rng);
  assert.equal(state.active, true);
  assert.equal(state.particles.length, targets.length);
  assert.ok(state.particles.every(p => p.mode === 'converge'));
  assert.ok(state.particles.every(p => p.x < p.tx && p.vx > 0), 'converging dust must fly in from the left');

  for (let i = 0; i < 65; i++) stepDustPrompt(state, 1 / 60, false);
  for (const p of state.particles) {
    assert.ok(Math.hypot(p.x - p.tx, p.y - p.ty) < 1.8, 'converged particle must reach target');
    assert.ok(p.alpha > 0.9, 'converged particle must be visible');
  }
  assert.ok(state.settleProgress > 0.85);

  setDustTargets(state, '', [], 310, 36, false, rng);
  assert.equal(state.text, '');
  assert.equal(state.active, true);
  assert.ok(state.particles.every(p => p.mode === 'disperse'));

  const before = state.particles.map(p => ({ x: p.x, y: p.y }));
  for (let i = 0; i < 15; i++) stepDustPrompt(state, 1 / 60, false);
  assert.ok(
    state.particles.every((p, i) => p.x > before[i].x + 12 && p.vx > 0),
    'dispersing particles must blow directly toward the right',
  );

  for (let i = 0; i < 120; i++) stepDustPrompt(state, 1 / 60, false);
  assert.equal(state.particles.length, 0);
  assert.equal(state.active, false);
  assert.equal(state.settleProgress, 0);
});

test('retargeting reuses active particles and disperses surplus', () => {
  const state = createDustPromptState();
  const rng = makeRng(7);
  const first = Array.from({ length: 10 }, (_, i) => ({ x: 260 + i * 10, y: 36 }));
  const second = Array.from({ length: 4 }, (_, i) => ({ x: 290 + i * 12, y: 36 }));

  setDustTargets(state, 'E · 摸摸团子', first, 310, 36, false, rng);
  for (let i = 0; i < 30; i++) stepDustPrompt(state, 1 / 60, false);

  setDustTargets(state, 'E · 坐下', second, 310, 36, false, rng);
  assert.equal(state.particles.filter(p => p.mode === 'converge').length, 4);
  assert.equal(state.particles.filter(p => p.mode === 'disperse').length, 6);

  for (let i = 0; i < 90; i++) stepDustPrompt(state, 1 / 60, false);
  assert.equal(state.particles.length, 4);
  assert.ok(state.particles.every(p => p.mode === 'converge'));
});

test('reducedMotion settles immediately and clears cleanly', () => {
  const state = createDustPromptState();
  setDustTargets(state, 'E · 打开日记', [{ x: 300, y: 36 }], 300, 36, true);
  assert.equal(state.particles[0].x, 300);
  assert.equal(state.particles[0].alpha, 1);

  setDustTargets(state, '', [], 300, 36, true);
  for (let i = 0; i < 15; i++) stepDustPrompt(state, 1 / 60, true);
  assert.equal(state.particles.length, 0);
  assert.equal(state.active, false);
});
