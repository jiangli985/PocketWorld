import assert from 'node:assert/strict';
import test from 'node:test';
import { FISH_CATALOG, RECIPE_CATALOG, ROD_CATALOG } from './catalog.ts';
import { createFishingGame } from './engine.ts';

function seed(value) {
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function progress(fishCounts = {}, overrides = {}) {
  return {
    version: 2, coins: 0, rodLevel: 1,
    fishCounts: Object.fromEntries(FISH_CATALOG.map(({ id }) => [id, fishCounts[id] ?? 0])),
    discoveredFishIds: Object.keys(fishCounts), orders: [], ...overrides,
  };
}

function play(options) {
  const game = createFishingGame({ random: () => 0, ...options });
  assert.equal(game.startTrip().ok, true);
  return game;
}

const sold = (fishId, recipeId, price, score, highScore = score) =>
  ({ type: 'order-sold', fishId, recipeId, price, score, highScore });
const caught = (fishId, firstDiscovery) => ({ type: 'fish-caught', fishId, firstDiscovery });
const rejected = (reason) => ({ ok: false, reason });

test('batch cooking reserves all ingredients, slots and proceeds before queuing portions', () => {
  const game = play({ progress: progress({ sardine: 3 }) });
  const before = game.getProgress();
  assert.deepEqual(game.queueOrder('sardine', 'grilled', 1.5), rejected('invalid-quantity'));
  assert.deepEqual(game.queueOrder('sardine', 'grilled', 4), rejected('queue-full'));
  assert.deepEqual(game.queueOrder('sardine', 'steamed', 2), rejected('ineligible-fish'));
  assert.deepEqual(game.getProgress(), before);

  const nearLimit = play({ progress: progress({ sardine: 2 }, { coins: Number.MAX_SAFE_INTEGER - 6 }) });
  assert.deepEqual(nearLimit.queueOrder('sardine', 'grilled', 2), rejected('balance-limit'));
  assert.equal(nearLimit.getSnapshot().fishCount, 2);

  assert.deepEqual(game.queueOrder('sardine', 'grilled', 2), {
    ok: true, events: [{ type: 'order-queued', fishId: 'sardine', recipeId: 'grilled', quantity: 2 }],
  });
  assert.equal(game.getSnapshot().fishCount, 1);
  assert.deepEqual(game.queueOrder('sardine', 'basic', 2), rejected('queue-full'));
  assert.deepEqual(game.advance(5_000, false), [sold('sardine', 'grilled', 6, 6)]);
  assert.deepEqual(game.queueOrder('sardine', 'basic', 2), rejected('no-fish'));
  assert.deepEqual(game.advance(5_000, false), [{
    ...sold('sardine', 'grilled', 6, 20), guest: { name: '修船的陈师傅', bonus: 8 },
  }]);
  assert.equal(game.getProgress().coins, 20);
});

test('guest orders advance only on matching completed dishes and respect paused sales', () => {
  const game = play({ progress: progress({ sardine: 3, 'sea-bass': 1, mackerel: 1, snapper: 1 }) });
  const ticket = () => {
    const { guestIndex, guestPortions } = game.getSnapshot();
    return [guestIndex, guestPortions];
  };
  game.queueOrder('sardine', 'basic');
  game.queueOrder('sardine', 'grilled', 2);
  assert.deepEqual(ticket(), [0, 0]);
  game.advance(9_000, false);
  assert.deepEqual(ticket(), [0, 1]);
  game.pause();
  assert.deepEqual(game.advance(5_000, false), []);
  assert.deepEqual(ticket(), [0, 1]);
  game.resume();
  const [second] = game.advance(5_000, false);
  assert.equal(second.guest.bonus, 8);
  assert.deepEqual(ticket(), [1, 0]);
  for (const [fish, recipe, bonus] of [
    ['sea-bass', 'gingerSeaBass', 7], ['mackerel', 'misoMackerel', 9], ['snapper', 'steamedSnapper', 15],
  ]) {
    assert.equal(game.queueOrder(fish, recipe).ok, true);
    assert.equal(game.advance(RECIPE_CATALOG[recipe].durationMs, false)[0].guest.bonus, bonus);
  }
  assert.deepEqual(ticket(), [4, 0]);
  assert.equal(game.getProgress().coins, 94);
  game.finishTrip();
  game.returnHome();
  game.startTrip();
  assert.deepEqual(ticket(), [0, 0]);
});

test('guest tips cannot spend balance reserved for another pending order', () => {
  const game = play({ progress: progress({ sardine: 3 }, { coins: Number.MAX_SAFE_INTEGER - 18 }) });
  game.queueOrder('sardine', 'grilled', 2);
  game.queueOrder('sardine', 'basic');
  const sales = game.advance(14_000, false);
  assert.equal(sales[1].guest.bonus, 1);
  assert.equal(game.getProgress().coins, Number.MAX_SAFE_INTEGER);
  assert.equal(game.getProgress().orders.length, 0);
});

test('two-fish dishes multiply ingredients per portion and pay per finished dish', () => {
  const game = play({ progress: progress({ squid: 3, sardine: 4 }) });
  const before = game.getProgress();
  assert.deepEqual(game.queueOrder('sardine', 'squidSkewers', 1), rejected('ineligible-fish'));
  assert.deepEqual(game.queueOrder('squid', 'squidSkewers', 2), rejected('no-fish'));
  assert.deepEqual(game.getProgress(), before);
  assert.equal(game.queueOrder('sardine', 'sardineRoll', 2).ok, true);
  assert.equal(game.getProgress().fishCounts.sardine, 0);
  assert.equal(game.queueOrder('squid', 'squidSkewers', 1).ok, true);
  assert.equal(game.getProgress().fishCounts.squid, 1);
  assert.deepEqual(game.advance(6_999, false), []);
  assert.deepEqual(game.advance(7_001, false), [sold('sardine', 'sardineRoll', 12, 12), sold('sardine', 'sardineRoll', 12, 24)]);
  assert.deepEqual(game.advance(12_000, false), [sold('squid', 'squidSkewers', 30, 54)]);
});

test('a new trip starts empty and catches once at the exact end of reeling', () => {
  let draws = 0;
  const game = createFishingGame({ random: () => { draws++; return 0; } });
  assert.deepEqual(game.getSnapshot(), {
    phase: 'home', active: true, progress: progress(), fishCount: 0, cast: { phase: 'idle' },
    tapCooldownMs: 0, score: 0, highScore: 0, guestIndex: 0, guestPortions: 0, result: null,
  });
  assert.deepEqual(game.advance(60_000), []);
  assert.deepEqual(game.startTrip(), { ok: true, events: [{ type: 'trip-started', score: 0, highScore: 0 }] });
  for (const invalid of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(game.advance(invalid), []);
  }
  assert.equal(draws, 0);
  assert.deepEqual(game.advance(10_999), [{ type: 'cast-started', waitMs: 11_000, rodLevel: 1 }]);
  assert.equal(game.getSnapshot().cast.remainingMs, 1);
  assert.deepEqual(game.advance(1), [{ type: 'bite', durationMs: 1_100 }]);
  assert.deepEqual(game.getSnapshot().cast, { phase: 'reeling', remainingMs: 1_100, fishId: 'sardine' });
  assert.deepEqual(game.advance(1_099), []);
  assert.equal(draws, 2);
  assert.equal(game.getSnapshot().fishCount, 0);
  assert.deepEqual(game.advance(1), [caught('sardine', true)]);
  assert.equal(draws, 2);
  assert.deepEqual(game.getProgress().discoveredFishIds, ['sardine']);
  assert.equal(game.advance(12_100).at(-1).firstDiscovery, false);
  assert.equal(game.getProgress().fishCounts.sardine, 2);
  assert.equal(game.getSnapshot().score, 0);
});

test('catalog weights, exact cutoff selection, and inclusive wait bounds at each level', () => {
  assert.deepEqual(FISH_CATALOG.map(({ id, weight }) => [id, weight]), [
    ['sardine', 22], ['anchovy', 20], ['mackerel', 16], ['herring', 14],
    ['sea-bass', 10], ['snapper', 8], ['squid', 6], ['bluefin', 4],
    ['flying-fish', 8], ['yellow-croaker', 7], ['flatfish', 6], ['lanternfish', 4],
  ]);
  const starts = [0, 22, 42, 58, 72, 82, 90, 96, 100, 108, 115, 121].map(weight => weight / 125);
  const nearOne = 1 - Number.EPSILON;
  assert.equal(new Set(FISH_CATALOG.map(fish => fish.extraWaitMs)).size, FISH_CATALOG.length);
  assert.equal(new Set(FISH_CATALOG.map(fish => fish.reelMs)).size, FISH_CATALOG.length);
  for (const [level, min, max] of [[1, 10_000, 14_000], [2, 8_000, 11_000], [3, 7_000, 9_000]]) {
    for (const [i, { id, rarity, extraWaitMs, reelMs }] of FISH_CATALOG.entries()) {
      const upper = starts[i + 1] ?? 1;
      for (const [waitRoll, base, fishRoll] of [[0, min, starts[i]], [nearOne, max, upper - Number.EPSILON]]) {
        const durationMs = reelMs + (waitRoll === nearOne ? 600 : 0);
        const rolls = [waitRoll, fishRoll];
        const game = play({ random: () => rolls.shift() ?? 0, progress: progress({}, { rodLevel: level }) });
        const waitMs = base + extraWaitMs - (rarity === '稀有' && level === 3 ? 2_000 : 0);
        assert.deepEqual(game.advance(waitMs - 1), [{ type: 'cast-started', waitMs, rodLevel: level }]);
        if (rarity === '稀有') {
          assert.deepEqual(game.advance(1), [{ type: 'fight-started' }]);
          let result;
          for (let n = 0; n < 3; n++) result = game.fight(game.getSnapshot().cast.key);
          assert.deepEqual(result.events, [{ type: 'reel-started', durationMs }]);
        } else assert.deepEqual(game.advance(1), [{ type: 'bite', durationMs }]);
        assert.deepEqual(game.getSnapshot().cast, { phase: 'reeling', remainingMs: durationMs, fishId: id });
        assert.deepEqual(game.advance(durationMs - 1), []);
        assert.equal(game.getSnapshot().fishCount, 0);
        assert.deepEqual(game.advance(1), [caught(id, true)]);
        assert.equal(rolls.length, 0);
      }
    }
  }
});

test('bait changes the next cast, and a heavier specimen takes longer and updates career', () => {
  function land(bait) {
    const rolls = [0, .12];
    const game = play({ random: () => rolls.shift() ?? 0, progress: progress({}, { coins: 20 }) });
    game.selectBait(bait);
    const [{ waitMs }] = game.advance(1);
    const [{ durationMs }] = game.advance(waitMs - 1);
    assert.equal(game.getSnapshot().lastCatch, undefined);
    game.advance(durationMs);
    return { game, waitMs, durationMs, card: game.getSnapshot().lastCatch };
  }
  const bare = land('none');
  const heavy = land('fish');
  const quick = land('shrimp');
  assert.equal(quick.waitMs, bare.waitMs - 1_500);
  assert.equal(heavy.card.fishId, bare.card.fishId);
  assert(heavy.card.grams > bare.card.grams);
  assert.equal(heavy.durationMs, bare.durationMs + 600);
  assert.deepEqual(heavy.game.getProgress().angling, {
    bait: 'fish', stock: { shrimp: 3, fish: 2 }, counts: { sardine: 1 },
    best: { fishId: 'sardine', grams: heavy.card.grams },
  });
  assert.equal(heavy.game.buyBait('fish').ok, true);
  assert.equal(heavy.game.getProgress().coins, 8);
  assert.equal(heavy.game.getProgress().angling.stock.fish, 7);
  assert.equal(heavy.game.buyBait('fish').ok, false);
  heavy.game.advance(12_100);
  assert.equal(heavy.game.getSnapshot().lastCatch.record, false);
  assert.equal(heavy.game.getProgress().angling.counts.sardine, 2);
  assert.equal(heavy.game.getProgress().angling.best.grams, heavy.card.grams);
});

test('taps enforce active-time cooldown and the 30% per-cast limit', () => {
  const game = play();
  assert.deepEqual(game.tapRod(), rejected('not-waiting'));
  game.advance(1);
  const tap = (reducedMs) => assert.deepEqual(game.tapRod(), {
    ok: true, events: [{ type: 'rod-tapped', reducedMs }],
  });
  tap(350);
  assert.deepEqual(game.tapRod(), rejected('tap-cooldown'));
  game.advance(249);
  game.pause();
  assert.deepEqual(game.advance(60_000), []);
  assert.equal(game.getSnapshot().tapCooldownMs, 1);
  assert.deepEqual(game.tapRod(), rejected('wrong-phase'));
  game.resume();
  assert.deepEqual(game.tapRod(), rejected('tap-cooldown'));
  game.advance(1);
  for (let i = 0; i < 8; i++) {
    tap(350);
    game.advance(250);
  }
  tap(150);
  game.advance(250);
  assert.deepEqual(game.tapRod(), rejected('tap-limit'));
  assert.equal(game.getSnapshot().cast.tappedMs, 3_300);
  assert.equal(game.getSnapshot().cast.remainingMs, 5_199);

  const lateTap = play();
  lateTap.advance(10_999);
  assert.deepEqual(lateTap.tapRod(), { ok: true, events: [{ type: 'rod-tapped', reducedMs: 1 }, { type: 'bite', durationMs: 1_100 }] });
  assert.deepEqual(lateTap.tapRod(), rejected('not-waiting'));
  assert.deepEqual(lateTap.advance(1_100), [caught('sardine', true)]);
  lateTap.advance(1);
  assert.equal(lateTap.getSnapshot().cast.tappedMs, 0);
});

test('a full basket takes no random draws and frees the next cast only on positive time', () => {
  let draws = 0;
  const game = play({ random: () => { draws++; return 0; }, progress: progress({ sardine: 31 }) });
  assert.equal(game.advance(30 * 60_000).filter(({ type }) => type === 'fish-caught').length, 1);
  assert.equal(draws, 2);
  assert.equal(game.getSnapshot().fishCount, 32);
  assert.deepEqual(game.getSnapshot().cast, { phase: 'full' });
  assert.deepEqual(game.tapRod(), rejected('not-waiting'));
  assert.deepEqual(game.advance(100_000), []);
  assert.equal(draws, 2);
  assert.equal(game.queueOrder('sardine', 'basic').ok, true);
  assert.deepEqual(game.getSnapshot().cast, { phase: 'idle' });
  assert.deepEqual(game.advance(0), []);
  assert.equal(draws, 2);
  assert.deepEqual(game.advance(1), [{ type: 'cast-started', waitMs: 11_000, rodLevel: 1 }]);
  assert.equal(draws, 4);
});

test('orders validate before debiting fish and pay once in FIFO order', () => {
  const game = play({ progress: progress({ sardine: 2, bluefin: 1, snapper: 1 }) });
  const before = game.getProgress();
  assert.deepEqual(game.queueOrder('sardine', 'special'), rejected('ineligible-fish'));
  assert.deepEqual(game.queueOrder('mackerel', 'basic'), rejected('no-fish'));
  assert.deepEqual(game.queueOrder('__proto__', 'basic'), rejected('unknown-fish'));
  assert.deepEqual(game.queueOrder('sardine', 'toString'), rejected('unknown-recipe'));
  assert.deepEqual(game.getProgress(), before);
  assert.deepEqual(game.queueOrder('bluefin', 'special'), {
    ok: true, events: [{ type: 'order-queued', fishId: 'bluefin', recipeId: 'special' }],
  });
  assert.equal(game.queueOrder('sardine', 'basic').ok, true);
  assert.equal(game.queueOrder('snapper', 'special').ok, true);
  const queued = game.getProgress();
  assert.deepEqual(queued.fishCounts, progress({ sardine: 1 }).fishCounts);
  assert.deepEqual(game.queueOrder('sardine', 'basic'), rejected('queue-full'));
  assert.deepEqual(game.getProgress(), queued);
  game.advance(5_999);
  assert.deepEqual(game.getProgress().orders.map(({ remainingMs }) => remainingMs), [1, 4_000, 6_000]);
  assert.equal(game.getProgress().coins, 0);
  assert.deepEqual(game.advance(1), [sold('bluefin', 'special', 11, 11)]);
  const sales = game.advance(10_000).filter(({ type }) => type === 'order-sold');
  assert.deepEqual(sales, [sold('sardine', 'basic', 5, 16), sold('snapper', 'special', 11, 27)]);
  assert.deepEqual(game.getProgress().orders, []);
  assert.equal(game.getProgress().coins, 27);
  assert.equal(game.getSnapshot().score, 27);
  assert.equal(game.advance(60_000).some(({ type }) => type === 'order-sold'), false);
  assert.equal(game.getProgress().coins, 27);
});

test('four basic sales fund Lv.2 and upgrades affect only the next cast, not the score', () => {
  const game = play({ progress: progress({ sardine: 4 }) });
  assert.deepEqual(game.upgradeRod(), rejected('not-enough-coins'));
  for (let i = 0; i < 3; i++) assert.equal(game.queueOrder('sardine', 'basic').ok, true);
  game.advance(4_000);
  assert.equal(game.queueOrder('sardine', 'basic').ok, true);
  game.advance(11_999);
  assert.equal(game.getProgress().coins, 15);
  assert.deepEqual(game.upgradeRod(), rejected('not-enough-coins'));
  game.advance(1);
  const cast = game.getSnapshot().cast;
  assert.equal(cast.rodLevel, 1);
  assert.deepEqual(game.upgradeRod(), { ok: true, events: [{ type: 'rod-upgraded', rodLevel: 2, cost: 20 }] });
  assert.deepEqual(game.getSnapshot().cast, cast);
  assert.equal(game.getProgress().coins, 0);
  assert.equal(game.getSnapshot().score, 20);
  assert.equal(game.getSnapshot().highScore, 20);
  game.advance(cast.remainingMs + 1_100);
  assert.deepEqual(game.advance(1), [{ type: 'cast-started', waitMs: 9_000, rodLevel: 2 }]);
  assert.deepEqual(game.finishTrip(), { ok: true, events: [{ type: 'trip-finished', result: { score: 20, highScore: 20, victory: true } }] });

  const lv3 = play({ progress: progress({}, { coins: 75 }) });
  assert.equal(lv3.upgradeRod().ok, true);
  assert.deepEqual(lv3.upgradeRod(), { ok: true, events: [{ type: 'rod-upgraded', rodLevel: 3, cost: 55 }] });
  assert.equal(lv3.getProgress().coins, 0);
  assert.deepEqual(lv3.upgradeRod(), rejected('max-rod-level'));
  assert.deepEqual(lv3.advance(1), [{ type: 'cast-started', waitMs: 8_000, rodLevel: 3 }]);
});

test('external and internal pause freeze the timers; finish from pause is one-shot', () => {
  const game = play({ highScore: 33, progress: progress({ squid: 1 }) });
  game.queueOrder('squid', 'special');
  game.advance(5_990);
  const running = game.getSnapshot();
  game.setActive(false);
  assert.deepEqual(game.advance(90_000), []);
  assert.deepEqual(game.getSnapshot(), { ...running, active: false });
  assert.deepEqual(game.tapRod(), rejected('inactive'));
  assert.deepEqual(game.finishTrip(), rejected('inactive'));
  game.setActive(true);
  assert.deepEqual(game.getSnapshot(), running);
  game.pause();
  game.setActive(false);
  game.setActive(true);
  assert.deepEqual(game.advance(90_000), []);
  assert.deepEqual(game.getSnapshot(), { ...running, phase: 'paused' });
  game.resume();
  assert.deepEqual(game.advance(9), []);
  assert.deepEqual(game.advance(1), [sold('squid', 'special', 11, 11, 33)]);
  game.advance(6_100);
  game.queueOrder('sardine', 'basic');
  game.advance(1_000);
  game.pause();
  const saved = game.getProgress();
  const { events: [finished] } = game.finishTrip();
  assert.deepEqual(finished, { type: 'trip-finished', result: { score: 11, highScore: 33, victory: false } });
  assert.deepEqual(game.finishTrip(), rejected('wrong-phase'));
  assert.deepEqual(game.startTrip(), rejected('wrong-phase'));
  assert.deepEqual(game.advance(90_000), []);
  assert.equal(game.returnHome().ok, true);
  assert.deepEqual(game.advance(90_000), []);
  assert.deepEqual(game.getProgress(), saved);
  assert.deepEqual(game.startTrip(), { ok: true, events: [{ type: 'trip-started', score: 0, highScore: 33 }] });
  assert.equal(game.getSnapshot().result, null);
  assert.equal(game.getSnapshot().cast.phase, 'idle');
  assert.equal(game.advance(2_999).some(({ type }) => type === 'order-sold'), false);
  assert.deepEqual(game.advance(1), [sold('sardine', 'basic', 5, 5, 33)]);
});

test('coincident deadlines keep sale-before-catch order under different step partitions', () => {
  function setup() {
    const game = play({ random: seed(1234), progress: progress({ snapper: 1 }) });
    const [{ waitMs }] = game.advance(1);
    game.advance(waitMs + 900 - 4_000 - 1);
    assert.equal(game.queueOrder('snapper', 'basic').ok, true);
    return game;
  }
  const whole = setup();
  const split = setup();
  const events = whole.advance(4_000);
  assert.deepEqual(events.map(({ type }) => type), ['bite', 'order-sold', 'fish-caught']);
  assert.deepEqual(events, [...split.advance(1_337), ...split.advance(1_763), ...split.advance(899), ...split.advance(1)]);
  const later = whole.advance(400_000);
  const splitLater = [];
  for (let remaining = 400_000; remaining > 0;) {
    const elapsed = Math.min(997, remaining);
    splitLater.push(...split.advance(elapsed));
    remaining -= elapsed;
  }
  assert.deepEqual(later, splitLater);
  assert.deepEqual(whole.getSnapshot(), split.getSnapshot());
});

test('progress is detached from callers, resumes an unpaid head, and cannot repay a sold order', () => {
  const initial = progress({ squid: 1 }, { coins: 9, rodLevel: 2 });
  const game = play({ progress: initial });
  initial.fishCounts.squid = 0;
  initial.discoveredFishIds.length = 0;
  assert.equal(game.queueOrder('squid', 'special').ok, true);
  game.advance(1_234);
  const snapshot = game.getSnapshot();
  const save = JSON.parse(JSON.stringify(game.getProgress()));
  snapshot.progress.orders[0].remainingMs = 1;
  snapshot.progress.fishCounts.squid = 99;
  snapshot.cast.remainingMs = 1;
  assert.deepEqual(game.getProgress(), save);
  assert.equal(game.getSnapshot().cast.remainingMs, 9_000 - 1_234);
  assert.deepEqual(save, progress({}, {
    coins: 9, rodLevel: 2, discoveredFishIds: ['squid'], orders: [{ fishId: 'squid', recipeId: 'special', remainingMs: 4_766 }],
  }));
  const restored = play({ progress: save });
  save.orders.length = 0;
  restored.advance(4_765);
  assert.equal(restored.getProgress().coins, 9);
  assert.deepEqual(restored.advance(1), [sold('squid', 'special', 11, 11)]);
  assert.deepEqual(restored.getProgress().orders, []);
  assert.equal(restored.getProgress().fishCounts.squid, 0);
  const reloaded = play({ progress: restored.getProgress(), highScore: restored.getSnapshot().highScore });
  reloaded.advance(20_000);
  assert.equal(reloaded.getProgress().coins, 20);
  assert.equal(reloaded.getSnapshot().score, 0);
  assert.equal(reloaded.getSnapshot().highScore, 11);
});

test('accepted sales reserve exact safe integer credit even near the balance limit', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const game = play({ progress: progress({ sardine: 2 }, { coins: max - 5 }) });
  assert.equal(game.queueOrder('sardine', 'basic').ok, true);
  const before = game.getProgress();
  assert.deepEqual(game.queueOrder('sardine', 'basic'), rejected('balance-limit'));
  assert.deepEqual(game.getProgress(), before);
  assert.deepEqual(game.advance(4_000).at(-1), sold('sardine', 'basic', 5, 5));
  assert.equal(game.getProgress().coins, max);
  assert.equal(game.upgradeRod().ok, true);
  assert.equal(game.queueOrder('sardine', 'basic').ok, true);
});

test('seeded 30-minute active run keeps the basket, queue, discoveries and ledger bounded', () => {
  const game = play({ random: seed(0xc0ffee) });
  const input = seed(0x12345678);
  const counts = { ...progress().fishCounts };
  const seen = new Set();
  const queued = [];
  let coins = 0;
  let revenue = 0;
  let rodLevel = 1;
  let sales = 0;
  let catches = 0;
  const observe = (events) => {
    for (const event of events) {
      switch (event.type) {
        case 'fish-caught':
          assert.equal(event.firstDiscovery, !seen.has(event.fishId));
          seen.add(event.fishId);
          counts[event.fishId]++;
          catches++;
          break;
        case 'order-queued':
          counts[event.fishId]--;
          queued.push([event.fishId, event.recipeId]);
          break;
        case 'order-sold': {
          assert.deepEqual(queued.shift(), [event.fishId, event.recipeId]);
          const price = RECIPE_CATALOG[event.recipeId].price;
          assert.equal(event.price, price);
          coins += price;
          revenue += price;
          sales++;
          assert.equal(event.score, revenue);
          assert.equal(event.highScore, revenue);
          break;
        }
        case 'rod-upgraded':
          rodLevel++;
          assert.equal(event.rodLevel, rodLevel);
          assert.equal(event.cost, ROD_CATALOG[rodLevel].upgradeCost);
          coins -= event.cost;
          break;
      }
    }
  };
  let remaining = 30 * 60_000;
  const idleWarmup = 700_000;
  observe(game.advance(idleWarmup));
  remaining -= idleWarmup;
  assert.equal(game.getSnapshot().fishCount, 32);
  while (remaining > 0) {
    const elapsed = Math.min(1 + Math.floor(input() * 997), remaining);
    remaining -= elapsed;
    observe(game.advance(elapsed));
    const fight = game.getSnapshot().cast;
    if (fight.phase === 'fight') observe(game.fight(fight.key).events);
    const roll = input();
    if (roll < 0.5) game.tapRod();
    if (roll < 0.25) {
      const available = FISH_CATALOG.filter(({ id }) => counts[id] > 0);
      if (available.length > 0) {
        const fish = available[Math.floor(input() * available.length)];
        const result = game.queueOrder(fish.id, RECIPE_CATALOG.special.fishIds.includes(fish.id) ? 'special' : 'basic');
        if (result.ok) observe(result.events);
      }
    }
    if (roll > 0.95) {
      const result = game.upgradeRod();
      if (result.ok) observe(result.events);
    }
    const state = game.getSnapshot();
    const { progress: saved } = state;
    assert.deepEqual(saved.fishCounts, counts);
    assert.ok(Object.values(counts).every((count) => Number.isSafeInteger(count) && count >= 0));
    assert.equal(state.fishCount, Object.values(counts).reduce((a, b) => a + b, 0));
    assert.ok(state.fishCount <= 32);
    assert.ok(saved.orders.length <= 3);
    assert.deepEqual(saved.orders.map(({ fishId, recipeId }) => [fishId, recipeId]), queued);
    for (const [i, order] of saved.orders.entries()) {
      const duration = RECIPE_CATALOG[order.recipeId].durationMs;
      assert.ok(order.remainingMs > 0 && order.remainingMs <= duration);
      if (i > 0) assert.equal(order.remainingMs, duration);
    }
    assert.equal(saved.coins, coins);
    assert.ok(coins >= 0);
    assert.equal(saved.rodLevel, rodLevel);
    assert.equal(state.score, revenue);
    assert.equal(state.highScore, revenue);
    assert.deepEqual(saved.discoveredFishIds, FISH_CATALOG.filter(({ id }) => seen.has(id)).map(({ id }) => id));
    assert.ok(saved.discoveredFishIds.length <= FISH_CATALOG.length);
    assert.equal(catches, state.fishCount + queued.length + sales);
  }
  assert.ok(catches > 70 && sales > 70);
  assert.equal(rodLevel, 3);
  assert.equal(game.getSnapshot().phase, 'playing');
  assert.equal(game.finishTrip().events[0].result.victory, true);
});

test('rare prompt rotates, misses cost progress, and paused time cannot land or lose a fish', () => {
  const rolls = [0, .75, 0, .99, .5, 0, 0];
  const game = play({ random: () => rolls.shift() ?? 0 });
  game.advance(17_000);
  assert.deepEqual(game.getSnapshot().cast, { phase: 'fight', remainingMs: 8000, key: 'D', progress: 0 });
  assert.deepEqual(game.fight('D').events, [{ type: 'fight-hit' }]);
  assert.equal(game.getSnapshot().cast.key, 'Y');
  assert.deepEqual(game.fight('D').events, [{ type: 'fight-miss' }]);
  assert.equal(game.getSnapshot().cast.progress, 0);
  game.advance(7_000);
  game.pause(); game.advance(60_000);
  assert.equal(game.fight('Y').ok, false);
  assert.equal(game.getSnapshot().cast.remainingMs, 1_000);
  game.resume(); game.setActive(false); game.advance(60_000);
  assert.equal(game.fight('Y').ok, false);
  game.setActive(true);
  for (let n = 0; n < 3; n++) {
    const { key } = game.getSnapshot().cast;
    const result = game.fight(key);
    if (n === 2) assert.deepEqual(result.events, [{ type: 'reel-started', durationMs: 2_850 }]);
    else assert.notEqual(game.getSnapshot().cast.key, key);
  }
  game.pause();
  assert.deepEqual(game.advance(5_000), []);
  game.resume();
  assert.deepEqual(game.advance(2_849), []);
  assert.deepEqual(game.advance(1), [caught('squid', true)]);
  assert.equal(game.getProgress().fishCounts.squid, 1);
});

test('an unattended rare encounter escapes at the deadline and the next cast still starts', () => {
  const rolls = [0, .99, .5, 0, 0];
  const game = play({ random: () => rolls.shift() ?? 0 });
  game.advance(26_499);
  assert.equal(game.getSnapshot().cast.remainingMs, 1);
  assert.deepEqual(game.advance(1), [{ type: 'fish-escaped' }]);
  assert.deepEqual(game.getProgress(), progress());
  assert.deepEqual(game.advance(12_100).at(-1), caught('sardine', true));
});
