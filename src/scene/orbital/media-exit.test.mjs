import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(process.env.MEDIA_EXIT_SOURCE ?? new URL('./MediaObjects.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/const gameModules = .*;/, 'const gameModules = globalThis.gameModules;'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function mount({ game = null, modules = {}, focusedObject = 'computer' } = {}) {
  const slots = [];
  let cursor = 0, dirty = true, tree;
  const effects = [];
  const target = new class extends EventTarget {
    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, { capture: options === true || !!options?.capture });
    }
  }();
  const changes = [], returns = [], errors = [];
  let blurred = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const hooks = {
    useRef(value) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
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
      if (!same(slot.deps, deps)) effects.push(() => {
        slot.cleanup?.();
        slot.deps = deps;
        slot.cleanup = effect();
      });
    },
  };
  const react = {
    ...hooks,
    Component: class {},
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: { blur() { blurred++; } } });
  const context = {
    exports: {}, gameModules: modules, window: target, document,
    require(name) {
      if (name === 'react') return react;
      if (name === '@react-three/drei') return { Html: 'Html' };
      if (name === '@react-three/fiber') return { useFrame() {} };
      if (name === 'three') return {};
      if (name === '../audioEngine') return { roomAudio: { cancelPreparedMusic() {} } };
      if (name === './ObjectHandle') return { ObjectHandle: 'ObjectHandle' };
      if (name === './Primitives') return { SoftBox: 'SoftBox' };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  const disc = { id: 'test-disc', title: 'Test', discThemeColor: ['#fff', '#000'] };
  const props = {
    sceneId: 'habitat', focusedObject, activeGame: game, discs: [disc], activeDisc: disc,
    transition: { phase: 'active', toScene: 'habitat', fromScene: 'habitat' }, reducedMotion: true,
    onGameChange: value => changes.push(value), onReturn: () => returns.push(true),
    onFeatureError: message => errors.push(message), onGesture() {}, onAction() {},
  };
  function render() {
    for (let round = 0; dirty; round++) {
      assert.ok(round < 20, 'effects must settle');
      dirty = false; cursor = 0;
      tree = context.exports.MediaObjects(props);
      effects.splice(0).forEach(effect => effect());
    }
    return tree;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  render();
  return {
    props, target, changes, returns, errors,
    get blurred() { return blurred; },
    find: predicate => nodes().find(predicate),
    render() { dirty = true; return render(); },
    async settle() { await Promise.resolve(); await Promise.resolve(); render(); },
    key(code = 'Escape') {
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, { code });
      target.dispatchEvent(event);
      render();
      return event;
    },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

for (const [name, options] of [
  ['empty computer', {}],
  ['missing cartridge module', { game: 'mario' }],
  ['loading cartridge', { game: 'mario', modules: { '../../games/mario/index.tsx': () => new Promise(() => {}) } }],
  ['failed cartridge import', { game: 'mario', modules: { '../../games/mario/index.tsx': () => Promise.reject(new Error('load failed')) } }],
]) {
  test(`Escape leaves the ${name} and clears game selection`, async () => {
    const view = mount(options);
    try {
      await view.settle();
      let bubbled = 0;
      view.target.addEventListener('keydown', () => bubbled++);
      const event = view.key();
      assert.equal(event.defaultPrevented, true);
      assert.equal(bubbled, 0, 'outer Escape handler must not start a second return');
      assert.deepEqual(view.changes, [null]);
      assert.equal(view.returns.length, 1);
      assert.equal(view.blurred, 1);
    } finally { view.dispose(); }
  });
}

test('a mounted game retains Escape for its own pause menu; the physical exit still works', async () => {
  const view = mount({ game: 'mario', modules: { '../../games/mario/index.tsx': () => Promise.resolve({ default: () => null }) } });
  try {
    await view.settle();
    let gameEscapes = 0;
    view.target.addEventListener('keydown', () => gameEscapes++);
    assert.equal(view.key().defaultPrevented, false);
    assert.equal(gameEscapes, 1);
    assert.equal(view.returns.length, 0);
    view.find(node => node.props?.id === 'computer-exit').props.world.onAction({ objectId: 'computer-exit' });
    assert.deepEqual(view.changes, [null]);
    assert.equal(view.returns.length, 1);
  } finally { view.dispose(); }
});

for (const action of ['game-pause', 'game-slot']) {
  test(`Escape leaves a mounted game after the physical ${action} control disables its input`, async () => {
    const view = mount({ game: 'mario', modules: { '../../games/mario/index.tsx': () => Promise.resolve({ default: () => null }) } });
    try {
      await view.settle();
      view.find(node => node.props?.id === action).props.world.onAction({ objectId: action });
      view.render();
      assert.equal(view.key().defaultPrevented, true);
      assert.deepEqual(view.changes, [null]);
      assert.equal(view.returns.length, 1);
    } finally { view.dispose(); }
  });
}

test('resuming with the physical pause control hands Escape back to the game', async () => {
  const view = mount({ game: 'mario', modules: { '../../games/mario/index.tsx': () => Promise.resolve({ default: () => null }) } });
  try {
    await view.settle();
    for (let i = 0; i < 2; i++) {
      view.find(node => node.props?.id === 'game-pause').props.world.onAction({ objectId: 'game-pause' });
      view.render();
    }
    assert.equal(view.key().defaultPrevented, false);
    assert.equal(view.returns.length, 0);
  } finally { view.dispose(); }
});

test('a cartridge render failure restores the Escape exit', async () => {
  const view = mount({ game: 'mario', modules: { '../../games/mario/index.tsx': () => Promise.resolve({ default: () => null }) } });
  try {
    await view.settle();
    view.find(node => node.type?.name === 'ScreenBoundary').props.onError();
    view.render();
    assert.equal(view.key().defaultPrevented, true);
    assert.equal(view.returns.length, 1);
    assert.deepEqual(view.changes, [null]);
  } finally { view.dispose(); }
});

test('leaving during insertion cancels the transfer and ignores its stale completion', () => {
  const view = mount();
  try {
    view.find(node => node.props?.id === 'game-cartridge-mario').props.world.onAction({ objectId: 'game-cartridge-mario', payload: { itemId: 'mario' } });
    view.render();
    const transfer = view.find(node => node.type?.name === 'TransferObject');
    assert.ok(transfer);
    view.key();
    transfer.props.onDone();
    assert.deepEqual(view.changes, [null]);
    assert.equal(view.returns.length, 1);
    assert.equal(view.find(node => node.type?.name === 'TransferObject'), undefined);
  } finally { view.dispose(); }
});

test('other keys, other focused objects and disposal do not retain the computer Escape handler', () => {
  const view = mount();
  try {
    assert.equal(view.key('KeyW').defaultPrevented, false);
    view.props.focusedObject = 'music-player'; view.render();
    assert.equal(view.key().defaultPrevented, false);
    assert.equal(view.returns.length, 0);
    view.props.focusedObject = 'computer'; view.render();
    view.dispose();
    assert.equal(view.key().defaultPrevented, false);
    assert.equal(view.returns.length, 0);
  } finally { view.dispose(); }
});
