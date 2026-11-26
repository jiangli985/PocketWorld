import type { BaitId, FishId, PaidBaitId, RecipeId, RodLevel } from './catalog.ts';

export type CatchWeight = Readonly<{ fishId: FishId; grams: number }>;
export type CatchCard = CatchWeight & Readonly<{ bait: BaitId; record: boolean; firstDiscovery: boolean }>;
export type AnglingProgress = Readonly<{
  bait: BaitId;
  stock: Readonly<Record<PaidBaitId, number>>;
  counts: Readonly<Partial<Record<FishId, number>>>;
  best?: CatchWeight;
}>;

/** All *Ms fields are integer milliseconds of active play, never timestamps. */
export type FishingOrder = Readonly<{
  fishId: FishId;
  recipeId: RecipeId;
  remainingMs: number;
}>;

/** Versioned progress for T03 to validate and serialize. Orders are FIFO; only the head advances. */
export type FishingProgress = Readonly<{
  version: 2;
  coins: number;
  rodLevel: RodLevel;
  /** Omitted when the highest owned tier is equipped, including in older saves. */
  equippedRodLevel?: RodLevel;
  fishCounts: Readonly<Record<FishId, number>>;
  discoveredFishIds: readonly FishId[];
  orders: readonly FishingOrder[];
  angling?: AnglingProgress;
}>;

export type TripPhase = 'home' | 'playing' | 'paused' | 'settled';
export type CastSnapshot =
  | Readonly<{ phase: 'idle' | 'full' }>
  | Readonly<{ phase: 'waiting'; remainingMs: number; originalWaitMs: number; tappedMs: number; rodLevel: RodLevel }>
  | Readonly<{ phase: 'reeling'; remainingMs: number; fishId: FishId }>
  | Readonly<{ phase: 'fight'; remainingMs: number; key: string; progress: number }>;

export type TripResult = Readonly<{ score: number; highScore: number; victory: boolean }>;

export type FishingSnapshot = Readonly<{
  phase: TripPhase;
  active: boolean;
  progress: FishingProgress;
  fishCount: number;
  cast: CastSnapshot;
  tapCooldownMs: number;
  score: number;
  highScore: number;
  guestIndex: number;
  guestPortions: number;
  lastCatch?: CatchCard;
  result: TripResult | null;
}>;

export type FishingEvent =
  | Readonly<{ type: 'trip-started'; score: number; highScore: number }>
  | Readonly<{ type: 'cast-started'; waitMs: number; rodLevel: RodLevel; bait?: PaidBaitId }>
  | Readonly<{ type: 'rod-tapped'; reducedMs: number }>
  | Readonly<{ type: 'bite' | 'reel-started'; durationMs: number }>
  | Readonly<{ type: 'fight-started' | 'fight-hit' | 'fight-miss' | 'fish-escaped' }>
  | Readonly<{ type: 'fish-caught'; fishId: FishId; firstDiscovery: boolean }>
  | Readonly<{ type: 'order-queued'; fishId: FishId; recipeId: RecipeId; quantity?: number }>
  | Readonly<{ type: 'order-sold'; fishId: FishId; recipeId: RecipeId; price: number; score: number; highScore: number;
    guest?: Readonly<{ name: string; bonus: number }> }>
  | Readonly<{ type: 'rod-upgraded'; rodLevel: RodLevel; cost: number }>
  | Readonly<{ type: 'rod-equipped'; rodLevel: RodLevel }>
  | Readonly<{ type: 'bait-selected'; bait: BaitId } | { type: 'bait-bought'; bait: PaidBaitId }>
  | Readonly<{ type: 'trip-finished'; result: TripResult }>;

export type RejectionReason =
  | 'inactive' | 'wrong-phase' | 'not-waiting' | 'tap-cooldown' | 'tap-limit'
  | 'unknown-fish' | 'unknown-recipe' | 'ineligible-fish' | 'invalid-quantity' | 'queue-full' | 'no-fish' | 'balance-limit'
  | 'max-rod-level' | 'not-enough-coins' | 'rod-not-owned'
  | 'unknown-bait' | 'bait-empty' | 'bait-full';

export type ActionResult =
  | Readonly<{ ok: true; events: readonly FishingEvent[] }>
  | Readonly<{ ok: false; reason: RejectionReason }>;

export type FishingOptions = Readonly<{
  /** Inject a source returning values in [0, 1). Equal streams and actions give equal results. */
  random: () => number;
  /** Optional T03-validated save: safe integer coins, including room for all pending sales. */
  progress?: FishingProgress;
  highScore?: number;
}>;

export interface FishingGame {
  /** Fresh detached snapshots; neither snapshots nor events are retained as history. */
  getSnapshot(): FishingSnapshot;
  getProgress(): FishingProgress;
  /** External pause gate. The host manages frame timestamps and drops inactive time. */
  setActive(active: boolean): void;
  startTrip(): ActionResult;
  pause(): ActionResult;
  resume(): ActionResult;
  finishTrip(): ActionResult;
  returnHome(): ActionResult;
  /** Advance active milliseconds, at most 30 minutes per call. Ashore, advance sales only. */
  advance(deltaMs: number, fishing?: boolean): readonly FishingEvent[];
  /** One deliberate tap. The host filters repeat keys and duplicate pointer activations. */
  tapRod(): ActionResult;
  fight(key: string): ActionResult;
  queueOrder(fishId: FishId, recipeId: RecipeId, quantity?: number): ActionResult;
  upgradeRod(): ActionResult;
  equipRod(level: RodLevel): ActionResult;
  selectBait(bait: BaitId): ActionResult;
  buyBait(bait: PaidBaitId): ActionResult;
  stowCast(): void;
}
