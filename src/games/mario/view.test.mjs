import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real view with React; Vite handles CSS in production.
const { outputFiles: [compiled] } = buildSync({
  entryPoints: [fileURLToPath(new URL('./FishingView.tsx', import.meta.url))],
  absWorkingDir: dirname(fileURLToPath(import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty', '.webp': 'dataurl' },
  external: ['react'],
  write: false,
});
const mod = { exports: {} };
new Function('module', 'require', compiled.text)(mod, createRequire(import.meta.url));
const { FishingView } = mod.exports;

const order = Object.freeze({ id: 1, label: '普通寿司', progress: 0.25 });
const snapshot = Object.freeze({
  coins: 10, basket: Object.freeze({ count: 2, capacity: 32 }),
  score: 5, goal: 20, highScore: 15, victory: false, canTap: true, reeling: false, guestsServed: 0,
  angling: { bait: 'none', stock: { shrimp: 3, fish: 3 }, counts: {} }, baitStore: false,
  fish: Object.freeze([
    Object.freeze({ id: 'sardine', name: '沙丁鱼', rarity: '常见', count: 2, discovered: true, reelMs: 1100 }),
    Object.freeze({ id: 'snapper', name: '红鲷', rarity: '少见', count: 0, discovered: false, reelMs: 2500 }),
  ]),
  recipes: Object.freeze([
    Object.freeze({ id: 'basic', station: 'board', name: '普通寿司', requirement: '任意鱼种', fishPerPortion: 1, coins: 5, saleMs: 4000 }),
    Object.freeze({ id: 'special', station: 'board', name: '招牌寿司', requirement: '红鲷', fishPerPortion: 1, eligibleFishIds: Object.freeze(['snapper']), coins: 11, saleMs: 6000 }),
  ]),
  orders: Object.freeze([order]), queueCapacity: 3,
  rod: Object.freeze({ owned: 1, equipped: 1 }),
});

function render(screen, overrides = {}, phase = 'waiting', isActive = true) {
  return renderToStaticMarkup(createElement(FishingView, {
    snapshot: Object.freeze({ ...snapshot, screen, ...overrides }), scene: { timeMs: 0, phase },
    isActive, onAction: () => assert.fail('render must not dispatch actions'),
  }));
}

test('home offers start and is the only screen with exit', () => {
  const home = render('home');
  assert.match(home, /<h1 class="tf-home-start"><button[^>]*class="tf-start"[^>]*>.*现在上鱼！/);
  assert.doesNotMatch(home, /东湾渔事|BAY 01|放着也能钓|新的一趟/);
  assert.match(home, /<canvas[^>]*width="800"[^>]*height="600"[^>]*aria-hidden="true"/);
  assert.match(home, /aria-label="退出"/);
  assert.doesNotMatch(home, /data-focus="listen"|播放首页音乐/);
  assert.match(home, /class="tf-start-coins" aria-hidden="true"><i><\/i><i><\/i><i><\/i>/);
  for (const screen of ['boat', 'dock', 'market', 'tackle', 'journal', 'pause', 'result', 'guide']) {
    const page = render(screen);
    assert.doesNotMatch(page, /aria-label="退出"/);
    assert.match(page, /<img class="tf-emblem" src="data:image\/webp;base64,[^"]+" alt="" width="24" height="24"/);
  }
});

test('boat displays actionable full basket and keeps event text for screen readers', () => {
  const full = render('boat', { basket: { count: 32, capacity: 32 }, canTap: false, notice: '首次发现红鲷' }, 'full');
  assert.match(full, /aria-label="鱼篓已满，靠岸去备货"[^>]*data-status="basket"/);
  for (const [icon, label] of [['basket', '鱼篓'], ['coins', '金币'], ['revenue', '营业额']]) {
    assert.match(full, new RegExp('data-stat="' + icon + '"><dt><canvas class="tf-hud-icon"[^>]*></canvas><span class="tf-sr-only">' + label));
  }
  assert.match(full, /<p class="tf-sr-only" role="status"[^>]*>首次发现红鲷/);
  assert.doesNotMatch(full, /class="tf-notice/);
  assert.match(full, /<button[^>]+disabled[^>]*aria-label="轻敲鱼竿"[^>]*><canvas/);
  for (const label of ['轻敲鱼竿', '码头', '图鉴', '暂停', '鱼饵袋', '钓鱼生涯', '任务指南']) {
    assert.match(full, new RegExp(`aria-label="${label}"><canvas class="tf-boat-icon" width="24" height="24" aria-hidden="true"`));
  }
  const reeling = render('boat', { reeling: true, seconds: 2, canTap: false }, 'bite');
  assert.match(reeling, /aria-label="收线中 · 2 秒"[^>]*data-status="reeling"/);
  assert.match(reeling, /<span aria-hidden="true">2<small> 秒<\/small><\/span>/);
  assert.match(reeling, /data-focus="dock" disabled="" aria-label="码头"/);
  assert.match(reeling, /data-focus="bait" disabled="" aria-label="鱼饵袋"/);
  assert.match(reeling, /data-focus="career" disabled="" aria-label="钓鱼生涯"/);
  const baited = render('boat', { angling: { ...snapshot.angling, bait: 'fish' } });
  assert.match(baited, /aria-label="鱼饵袋" aria-description="已选鲜鱼块" data-selected="true"/);
  assert.doesNotMatch(render('boat'), /role="status"[^>]*>等鱼咬钩/);
  assert.doesNotMatch(render('boat', {}, 'waiting', false), /<button(?![^>]*disabled)[^>]*>/);
});

test('the quest guide reveals order details only after leaving the boat screen', () => {
  const guest = { guest: '东湾渔客', note: '来两份寿司。', recipes: ['basic'], portions: 2, bonus: 8, served: 1 };
  const boat = render('boat', { guest });
  assert.match(boat, /aria-label="任务指南"/);
  assert.doesNotMatch(boat, /东湾渔客|tf-guest-boat/);
  const guide = render('guide', { guest });
  assert.match(guide, /东湾渔客.*1 \/ 2 份.*\+8 金币.*普通寿司.*任意鱼种 · 每份 1 条/);
  assert.match(guide, /鱼篓已有食材，靠岸去大排档上菜/);
  assert.match(render('guide', { guest, fish: [] }), /在海湾钓齐食材/);
  assert.match(render('guide'), /本趟熟客订单已全部上齐/);
});

test('dock displays the illustrated street with two storefronts and a way back to the boat', () => {
  const dock = render('dock');
  assert.match(dock, /<img class="tf-harbor"/);
  assert.match(dock, /data-focus="tackle" aria-label="渔具店"[^>]*><\/button>/);
  assert.match(dock, /data-focus="market" aria-label="深海渔场大排档"[^>]*><\/button>/);
  assert.match(dock, /返回船上/);
  assert.doesNotMatch(dock, /<select|升竿/);
  assert.doesNotMatch(render('boat'), /<img class="tf-harbor"/);
});

test('rare fish expose five native touch controls without hiding the keyboard prompt', () => {
  const boat = render('boat', { fight: { key: 'G', progress: 1 }, seconds: 6, canTap: false });
  assert.match(boat, /按或点 <kbd>G<\/kbd>/);
  assert.match(boat, /aria-label="收线键">(?:<button[^>]*>[DGCNY]<\/button>){5}/);
  assert.match(boat, /aria-label="搏鱼进度" max="3" value="1"/);
});

test('market offers three illustrated cooking stations and a way back to the dock', () => {
  const market = render('market');
  assert.match(market, /class="tf-interior"/);
  for (const [station, name] of [['grill', '烤架'], ['steamer', '蒸笼'], ['board', '砧板']]) {
    assert.match(market, new RegExp(`data-station="${station}"[^>]*aria-label="${name}" aria-haspopup="dialog"`));
  }
  assert.match(market, /class="tf-ledger-cover" aria-label="打开点单簿" aria-haspopup="dialog"[^>]*><span>点单簿<\/span>/);
  assert.match(market, /aria-label="返回码头"><canvas class="tf-boat-icon"/);
  assert.doesNotMatch(market, /<select|role="dialog"|tf-guest-market/);
  assert.doesNotMatch(render('market', {}, 'waiting', false), /<button(?![^>]*disabled)[^>]*>/);
});

test('tackle shop exposes three separate rod displays with equipped status', () => {
  const tackle = render('tackle');
  assert.match(tackle, /aria-label="返回码头"><canvas class="tf-boat-icon"/);
  assert.doesNotMatch(tackle, /<select/);
  assert.equal([...tackle.matchAll(/aria-haspopup="dialog"/g)].length, 3);
  assert.match(tackle, /潮竹手竿<\/span><small>已装备/);
  assert.match(tackle, /青鳍海竿/);
  assert.match(render('tackle', { rod: { owned: 3, equipped: 3 } }), /赤曜深海竿<\/span><small>已装备/);
});

test('bait panels keep the return control outside the scrolling list', () => {
  for (const baitStore of [false, true]) {
    const bait = render('bait', { baitStore });
    assert.match(bait, /class="tf-panel-head">.*<button[^>]*>返回<\/button><\/div><div class="tf-panel-body"[^>]*data-game-scroll/);
  }
});

test('journal hides undiscovered names; pause and result use different actions', () => {
  const journal = render('journal');
  assert.match(journal, /沙丁鱼/);
  assert.match(journal, /未发现/);
  assert.doesNotMatch(journal, /红鲷|No\. \d|等待上钩/);
  const pause = render('pause');
  assert.match(pause, /继续.*收工/);
  assert.doesNotMatch(pause, /暂停期间|鱼竿和订单/);
  const result = render('result', { score: 25, victory: true });
  assert.match(result, /本趟营业额<\/dt><dd>25<\/dd>/);
  assert.match(result, /已达成 20 金币营业目标/);
  assert.match(result, /返回首页/);
  assert.match(render('result'), /未达成 20 金币营业目标/);
});
