import {
  FISH_CAPACITY, FISH_CATALOG, GUEST_ORDERS, ORDER_CAPACITY, RECIPE_CATALOG, ROD_CATALOG,
  TAP_MAX_PERCENT, TAP_REDUCTION_MS, TRIP_TARGET_SCORE, FIGHT_KEYS, FIGHT_MS, FIGHT_GOAL,
  isRecipeId, type FishId, type RecipeId, type RodLevel,
  BAITS, BAIT_LIMIT, BAIT_PACK, BAIT_SAMPLES, CAREER_LIMIT, FISH_MASS, HEAVY_REEL_EXTRA_MS, isBaitId,
  type BaitId,
} from './catalog.ts';
import type {
  ActionResult, CastSnapshot, FishingEvent, FishingGame, FishingOptions, FishingOrder,
  FishingProgress, RejectionReason, TripPhase, TripResult, CatchCard,
} from './model.ts';

type Cast =
  | { phase: 'waiting'; remainingMs: number; originalWaitMs: number; tappedMs: number; rodLevel: RodLevel }
  | { phase: 'reeling'; remainingMs: number; fishId: FishId }
  | { phase: 'fight'; remainingMs: number; key: string; progress: number };

type PendingOrder = { -readonly [K in keyof FishingOrder]: FishingOrder[K] };

const totalWeight = FISH_CATALOG.reduce((total, fish) => total + fish.weight, 0);
const accept = (...events: FishingEvent[]): ActionResult => ({ ok: true, events });
const reject = (reason: RejectionReason): ActionResult => ({ ok: false, reason });

function pendingRevenue(orders: readonly FishingOrder[]) {
  return orders.reduce((total, order) => total + RECIPE_CATALOG[order.recipeId].price, 0);
}

/** Pure simulation, with no scheduling, platform APIs, or storage. See FishingGame for the host API. */
export function createFishingGame({ random, progress, highScore: initialHighScore = 0 }: FishingOptions): FishingGame {
  const fishCounts = Object.fromEntries(FISH_CATALOG.map(({ id }) => [id, progress?.fishCounts[id] ?? 0])) as Record<FishId, number>;
  let fishCount = FISH_CATALOG.reduce((total, { id }) => total + fishCounts[id], 0);
  const discovered = new Set(progress?.discoveredFishIds);
  const orders: PendingOrder[] = progress?.orders.map(order => ({ ...order })) ?? [];
  let coins = progress?.coins ?? 0;
  let rodLevel = progress?.rodLevel ?? 1;
  let equipped = progress?.equippedRodLevel ?? rodLevel;
  if (!Number.isSafeInteger(coins) || coins < 0 || coins > Number.MAX_SAFE_INTEGER - pendingRevenue(orders)) {
    throw new RangeError('Invalid saved coin balance');
  }
  let score = 0;
  let guestIndex = 0;
  let guestPortions = 0;
  let highScore = Number.isSafeInteger(initialHighScore) && initialHighScore >= 0 ? initialHighScore : 0;
  let phase: TripPhase = 'home';
  let active = true;
  let result: TripResult | null = null;
  let cast: Cast | null = null;
  let target: typeof FISH_CATALOG[number] = FISH_CATALOG[0];
  let targetGrams: number = FISH_MASS.sardine[0];
  let massQuantile = 0;
  let castBait: BaitId = 'none';
  let selectedBait = progress?.angling?.bait ?? 'none';
  const baitStock = { ...(progress?.angling?.stock ?? BAIT_SAMPLES) };
  const careerCounts = { ...progress?.angling?.counts };
  let best = progress?.angling?.best;
  let anglingChanged = !!progress?.angling;
  let lastCatch: CatchCard | undefined;
  let tapCooldownMs = 0;

  function getProgress(): FishingProgress {
    return {
      version: 2, coins, rodLevel,
      ...(equipped !== rodLevel && { equippedRodLevel: equipped }),
      fishCounts: { ...fishCounts },
      discoveredFishIds: FISH_CATALOG.flatMap(({ id }) => discovered.has(id) ? [id] : []),
      orders: orders.map(order => ({ ...order })),
      ...(anglingChanged && { angling: {
        bait: selectedBait, stock: { ...baitStock }, counts: { ...careerCounts },
        ...(best && { best: { ...best } }),
      } }),
    };
  }

  function getCast(): CastSnapshot {
    return cast ? { ...cast } : { phase: fishCount >= FISH_CAPACITY ? 'full' : 'idle' };
  }

  function blocked(...allowed: TripPhase[]): RejectionReason | undefined {
    if (!active) return 'inactive';
    if (!allowed.includes(phase)) return 'wrong-phase';
  }

  function draw() {
    const value = random();
    if (!(value >= 0 && value < 1)) throw new RangeError('Fishing random source must return a value in [0, 1)');
    return value;
  }

  function startCast(events: FishingEvent[]) {
    const { minWaitMs, maxWaitMs, rareBonusMs } = ROD_CATALOG[equipped];
    const base = minWaitMs + Math.floor(draw() * (maxWaitMs - minWaitMs + 1));
    const roll = draw();
    let weight = 0;
    target = FISH_CATALOG.find(fish => roll < (weight += fish.weight) / totalWeight)!;
    castBait = selectedBait !== 'none' && baitStock[selectedBait] > 0 ? selectedBait : 'none';
    if (castBait !== 'none') {
      baitStock[castBait]--;
      if (!baitStock[castBait]) selectedBait = 'none';
      anglingChanged = true;
    }
    const bait = BAITS[castBait];
    // Conditional on the species, the roll's position inside its band is uniform.
    const position = Math.max(0, Math.min(1, (roll * totalWeight - (weight - target.weight)) / target.weight));
    massQuantile = position ** bait.massPower;
    const [minGrams, maxGrams] = FISH_MASS[target.id];
    targetGrams = Math.round(minGrams + (maxGrams - minGrams) * massQuantile);
    const waitMs = base + target.extraWaitMs - (target.rarity === '稀有' ? rareBonusMs : 0) - bait.speedMs;
    cast = { phase: 'waiting', remainingMs: waitMs, originalWaitMs: waitMs, tappedMs: 0, rodLevel: equipped };
    events.push({ type: 'cast-started', waitMs, rodLevel: equipped, ...(castBait !== 'none' && { bait: castBait }) });
  }

  function nextKey(previous = '') {
    const pool = FIGHT_KEYS.replace(previous, '');
    return pool[Math.floor(draw() * pool.length)];
  }

  function startBite(events: FishingEvent[]) {
    if (target.rarity === '稀有') {
      cast = { phase: 'fight', remainingMs: FIGHT_MS, key: nextKey(), progress: 0 };
      events.push({ type: 'fight-started' });
    } else {
      events.push(startReeling('bite'));
    }
  }

  function startReeling(type: 'bite' | 'reel-started'): FishingEvent {
    const durationMs = target.reelMs + (massQuantile >= .8 ? HEAVY_REEL_EXTRA_MS : 0);
    cast = { phase: 'reeling', remainingMs: durationMs, fishId: target.id };
    return { type, durationMs };
  }

  function catchFish(): FishingEvent {
    const { id } = target;
    const firstDiscovery = !discovered.has(id);
    discovered.add(id);
    fishCounts[id]++;
    fishCount++;
    const record = !best || targetGrams > best.grams;
    if (record) best = { fishId: id, grams: targetGrams };
    careerCounts[id] = Math.min(CAREER_LIMIT, (careerCounts[id] ?? 0) + 1);
    lastCatch = { fishId: id, grams: targetGrams, bait: castBait, record, firstDiscovery };
    anglingChanged = true;
    cast = null;
    return { type: 'fish-caught', fishId: id, firstDiscovery };
  }

  function sellOrder(order: FishingOrder, events: FishingEvent[]) {
    const { price } = RECIPE_CATALOG[order.recipeId];
    orders.shift();
    coins += price;
    score += price;
    const ticket = GUEST_ORDERS[guestIndex];
    let guest: { name: string; bonus: number } | undefined;
    if (ticket?.recipes.includes(order.recipeId) && ++guestPortions === ticket.portions) {
      // Tips must leave room for all recipes whose base prices are already reserved.
      const room = Number.MAX_SAFE_INTEGER - pendingRevenue(orders) - Math.max(coins, score);
      const bonus = Math.min(ticket.bonus, room);
      coins += bonus;
      score += bonus;
      guest = { name: ticket.guest, bonus };
      guestIndex++;
      guestPortions = 0;
    }
    highScore = Math.max(highScore, score);
    events.push({ type: 'order-sold', fishId: order.fishId, recipeId: order.recipeId, price, score, highScore, ...(guest && { guest }) });
  }

  return {
    getProgress,
    getSnapshot() {
      return {
        phase, active, progress: getProgress(), fishCount, cast: getCast(), tapCooldownMs,
        score, highScore, guestIndex, guestPortions, result: result && { ...result },
        ...(lastCatch && { lastCatch: { ...lastCatch } }),
      };
    },
    setActive(value) { active = value; },
    startTrip() {
      const reason = blocked('home');
      if (reason) return reject(reason);
      phase = 'playing';
      score = 0;
      guestIndex = guestPortions = 0;
      lastCatch = undefined;
      return accept({ type: 'trip-started', score, highScore });
    },
    pause() {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      phase = 'paused';
      return accept();
    },
    resume() {
      const reason = blocked('paused');
      if (reason) return reject(reason);
      phase = 'playing';
      return accept();
    },
    finishTrip() {
      const reason = blocked('playing', 'paused');
      if (reason) return reject(reason);
      phase = 'settled';
      cast = null;
      tapCooldownMs = 0;
      result = { score, highScore, victory: score >= TRIP_TARGET_SCORE };
      return accept({ type: 'trip-finished', result: { ...result } });
    },
    returnHome() {
      const reason = blocked('settled');
      if (reason) return reject(reason);
      phase = 'home';
      result = null;
      return accept();
    },
    advance(deltaMs, fishing = true) {
      const events: FishingEvent[] = [];
      if (!active || phase !== 'playing' || !Number.isSafeInteger(deltaMs) || deltaMs <= 0 || deltaMs > 1_800_000) return events;
      // Bound the work even if every cast times out without filling the basket.
      while (deltaMs > 0) {
        if (fishing && !cast && fishCount < FISH_CAPACITY) startCast(events);
        const order = orders[0];
        const elapsed = Math.min(deltaMs, fishing ? cast?.remainingMs ?? Infinity : Infinity, order?.remainingMs ?? Infinity);
        deltaMs -= elapsed;
        if (order) order.remainingMs -= elapsed;
        // At a shared deadline the sale event precedes fishing feedback.
        if (order?.remainingMs === 0) sellOrder(order, events);
        if (!fishing) continue;
        tapCooldownMs = Math.max(0, tapCooldownMs - elapsed);
        if (cast && (cast.remainingMs -= elapsed) === 0) {
          if (cast.phase === 'waiting') startBite(events);
          else if (cast.phase === 'fight') { cast = null; events.push({ type: 'fish-escaped' }); }
          else events.push(catchFish());
        }
      }
      return events;
    },
    tapRod() {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      if (cast?.phase !== 'waiting') return reject('not-waiting');
      if (tapCooldownMs > 0) return reject('tap-cooldown');
      const budget = Math.floor(cast.originalWaitMs * TAP_MAX_PERCENT / 100) - cast.tappedMs;
      if (budget <= 0) return reject('tap-limit');
      const reducedMs = Math.min(TAP_REDUCTION_MS, cast.remainingMs, budget);
      cast.tappedMs += reducedMs;
      cast.remainingMs -= reducedMs;
      tapCooldownMs = ROD_CATALOG[cast.rodLevel].tapCooldownMs;
      const events: FishingEvent[] = [{ type: 'rod-tapped', reducedMs }];
      if (cast.remainingMs === 0) startBite(events);
      return accept(...events);
    },
    fight(key) {
      const reason = blocked('playing');
      if (reason || cast?.phase !== 'fight') return reject(reason ?? 'wrong-phase');
      if (key !== cast.key) {
        cast.progress = Math.max(0, cast.progress - 1);
        return accept({ type: 'fight-miss' });
      }
      if (++cast.progress === FIGHT_GOAL) return accept(startReeling('reel-started'));
      cast.key = nextKey(cast.key);
      return accept({ type: 'fight-hit' });
    },
    queueOrder(fishId, recipeId, quantity = 1) {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      const fish = FISH_CATALOG.find(({ id }) => id === fishId);
      if (!fish) return reject('unknown-fish');
      if (!isRecipeId(recipeId)) return reject('unknown-recipe');
      const recipe = RECIPE_CATALOG[recipeId];
      if (recipe.fishIds && !recipe.fishIds.includes(fishId)) return reject('ineligible-fish');
      if (!Number.isSafeInteger(quantity) || quantity < 1) return reject('invalid-quantity');
      if (quantity > ORDER_CAPACITY - orders.length) return reject('queue-full');
      const requiredFish = recipe.fishPerPortion * quantity;
      if (fishCounts[fishId] < requiredFish) return reject('no-fish');
      // Reserve room for every accepted sale so they always pay the catalog price exactly.
      const ceiling = Number.MAX_SAFE_INTEGER - pendingRevenue(orders) - recipe.price * quantity;
      if (coins > ceiling || score > ceiling) return reject('balance-limit');
      fishCounts[fishId] -= requiredFish;
      fishCount -= requiredFish;
      for (let index = 0; index < quantity; index++) {
        orders.push({ fishId, recipeId, remainingMs: recipe.durationMs });
      }
      return accept({ type: 'order-queued', fishId, recipeId, ...(quantity > 1 && { quantity }) });
    },
    upgradeRod() {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      if (rodLevel === 3) return reject('max-rod-level');
      const nextLevel = rodLevel === 1 ? 2 : 3;
      const cost = ROD_CATALOG[nextLevel].upgradeCost;
      if (coins < cost) return reject('not-enough-coins');
      coins -= cost;
      rodLevel = nextLevel;
      equipped = nextLevel;
      return accept({ type: 'rod-upgraded', rodLevel, cost });
    },
    equipRod(level) {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      if (!Object.prototype.hasOwnProperty.call(ROD_CATALOG, level) || level > rodLevel) return reject('rod-not-owned');
      if (level === equipped) return accept();
      equipped = level;
      return accept({ type: 'rod-equipped', rodLevel: level });
    },
    selectBait(bait) {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      if (!isBaitId(bait)) return reject('unknown-bait');
      if (bait !== 'none' && !baitStock[bait]) return reject('bait-empty');
      if (bait === selectedBait) return accept();
      selectedBait = bait;
      anglingChanged = true;
      return accept({ type: 'bait-selected', bait });
    },
    buyBait(bait) {
      const reason = blocked('playing');
      if (reason) return reject(reason);
      if (bait !== 'shrimp' && bait !== 'fish') return reject('unknown-bait');
      if (baitStock[bait] + BAIT_PACK > BAIT_LIMIT) return reject('bait-full');
      if (coins < BAITS[bait].price) return reject('not-enough-coins');
      coins -= BAITS[bait].price;
      baitStock[bait] += BAIT_PACK;
      anglingChanged = true;
      return accept({ type: 'bait-bought', bait });
    },
    stowCast() {
      cast = null;
      tapCooldownMs = 0;
    },
  };
}
