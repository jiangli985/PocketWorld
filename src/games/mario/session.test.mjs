import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CROSSING_MS, createFishingSession } from './session.ts';
import { createFishingGame } from './engine.ts';
import { LAND_HOLD_MS } from './renderer.ts';
import { HIGHSCORE_KEY, SAVE_KEY } from './storage.ts';

const legacy = 'pocketworld:mario:highscore';
const prepare = { type: 'prepare', recipeId: 'basic', fishId: 'sardine' };

function mount(disk = new Map([[legacy, '999']]), random = () => 0) {
  const frames = new Map();
  const effects = [];
  const soundscapes = [];
  const score = [];
  const finished = [];
  const writes = [];
  let view, scene, next = 0, time = 0, exits = 0, draws = 0, publishes = 0;
  const storage = {
    getItem(key) { assert.notEqual(key, legacy); return disk.get(key) ?? null; },
    setItem(key, value) { assert.notEqual(key, legacy); disk.set(key, value); writes.push([key, value]); },
  };
  const game = createFishingSession({
    getStorage: () => storage, random,
    requestFrame(fn) { assert.equal(frames.size, 0); frames.set(++next, fn); return next; },
    cancelFrame: id => assert(frames.delete(id)),
    show(state) { view = state; scene = state.scene; publishes++; }, draw(frame) { scene = frame; draws++; },
    onScore: (...args) => score.push(args), onFinish: result => finished.push(result), onExit: () => exits++,
    audio: {
      setEnabled(value) { effects.push(value); }, unlock() { effects.push('unlock'); },
      play(cue) { effects.push(cue); }, dispose() { effects.push('disposed'); },
      setScene(scene) { if (scene !== soundscapes.at(-1)) soundscapes.push(scene); },
    },
  });
  game.setActive(true);
  return {
    game, frames, disk, writes, score, finished, effects, soundscapes,
    get snapshot() { return view.snapshot; }, get exits() { return exits; }, get draws() { return draws; },
    get scene() { return scene; },
    get publishes() { return publishes; }, get saved() { return JSON.parse(disk.get(SAVE_KEY)); },
    action(type, gesture) { game.dispatch({ type }, gesture); },
    tick(delta = 16) {
      assert.equal(frames.size, 1);
      const [id, fn] = frames.entries().next().value;
      frames.delete(id);
      fn(time += delta);
    },
    run(ms) { for (let left = ms; left > 0; left -= 16) this.tick(Math.min(16, left)); },
  };
}

test('routes home, crossing, dock and shop audio while pause remains silent', () => {
  const s = mount();
  assert.deepEqual(s.soundscapes, ['home']);
  assert.ok(!s.effects.includes('unlock'));
  s.action('start', true);
  assert.equal(s.effects.at(-1), 'unlock');
  s.game.setDockImageReady();
  s.action('dock', true);
  s.tick();
  s.run(CROSSING_MS);
  s.action('tackle', true);
  s.action('dock', true);
  s.action('market', true);
  assert.deepEqual(s.soundscapes, ['home', 'boat', 'crossing', 'dock', 'tackle', 'dock', 'market']);
  s.action('pause', true);
  assert.equal(s.effects.at(-1), 'unlock');
  assert.ok(s.effects.includes(false));
  assert.equal(s.soundscapes.at(-1), 'market');
  s.action('finish', true);
  assert.equal(s.soundscapes.at(-1), 'result');
  s.game.dispose();
});

test('catch cards expire without stopping the boat, and career freezes the trip', () => {
  const s = mount();
  s.action('career', true);
  assert.equal(s.snapshot.screen, 'career');
  assert.equal(s.soundscapes.at(-1), 'career');
  s.action('close-overlay');
  assert.equal(s.snapshot.screen, 'home');
  s.action('start');
  s.tick(); s.run(12_100);
  assert.equal(s.snapshot.catchCard.grams, 80);
  assert.equal(s.snapshot.catchCard.record, true);
  assert.equal(s.saved.angling.counts.sardine, 1);
  s.run(3_201);
  assert.equal(s.snapshot.catchCard, undefined);
  s.action('career');
  const currentTime = s.scene.timeMs;
  assert.equal(s.frames.size, 0);
  assert.equal(s.snapshot.angling.best.fishId, 'sardine');
  s.action('close-overlay');
  assert.equal(s.snapshot.screen, 'boat');
  s.tick(15_000);
  assert.equal(s.scene.timeMs, currentTime);
  s.game.dispose();
});

test('assembled session catches, prepares, sells, upgrades and reports each trip once', () => {
  const s = mount();
  assert.equal(s.frames.size, 0);
  assert.equal(s.snapshot.highScore, 0);
  s.action('start', true);
  assert(s.effects.includes('unlock'));
  s.tick();
  s.run(4 * 12_100);
  assert.equal(s.snapshot.basket.count, 4);
  assert.equal(s.saved.fishCounts.sardine, 4);
  assert.deepEqual(s.saved.discoveredFishIds, ['sardine']);
  assert.match(s.snapshot.notice, /钓到沙丁鱼/);
  s.action('journal');
  assert.equal(s.snapshot.screen, 'journal');
  s.action('dock');
  assert.equal(s.snapshot.screen, 'dock');
  s.game.dispatch(prepare);
  assert.equal(s.snapshot.orders.length, 0);
  s.action('market');
  assert.equal(s.snapshot.screen, 'market');
  for (let index = 0; index < 4; index++) s.game.dispatch(prepare);
  assert.equal(s.snapshot.orders.length, 3);
  assert.equal(s.snapshot.basket.count, 1);
  assert.equal(s.snapshot.coins, 0);
  s.run(4000);
  s.game.dispatch(prepare);
  s.run(12000);
  assert.equal(s.snapshot.coins, 20);
  assert.equal(s.snapshot.score, 20);
  s.game.dispatch({ type: 'upgrade', level: 2 });
  assert.equal(s.snapshot.rod.owned, 1);
  s.action('dock');
  s.action('tackle');
  assert.equal(s.snapshot.screen, 'tackle');
  s.game.dispatch({ type: 'upgrade', level: 2 });
  assert.deepEqual(s.snapshot.rod, { owned: 2, equipped: 2 });
  assert.equal(s.scene.rodLevel, 2);
  assert.equal(s.snapshot.coins, 0);
  assert.equal(s.snapshot.score, 20);
  assert.equal(s.saved.rodLevel, 2);
  assert.deepEqual(s.score, [[0, 0], [5, 5], [10, 10], [15, 15], [20, 20]]);
  assert.equal(s.disk.get(legacy), '999');
  assert.equal(s.disk.get(HIGHSCORE_KEY), '20');
  s.action('pause');
  s.action('finish');
  s.action('finish');
  s.action('exit');
  assert.deepEqual(s.finished, [{ score: 20, highScore: 20, victory: true }]);
  assert.equal(s.frames.size, 0);
  assert.equal(s.exits, 0);
  s.action('home');
  assert.equal(s.exits, 0);
  s.action('exit');
  assert.equal(s.exits, 1);
  s.action('start');
  assert.deepEqual(s.score.at(-1), [0, 20]);
  s.game.dispose();
});

test('refresh resumes partially sold order; a sold order and its proceeds share one save', () => {
  const s = mount();
  s.action('start'); s.tick(); s.run(12_100); s.game.setDockImageReady();
  s.action('dock'); s.run(CROSSING_MS); s.action('market'); s.game.dispatch(prepare);
  assert.equal(s.saved.orders[0].remainingMs, 4000);
  const writeCount = s.writes.length;
  s.run(1500);
  assert.equal(s.writes.length, writeCount, 'no write during normal order progress');
  s.game.dispose();
  assert.equal(s.saved.orders[0].remainingMs, 2500);
  const restored = mount(s.disk);
  assert.equal(restored.snapshot.orders.length, 1);
  restored.action('start'); restored.tick(120000); restored.run(2499);
  assert.equal(restored.snapshot.coins, 0);
  restored.run(1);
  assert.equal(restored.saved.coins, 5);
  assert.deepEqual(restored.saved.orders, []);
  assert.equal(restored.saved.fishCounts.sardine, 0);
  restored.game.dispose();
  const again = mount(s.disk);
  again.action('start'); again.tick(120000); again.run(4500);
  assert.equal(again.snapshot.coins, 5);
  assert.deepEqual(again.score, [[0, 5]]);
  again.game.dispose();
});

test('stopping cancels the only frame and sound; reactivation never settles a paused order', () => {
  const progress = createFishingGame({ random: () => 0 }).getProgress();
  progress.discoveredFishIds.push('sardine');
  progress.orders.push({ fishId: 'sardine', recipeId: 'basic', remainingMs: 4000 });
  const s = mount(new Map([[SAVE_KEY, JSON.stringify(progress)]]));
  s.action('start'); s.tick(); s.run(1000);
  s.game.setActive(false);
  assert.equal(s.frames.size, 0);
  assert.equal(s.effects.at(-1), false);
  assert.equal(s.saved.orders[0].remainingMs, 3000);
  s.action('pause');
  s.game.setActive(true);
  s.tick(50000);
  assert.equal(s.snapshot.screen, 'boat');
  s.action('pause');
  assert.equal(s.frames.size, 0);
  assert.equal(s.effects.at(-1), false);
  s.game.setActive(false); s.game.setActive(true);
  assert.equal(s.frames.size, 0);
  s.action('resume'); s.tick(50000);
  s.tick(30000);
  s.game.setActive(false);
  assert.equal(s.saved.orders[0].remainingMs, 2952, 'long frame contributes at most three 16 ms steps');
  assert.equal(s.snapshot.score, 0);
  s.game.setActive(true);
  s.game.setMuted(true);
  assert.equal(s.effects.at(-1), false);
  assert.equal(s.frames.size, 1);
  s.game.dispose();
  assert.equal(s.frames.size, 0);
  assert.equal(s.effects.at(-1), 'disposed');
});

test('market HUD updates at most at 10 Hz between events and skips the hidden canvas', () => {
  const progress = createFishingGame({ random: () => 0 }).getProgress();
  progress.discoveredFishIds.push('sardine');
  progress.orders.push({ fishId: 'sardine', recipeId: 'basic', remainingMs: 4000 });
  const s = mount(new Map([[SAVE_KEY, JSON.stringify(progress)]]));
  s.action('start'); s.game.setReducedMotion(true); s.action('dock'); s.action('market');
  s.game.setReducedMotion(false); s.tick(); s.tick(); // Cast started.
  const { publishes, draws } = s;
  s.run(1000);
  assert(s.publishes - publishes <= 10);
  assert.equal(s.draws, draws);
  s.game.dispose();
});

test('boat and dock animate through a single frame loop without consuming cast time', () => {
  const s = mount();
  s.action('start'); s.tick(); s.run(10_800);
  const castTime = s.scene.timeMs;
  s.action('dock');
  assert.equal(s.snapshot.screen, 'crossing');
  assert.deepEqual(s.scene.crossing, { destination: 'dock', progress: 0 });
  s.run(200);
  assert.equal(s.scene.crossing.progress, 0, 'first arrival briefly gives the street image time to load');
  s.game.setDockImageReady();
  const { publishes } = s;
  s.run(CROSSING_MS / 2);
  assert.equal(s.scene.crossing.progress, .5);
  assert.equal(s.publishes, publishes, 'camera frames bypass the React HUD');
  s.action('market'); s.action('boat'); s.action('tap'); s.action('pause');
  s.game.setActive(false);
  assert.equal(s.frames.size, 0);
  s.game.setActive(true);
  s.tick(15000);
  assert.equal(s.scene.crossing.progress, .5, 'paused wall time does not move the camera');
  s.run(CROSSING_MS / 2);
  assert.equal(s.snapshot.screen, 'dock');
  assert.equal(s.scene.timeMs, castTime);
  assert.equal(s.snapshot.basket.count, 0);
  s.action('boat');
  assert.deepEqual(s.scene.crossing, { destination: 'boat', progress: 0 });
  s.run(CROSSING_MS);
  assert.equal(s.snapshot.screen, 'boat');
  assert.equal(s.scene.timeMs, castTime);
  s.run(1_350);
  assert.equal(s.snapshot.basket.count, 1);
  s.game.dispose();
});

test('dock navigation falls back on a slow image or reduces motion without waiting', () => {
  const s = mount();
  s.action('start'); s.tick();
  s.action('dock'); s.run(2500);
  assert.equal(s.snapshot.screen, 'dock');
  s.action('boat');
  assert.equal(s.snapshot.screen, 'crossing');
  s.game.setReducedMotion(true);
  assert.equal(s.snapshot.screen, 'boat');
  s.action('dock');
  assert.equal(s.snapshot.screen, 'dock');
  s.game.dispose();
  assert.equal(s.frames.size, 0);
});

test('dock and shops freeze the cast while sales finish, and purchased rods can be re-equipped', () => {
  const progress = createFishingGame({ random: () => 0 }).getProgress();
  progress.coins = 70;
  progress.discoveredFishIds.push('sardine');
  progress.orders.push({ fishId: 'sardine', recipeId: 'basic', remainingMs: 4000 });
  const disk = new Map([[SAVE_KEY, JSON.stringify(progress)]]);
  const s = mount(disk);
  s.game.setReducedMotion(true);
  s.action('start'); s.tick(); s.run(1500);
  s.action('dock'); s.run(11000);
  assert.equal(s.snapshot.screen, 'dock');
  assert.equal(s.snapshot.basket.count, 0);
  assert.equal(s.snapshot.coins, 75);
  s.action('market'); s.run(11000); s.action('dock');
  s.action('boat');
  assert.equal(s.snapshot.seconds, 10);
  assert.equal(s.scene.timeMs, 1500);
  s.action('dock'); s.action('tackle'); s.run(11000);
  s.game.dispatch({ type: 'upgrade', level: 3 });
  assert.equal(s.snapshot.coins, 75);
  s.game.dispatch({ type: 'upgrade', level: 2 });
  s.game.dispatch({ type: 'upgrade', level: 3 });
  assert.deepEqual(s.snapshot.rod, { owned: 3, equipped: 3 });
  assert.equal(s.scene.rodLevel, 3);
  s.game.dispatch({ type: 'equip', level: 2 });
  assert.equal(s.scene.rodLevel, 2);
  assert.equal(s.saved.equippedRodLevel, 2);
  assert.equal(s.snapshot.coins, 0);
  s.action('dock'); s.action('boat');
  s.run(16);
  assert.equal(s.snapshot.seconds, 9);
  assert.equal(s.snapshot.basket.count, 0);
  s.game.dispose();
  const restored = mount(disk);
  assert.deepEqual(restored.snapshot.rod, { owned: 3, equipped: 2 });
  restored.game.dispose();
});

test('the cast and reel use active time, and dock navigation waits until landing', () => {
  const s = mount();
  s.action('start');
  s.tick();
  s.run(176);
  assert.equal(s.scene.castAgeMs, 160);
  s.action('tap');
  assert.equal(s.scene.castAgeMs, 160, 'accelerating the countdown does not jump the cast');
  s.action('pause');
  assert.equal(s.frames.size, 0);
  s.action('resume');
  s.tick(5000);
  assert.equal(s.scene.castAgeMs, 160, 'resume does not catch up the animation');
  s.run(10_650 - 176);
  assert.equal(s.snapshot.reeling, true);
  assert.equal(s.scene.reelingFish, 'sardine');
  assert.equal(s.snapshot.basket.count, 0);
  s.action('dock');
  assert.equal(s.snapshot.screen, 'boat');
  s.game.setActive(false);
  assert.equal(s.frames.size, 0);
  s.game.setActive(true); s.tick(5000);
  assert.equal(s.snapshot.reeling, true, 'inactive time does not land the fish');
  s.run(1_100);
  assert.equal(s.snapshot.basket.count, 1);
  s.run(16);
  assert.ok(s.scene.castAgeMs < 0, 'next cast pose stays at rest while the fish is in the air');
  s.run(LAND_HOLD_MS - 16);
  assert.equal(s.scene.castAgeMs, 0);
  s.run(32);
  assert.equal(s.scene.castAgeMs, 32);
  s.game.dispose();
});

test('float impact, nibble, hook and landing fire once in order on the active boat clock', () => {
  const s = mount();
  s.action('start', true);
  s.tick();
  s.run(700);
  assert.equal(s.scene.impulse.kind, 'splash');
  s.run(10_360 - 700);
  assert.ok(!s.effects.includes('nibble'));
  s.action('pause');
  const paused = s.effects.length;
  assert.equal(s.frames.size, 0);
  assert.ok(!s.effects.slice(paused).includes('nibble'));
  s.action('resume');
  s.tick(5_000);
  assert.ok(!s.effects.includes('nibble'));
  s.run(120);
  assert.equal(s.scene.impulse.kind, 'nibble');
  s.run(520);
  assert.equal(s.scene.impulse.kind, 'bite');
  assert.equal(s.snapshot.basket.count, 0);
  s.run(1_100);
  assert.equal(s.snapshot.catchCard.fishId, 'sardine');
  assert.deepEqual(s.effects.filter(cue => ['splash', 'nibble', 'bite', 'record'].includes(cue)),
    ['splash', 'nibble', 'bite', 'record']);
  s.game.dispose();
});

test('rare fishing inputs give separate success, loss and final reel responses', () => {
  const s = mount(undefined, () => .78);
  s.action('start', true);
  s.tick();
  for (let i = 0; !s.snapshot.fight && i < 100; i++) s.run(300);
  assert.equal(s.scene.impulse.kind, 'strike');
  const first = s.snapshot.fight.key;
  s.game.dispatch({ type: 'fight', key: first });
  assert.equal(s.scene.impulse.kind, 'reel');
  assert.equal(s.snapshot.fight.progress, 1);
  s.game.dispatch({ type: 'fight', key: first });
  assert.equal(s.scene.impulse.kind, 'slip');
  assert.equal(s.snapshot.fight.progress, 0);
  for (let i = 0; i < 3; i++) s.game.dispatch({ type: 'fight', key: s.snapshot.fight.key });
  assert.equal(s.scene.impulse.kind, 'locked');
  assert.equal(s.snapshot.reeling, true);
  s.game.dispose();
});
