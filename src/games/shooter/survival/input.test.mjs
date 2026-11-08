import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('./dist/engine.cjs');
const source = fs.readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
function mount() {
  const slots = [], effects = [], frames = new Map(), captures = new Set();
  let cursor = 0, dirty = true, tree, frameId = 0, now = performance.now(), movement;
  const window = new class extends EventTarget {
    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, { capture: options === true || !!options?.capture });
    }
  }(), document = Object.assign(new EventTarget(), { hidden: false });
  const props = { isActive: true, onExit() {} };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      slot.set ??= next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } };
      return [slot.value, slot.set];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const slot = slots[cursor++] ??= {};
      if (!same(slot.deps, deps)) effects.push(() => { slot.cleanup?.(); slot.deps = deps; slot.cleanup = effect(); });
    },
  };
  const canvas = {
    getContext: () => ({}), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id),
    releasePointerCapture(id) { captures.delete(id); find(node => node.type === 'canvas').props.onLostPointerCapture({ pointerId: id }); },
  };
  const context = {
    exports: {}, window, document, performance, HTMLElement: class {}, localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    require(name) {
      if (name === 'react') return { ...hooks, createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
      if (name === './engine') return { ...engine, advance(run, dt, input) { movement = { ...input }; engine.advance(run, dt, input); } };
      if (name === '../audio') return { PinballAudio: class { configure() {} unlock() {} play() {} dispose() {} } };
      if (name === './render') return { render() {} };
      if (name === './style.css') return {};
      if (name === './WeaponGlyph') return { default: () => null };
      return require(`${name}.ts`);
    },
  };
  vm.runInNewContext(compiled, context);
  function nodes(node = tree) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function find(predicate) { return nodes().find(predicate); }
  function render() {
    for (let round = 0; dirty; round++) {
      assert.ok(round < 20, 'effects must settle'); dirty = false; cursor = 0;
      tree = context.exports.default(props);
      find(node => node.type === 'canvas').props.ref.current = canvas;
      effects.splice(0).forEach(effect => effect());
    }
  }
  function click(className) { find(node => node.type === 'button' && node.props.className?.split(' ').includes(className)).props.onClick(); render(); }
  render(); click('sg-start'); click('sg-primary');
  return {
    pointer(handler, id, x = 100, y = 100) {
      find(node => node.type === 'canvas').props[handler]({ pointerId: id, button: 0, clientX: x, clientY: y, currentTarget: canvas, preventDefault() {} }); render();
    },
    key(key) { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key, repeat: false }); window.dispatchEvent(event); render(); },
    frame() { const pending = [...frames.values()]; frames.clear(); movement = undefined; now += 16; pending.forEach(callback => callback(now)); render(); assert.ok(movement, 'a playing frame must advance the engine'); return movement; },
    active(value) { props.isActive = value; dirty = true; render(); },
    get captures() { return [...captures]; },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

for (const handler of ['onPointerUp', 'onPointerCancel', 'onLostPointerCapture']) {
  test(`${handler} from another finger preserves the active joystick`, () => {
    const view = mount();
    try {
      view.pointer('onPointerDown', 1); view.pointer('onPointerMove', 1, 160, 100);
      assert.equal(view.frame().x, 1);
      view.pointer('onPointerDown', 2); view.pointer(handler, 2);
      assert.equal(view.frame().x, 1); assert.deepEqual(view.captures, [1]);
      view.pointer('onPointerMove', 1, 100, 160); assert.equal(view.frame().y, 1);
      view.pointer('onPointerUp', 1); assert.equal(view.frame().y, 0); assert.deepEqual(view.captures, []);
    } finally { view.dispose(); }
  });
}

test('releasing the joystick preserves held keyboard movement', () => {
  const view = mount();
  try {
    view.key('w'); view.pointer('onPointerDown', 1); view.pointer('onPointerMove', 1, 160, 100);
    assert.deepEqual(view.frame(), { x: 1, y: -1 });
    view.pointer('onPointerUp', 1); assert.deepEqual(view.frame(), { x: 0, y: -1 });
    view.active(false); view.active(true); view.key('p');
    assert.deepEqual(view.frame(), { x: 0, y: 0 });
  } finally { view.dispose(); }
});
