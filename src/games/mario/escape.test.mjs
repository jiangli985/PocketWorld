import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

async function mount() {
  const slots = [];
  let cursor = 0, dirty = true, tree;
  const effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) {
      const index = cursor++;
      const slot = slots[index] ??= { value: typeof value === 'function' ? value() : value };
      slot.set ??= next => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      };
      return [slot.value, slot.set];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const slot = slots[index] ??= {};
      if (!same(slot.deps, deps)) effects.push(() => { slot.cleanup?.(); slot.deps = deps; slot.cleanup = effect(); });
    },
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: 'fragment',
  };
  const target = new class extends EventTarget {
    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, { capture: options === true || !!options?.capture });
    }
  }();
  const run = () => ({ trail: 'valley', score: 0, distance: 0, coins: 0, flips: 0, combo: 0, messageTime: 0,
    message: '', coinFlash: 0, time: 0, caughtTime: 0, over: false, events: [],
    player: { partner: null, crashTime: 0, boostTime: 0 } });
  const exits = [];
  const modules = {
    react, './ski.css': {},
    './engine': { createRun: run, frontGap: () => 300, stepRun() {} },
    './assets': { loadAssets: () => Promise.resolve({ errors: [] }) },
    './renderer': { renderGame() {} },
    './model': {
      emptyInput: () => ({ jump: false, jumpPressed: false, tuck: false, tilt: 0 }),
      TRAILS: [{ id: 'valley', name: '初晴雪谷' }, { id: 'forest', name: '暮色松林' }, { id: 'night', name: '极夜冰原' }],
    },
    './sound': { SkiSound: class { unlock() {} stop() {} setPaused() {} setMuted() {} dispose() {} playEvent() {} } },
  };
  const sandbox = {
    module: { exports: {} }, exports: {}, require: name => modules[name],
    window: target, document: Object.assign(new EventTarget(), { hidden: false }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    ResizeObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  const MarioGame = sandbox.module.exports.default;
  const props = { isActive: true, isMuted: false, onExit: () => exits.push(true) };
  const settle = async () => {
    for (let i = 0; i < 20 && (dirty || effects.length); i++) {
      if (dirty) { dirty = false; cursor = 0; tree = MarioGame(props); }
      while (effects.length) effects.shift()();
      await Promise.resolve();
    }
  };
  await settle();
  const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
    : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  const find = (node, label) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const child of node) { const hit = find(child, label); if (hit) return hit; } return null; }
    if (node.type === 'button' && text(node).includes(label)) return node;
    return find(node.props?.children, label);
  };
  const classes = (node, found = new Set()) => {
    if (Array.isArray(node)) node.forEach(child => classes(child, found));
    else if (node && typeof node === 'object') {
      String(node.props?.className ?? '').split(' ').forEach(name => found.add(name));
      classes(node.props?.children, found);
    }
    return found;
  };
  const has = className => classes(tree).has(className);
  return {
    exits,
    phase: () => has('ski-home') ? 'home' : has('ski-select') ? 'select' : has('ski-pause') ? 'paused'
      : has('ski-hud') ? 'playing' : 'other',
    async click(label) { find(tree, label).props.onClick(); await settle(); },
    async escape() {
      const key = Object.assign(new Event('keydown', { cancelable: true }), { code: 'Escape', repeat: false });
      target.dispatchEvent(key);
      await settle();
      return key.defaultPrevented;
    },
  };
}

test('Esc pauses, resumes and backs out of every menu instead of being swallowed', async () => {
  const game = await mount();
  assert.equal(game.phase(), 'home');
  await game.click('出发滑雪');
  assert.equal(game.phase(), 'select');
  assert.ok(await game.escape());
  assert.equal(game.phase(), 'home', 'Esc on trail select returns home');

  await game.click('出发滑雪');
  await game.click('初晴雪谷');
  assert.equal(game.phase(), 'playing');
  await game.escape();
  assert.equal(game.phase(), 'paused', 'Esc while playing pauses');
  await game.escape();
  assert.equal(game.phase(), 'playing', 'Esc on the pause menu resumes');

  await game.escape();
  await game.click('返回首页');
  assert.equal(game.phase(), 'home');
  assert.equal(game.exits.length, 0);
  await game.escape();
  assert.equal(game.exits.length, 1, 'Esc on the home screen exits to the computer');
});
