import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from './adaptiveQuality.ts';

test('the frame adapter ignores game, hidden and loading time and removes its visibility listener', () => {
  let frame, cleanup, reset;
  const changes = [], state = policy.createQualityState();
  const loading = { active: false };
  const document = {
    hidden: false,
    addEventListener(type, fn) { assert.equal(type, 'visibilitychange'); reset = fn; },
    removeEventListener(type, fn) { assert.equal(type, 'visibilitychange'); assert.equal(fn, reset); reset = undefined; },
  };
  const dependencies = {
    react: { useMemo: () => state, useEffect: effect => { cleanup ??= effect(); } },
    '@react-three/fiber': { useFrame: fn => { frame = fn; } },
    '@react-three/drei': { useProgress: { getState: () => loading } },
    './adaptiveQuality': policy,
  };
  const scope = { exports: {}, document, require: name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } };
  const source = readFileSync(new URL('./SceneQuality.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope);
  const props = { paused: true, onChange: level => changes.push(level) };
  scope.exports.AdaptiveQuality(props);
  const feed = seconds => { for (let i = 0; i < seconds * 30; i++) frame({}, 1 / 30); };
  feed(30);
  assert.deepEqual(changes, []);
  props.paused = false;
  scope.exports.AdaptiveQuality(props);
  document.hidden = true;
  feed(30);
  document.hidden = false;
  loading.active = true;
  feed(30);
  assert.deepEqual(changes, []);
  loading.active = false;
  feed(5.5);
  reset();
  feed(6);
  assert.deepEqual(changes, []);
  feed(2);
  assert.deepEqual(changes, [1]);
  cleanup();
  assert.equal(reset, undefined);
});
