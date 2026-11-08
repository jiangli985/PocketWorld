import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { createRun, advance, ARSENAL } = require('./dist/engine.cjs');

function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function sample(arm, count, enchant = false) {
  const weapon=arm.family;const r = createRun(seeded(914), weapon,arm.id); r.spawn = 1000; r.waveCd = 1000; r.shot = 0;
  if (enchant) Object.assign(r.enchants[weapon], { burn: 1, frost: 1, chain: 1, ricochet: 1, split: 1, crit: 1 });
  const points = Array.from({ length: count }, (_, i) => ({ x: (arm.mode==='mine'?1045:1090) + i * 20, y: 1000 + (i % 2 ? 12 : -12) }));
  r.enemies = points.map((p, i) => ({ ...p, id: i + 1, kind: 0, radius: 18, speed: 0, hp: 100000, max: 100000, flash: 0, hit: 0, charge: 4, seed: i }));
  for (let i = 0; i < 1200; i++) {
    // Stationary training dummies return to their marked positions after knockback.
    r.enemies.forEach((e, j) => Object.assign(e, points[j])); advance(r, 1 / 60); r.sounds.length = 0;
  }
  return Math.round(r.damageDealt / 20 * 10) / 10;
}
const report = ARSENAL.map(w => ({ weapon: w.id, name:w.name, singleDps: sample(w, 1), sixDummiesDps: sample(w, 6), sixTraitsSingleDps: sample(w, 1, true), sixTraitsGroupDps: sample(w, 6, true) }));
console.table(report);
fs.writeFileSync(new URL('./dist/balance.json', import.meta.url), JSON.stringify({ seconds: 20, seed: 914, dummyHp: 100000, notes: 'Stationary 90–190-unit dummies reset after knockback; mines use 45–145-unit dummies inside their trigger zone. No support upgrades. Enchanted cases equip six rank-one traits on the tested weapon. Not a human survival/difficulty test.', report }, null, 2));
