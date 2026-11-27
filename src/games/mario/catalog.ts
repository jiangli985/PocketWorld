const legacyFish = [
  Object.freeze({ id: 'sardine', name: '沙丁鱼', weight: 22, rarity: '常见', extraWaitMs: 1_000, reelMs: 1_100 }),
  Object.freeze({ id: 'anchovy', name: '鳀鱼', weight: 20, rarity: '常见', extraWaitMs: 500, reelMs: 900 }),
  Object.freeze({ id: 'mackerel', name: '鲭鱼', weight: 16, rarity: '常见', extraWaitMs: 2_000, reelMs: 1_600 }),
  Object.freeze({ id: 'herring', name: '鲱鱼', weight: 14, rarity: '常见', extraWaitMs: 1_400, reelMs: 1_300 }),
  Object.freeze({ id: 'sea-bass', name: '鲈鱼', weight: 10, rarity: '少见', extraWaitMs: 4_400, reelMs: 2_250 }),
  Object.freeze({ id: 'snapper', name: '红鲷', weight: 8, rarity: '少见', extraWaitMs: 5_200, reelMs: 2_500 }),
  Object.freeze({ id: 'squid', name: '小鱿鱼', weight: 6, rarity: '稀有', extraWaitMs: 7_000, reelMs: 2_850 }),
  Object.freeze({ id: 'bluefin', name: '蓝鳍金枪鱼', weight: 4, rarity: '稀有', extraWaitMs: 10_000, reelMs: 3_700 }),
] as const;

const addedFish = [
  Object.freeze({ id: 'flying-fish', name: '飞鱼', weight: 8, rarity: '常见', extraWaitMs: 1_800, reelMs: 1_450 }),
  Object.freeze({ id: 'yellow-croaker', name: '小黄鱼', weight: 7, rarity: '常见', extraWaitMs: 2_600, reelMs: 1_850 }),
  Object.freeze({ id: 'flatfish', name: '比目鱼', weight: 6, rarity: '少见', extraWaitMs: 5_800, reelMs: 2_650 }),
  Object.freeze({ id: 'lanternfish', name: '灯笼鱼', weight: 4, rarity: '稀有', extraWaitMs: 8_500, reelMs: 3_150 }),
] as const;

export const FISH_CATALOG = Object.freeze([...legacyFish, ...addedFish]);
export const LEGACY_FISH_COUNT = legacyFish.length;
export type FishId = typeof FISH_CATALOG[number]['id'];
/** Playable weights in grams, independent of the species spawn weights. */
export const FISH_MASS = {
  sardine: [80, 330], anchovy: [20, 140], mackerel: [350, 1_800], herring: [180, 760],
  'sea-bass': [750, 5_400], snapper: [950, 7_200], squid: [420, 3_600], bluefin: [8_500, 34_000],
  'flying-fish': [160, 880], 'yellow-croaker': [220, 1_400], flatfish: [560, 4_800], lanternfish: [45, 280],
} as const satisfies Record<FishId, readonly [number, number]>;

export const BAITS = {
  none: { name: '空钩', effect: '不消耗鱼饵', price: 0, speedMs: 0, massPower: 1 },
  shrimp: { name: '虾肉饵', effect: '等口缩短 1.5 秒', price: 8, speedMs: 1_500, massPower: 1 },
  fish: { name: '鲜鱼块', effect: '同种鱼更容易钓到重个体', price: 12, speedMs: 0, massPower: .42 },
} as const;
export type BaitId = keyof typeof BAITS;
export type PaidBaitId = Exclude<BaitId, 'none'>;
export const BAIT_PACK = 5;
export const BAIT_LIMIT = 99;
export const CAREER_LIMIT = 1_000_000_000;
export const BAIT_SAMPLES = { shrimp: 3, fish: 3 } as const;
export const HEAVY_REEL_EXTRA_MS = 600;

export function isBaitId(value: unknown): value is BaitId {
  return value === 'none' || value === 'shrimp' || value === 'fish';
}
const premiumFish = Object.freeze<FishId[]>(['snapper', 'squid', 'bluefin']);

export const RECIPE_CATALOG = Object.freeze({
  grilled: Object.freeze({ name: '盐烤鲜鱼', station: 'grill', durationMs: 5_000, price: 6, fishPerPortion: 1, fishIds: null }),
  misoMackerel: Object.freeze({ name: '味噌烤鲭鱼', station: 'grill', durationMs: 7_000, price: 10, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['mackerel']) }),
  charredHerring: Object.freeze({ name: '炭烤鲱鱼', station: 'grill', durationMs: 6_000, price: 8, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['herring']) }),
  squidSkewers: Object.freeze({ name: '双串烤鱿鱼', station: 'grill', durationMs: 12_000, price: 30, fishPerPortion: 2, fishIds: Object.freeze<FishId[]>(['squid']) }),
  grilledFlyingFish: Object.freeze({ name: '香烤飞鱼', station: 'grill', durationMs: 6_000, price: 9, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['flying-fish']) }),
  grilledFlatfish: Object.freeze({ name: '炭烤比目鱼', station: 'grill', durationMs: 8_000, price: 13, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['flatfish']) }),
  steamed: Object.freeze({ name: '清蒸海鲜', station: 'steamer', durationMs: 8_000, price: 13, fishPerPortion: 1, fishIds: premiumFish }),
  gingerSeaBass: Object.freeze({ name: '姜葱蒸鲈鱼', station: 'steamer', durationMs: 7_000, price: 12, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['sea-bass']) }),
  steamedSnapper: Object.freeze({ name: '豉汁蒸红鲷', station: 'steamer', durationMs: 9_000, price: 16, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['snapper']) }),
  steamedAnchovy: Object.freeze({ name: '葱油蒸鳀鱼', station: 'steamer', durationMs: 5_000, price: 7, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['anchovy']) }),
  steamedCroaker: Object.freeze({ name: '葱姜蒸黄花鱼', station: 'steamer', durationMs: 6_000, price: 9, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['yellow-croaker']) }),
  basic: Object.freeze({ name: '普通寿司', station: 'board', durationMs: 4_000, price: 5, fishPerPortion: 1, fishIds: null }),
  special: Object.freeze({ name: '招牌寿司', station: 'board', durationMs: 6_000, price: 11, fishPerPortion: 1, fishIds: premiumFish }),
  sardineRoll: Object.freeze({ name: '沙丁鱼手卷', station: 'board', durationMs: 7_000, price: 12, fishPerPortion: 2, fishIds: Object.freeze<FishId[]>(['sardine']) }),
  bluefinSashimi: Object.freeze({ name: '蓝鳍刺身', station: 'board', durationMs: 8_000, price: 18, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['bluefin']) }),
  lanternSushi: Object.freeze({ name: '灯笼鱼押寿司', station: 'board', durationMs: 9_000, price: 20, fishPerPortion: 1, fishIds: Object.freeze<FishId[]>(['lanternfish']) }),
});

/** Cost to reach this level; wait bounds are inclusive active milliseconds. */
export const ROD_CATALOG = Object.freeze({
  1: Object.freeze({ name: '潮竹手竿', upgradeCost: 0, minWaitMs: 10_000, maxWaitMs: 14_000, tapCooldownMs: 250, rareBonusMs: 0 }),
  2: Object.freeze({ name: '青鳍海竿', upgradeCost: 20, minWaitMs: 8_000, maxWaitMs: 11_000, tapCooldownMs: 200, rareBonusMs: 0 }),
  3: Object.freeze({ name: '赤曜深海竿', upgradeCost: 55, minWaitMs: 7_000, maxWaitMs: 9_000, tapCooldownMs: 200, rareBonusMs: 2_000 }),
});

export type RecipeId = keyof typeof RECIPE_CATALOG;
export type CookingStation = typeof RECIPE_CATALOG[RecipeId]['station'];
export type RodLevel = keyof typeof ROD_CATALOG;

type GuestOrder = Readonly<{ guest: string; note: string; recipes: readonly RecipeId[]; portions: number; bonus: number }>;

export const GUEST_ORDERS: readonly GuestOrder[] = [
  { guest: '修船的陈师傅', note: '收工了，烧两条热乎的。', recipes: ['grilled'], portions: 2, bonus: 8 },
  { guest: '巡湾的阿澄', note: '刚从海风里回来，想吃口清蒸。', recipes: ['steamedAnchovy', 'gingerSeaBass'], portions: 1, bonus: 7 },
  { guest: '渡口的阿婆', note: '下一班船快到了，带份小食。', recipes: ['sardineRoll', 'misoMackerel'], portions: 1, bonus: 9 },
  { guest: '守灯塔的林叔', note: '今晚不赶时间，想尝尝东湾好货。', recipes: ['steamedSnapper', 'bluefinSashimi', 'squidSkewers'], portions: 1, bonus: 15 },
];

export function isRecipeId(id: unknown): id is RecipeId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(RECIPE_CATALOG, id);
}

export const FISH_CAPACITY = 32;
export const ORDER_CAPACITY = 3;
export const TRIP_TARGET_SCORE = 20;
export const TAP_REDUCTION_MS = 350;
export const TAP_MAX_PERCENT = 30;
export const TAP_COOLDOWN_MS = ROD_CATALOG[1].tapCooldownMs;

export const FIGHT_KEYS = 'DGCNY';
export const FIGHT_MS = 8_000;
export const FIGHT_GOAL = 3;
