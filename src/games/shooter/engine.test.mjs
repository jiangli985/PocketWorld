// Compile engine.ts to a temporary CommonJS bundle, then pass its path:
// node src/games/shooter/engine.test.mjs <engine.cjs>
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
if (!process.argv[2]) throw new Error('Pass the compiled engine.cjs path.');
const E = require(resolve(process.argv[2]));
const enemy = (id = 1, x = 400, y = 300, hp = 3) => ({ id, kind: 'orb', x, baseX: x, y, radius: 20, hp, maxHp: hp, phase: 0, flash: 0 });
const ball = (x = 400, y = 329, vx = 0, vy = -525) => ({ x, y, vx, vy, radius: 8, life: 8, lastEnemy: -1, hitCooldown: 0, splitBudget: 2, trail: [] });
const fixture = () => { const r = E.createRun(() => 0.1); r.phase = 'flight'; r.enemies = [enemy()]; r.balls = [ball()]; return r; };

test('three enemy classes, bounded layout and legal upward aiming', () => {
  const r = E.createRun(() => 0.5);
  assert.equal(r.enemies.length, 9);
  for (const point of [{ x: 400, y: 900 }, { x: -1000, y: 600 }, { x: 2000, y: 600 }]) assert.ok(Math.sin(E.aimAngle(point)) < -0.3);
  assert.equal(E.launch(r, { x: 400, y: 160 }), true);
  assert.equal(E.launch(r, { x: 400, y: 160 }), false);
  assert.equal(r.pending, 5);
  E.advance(r, 1 / 60);
  assert.equal(r.balls.length, 1);
  assert.equal(r.pending, 4);
});

test('collision reflects and preserves a ball rather than consuming it', () => {
  const r = fixture(); E.advance(r, 1 / 120);
  assert.equal(r.enemies[0].hp, 2);
  assert.ok(r.balls[0].vy > 0);
  assert.equal(r.balls.length, 1);
  assert.ok(r.balls[0].y > 328);
});

test('piercing keeps forward direction and does not damage every substep', () => {
  const r = fixture(); r.upgrades.pierce = 1;
  E.advance(r, 1 / 120); assert.ok(r.balls[0].vy < 0);
  for (let i = 0; i < 8; i++) E.advance(r, 1 / 120);
  assert.equal(r.enemies[0].hp, 2);
});

test('power, chain, split and gravity have real simulation effects', () => {
  const power = fixture(); power.upgrades.power = 1; E.advance(power, 1 / 120); assert.equal(power.enemies[0].hp, 1);
  const chain = fixture(); chain.enemies.push(enemy(2, 490, 300, 3)); chain.upgrades.chain = 1; E.advance(chain, 1 / 120); assert.equal(chain.enemies[1].hp, 2); assert.equal(chain.lines.length, 1);
  const split = fixture(); split.upgrades.split = 1; E.advance(split, 1 / 120); assert.equal(split.balls.length, 3);
  const gravity = fixture(); gravity.enemies = [enemy(1, 470, 300, 99)]; gravity.balls = [ball(400, 350, 0, -100)]; gravity.upgrades.gravity = 1; E.advance(gravity, 1 / 120); assert.ok(gravity.balls[0].vx > 0);
});

test('wave clear produces three unique choices; upgrades preserve score and progress', () => {
  const r = fixture(); r.enemies = []; r.score = 450; E.advance(r, 1 / 60);
  assert.equal(r.phase, 'upgrade');
  assert.equal(new Set(E.upgradeChoices(r).map((item) => item.id)).size, 3);
  assert.equal(E.chooseUpgrade(r, 'extra'), true); assert.equal(r.wave, 2); assert.equal(r.volleySize, 7); assert.equal(r.score, 450);
  assert.equal(E.chooseUpgrade(r, 'power'), false);
  assert.ok(r.enemies.some((item) => item.kind === 'armored'));
  r.phase = 'flight'; r.enemies = []; E.advance(r, 1 / 60); E.chooseUpgrade(r, 'power');
  r.phase = 'flight'; r.enemies = []; E.advance(r, 1 / 60); assert.equal(r.phase, 'victory');
});

test('empty volley advances exactly one turn; danger line loses', () => {
  const r = fixture(); r.balls = []; r.pending = 0; E.advance(r, 1 / 60);
  assert.equal(r.turn, 2); assert.equal(r.enemies[0].y, 326); assert.equal(r.phase, 'aim');
  E.advance(r, 1 / 60); assert.equal(r.turn, 2);
  r.phase = 'flight'; r.enemies[0].y = 480; E.advance(r, 1 / 60); assert.equal(r.phase, 'defeat');
});

test('long stress simulation respects every object bound and has finite state', () => {
  const r = E.createRun(() => 0.1);
  for (const id of ['split', 'chain', 'gravity', 'power']) r.upgrades[id] = 2;
  let maxBalls = 0;
  for (let tick = 0; tick < 36000; tick++) {
    if (r.phase === 'aim') E.launch(r, { x: 145 + (tick % 5) * 118, y: 145 });
    if (r.phase === 'upgrade') E.chooseUpgrade(r, 'extra');
    if (r.phase === 'victory' || r.phase === 'defeat') { r.phase = 'aim'; r.wave = 1; r.enemies = E.createRun(() => 0.1).enemies; }
    E.advance(r, 1 / 60); r.sounds.length = 0;
    maxBalls = Math.max(maxBalls, r.balls.length);
    assert.ok(r.balls.length <= E.MAX_BALLS); assert.ok(r.particles.length <= E.MAX_PARTICLES);
    assert.ok(r.enemies.length <= E.MAX_ENEMIES); assert.ok(r.texts.length <= E.MAX_TEXTS); assert.ok(r.lines.length <= E.MAX_LINES); assert.ok(r.rings.length <= 30);
    for (const b of r.balls) assert.ok(Number.isFinite(b.x + b.y + b.vx + b.vy));
  }
  assert.ok(maxBalls > 5);
});
