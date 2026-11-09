import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const source = ts.transpileModule(fs.readFileSync(new URL('./FurnitureParts.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function mount(initial) {
  const refs = [], effects = [];
  let cursor = 0, frame;
  const react = {
    useRef: value => refs[cursor++] ??= { current: value },
    useEffect: callback => effects.push(callback),
    createElement: (type, props) => ({ type, props }),
  };
  const context = { exports: {}, require(name) {
    if (name === 'react') return react;
    if (name === 'three') return THREE;
    if (name === '@react-three/fiber') return { useFrame: callback => { frame = callback; } };
    return {};
  } };
  vm.runInNewContext(source, context);
  const group = { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } };
  function render(props) {
    cursor = 0;
    context.exports.FurnitureMotion(props).props.ref.current = group;
    effects.splice(0).forEach(callback => callback());
  }
  render(initial);
  return { group, render, step: dt => frame({}, dt) };
}

test('timed cover opens gradually and reaches its exact resting angle', () => {
  const target = Math.PI * 0.94;
  const view = mount({ axis: 'z', target, duration: 0.9 });
  view.step(0.05);
  assert.ok(view.group.rotation.z > 0 && view.group.rotation.z < target / 10);
  for (let i = 0; i < 8; i++) view.step(0.05);
  assert.ok(Math.abs(view.group.rotation.z - target / 2) < 1e-9);
  for (let i = 0; i < 10; i++) view.step(0.05);
  assert.equal(view.group.rotation.z, target);
});

test('closing during opening continues from the current cover angle', () => {
  const view = mount({ axis: 'z', target: 3, duration: 0.9 });
  for (let i = 0; i < 7; i++) view.step(0.05);
  const angle = view.group.rotation.z;
  view.render({ axis: 'z', target: 0, duration: 0.9 });
  view.step(0);
  assert.equal(view.group.rotation.z, angle);
  view.step(0.05);
  assert.ok(view.group.rotation.z > 0 && view.group.rotation.z < angle);
  for (let i = 0; i < 18; i++) view.step(0.05);
  assert.equal(view.group.rotation.z, 0);
});

test('cover duration stays in sync with the camera at low frame rates', () => {
  const view = mount({ axis: 'z', target: 3, duration: 0.9 });
  for (let i = 0; i < 10; i++) view.step(0.1);
  assert.equal(view.group.rotation.z, 3);
});

test('reduced motion places the cover immediately and other furniture retains damping', () => {
  const reduced = mount({ axis: 'z', target: 3, duration: 0.9, reducedMotion: true });
  reduced.step(0.016);
  assert.equal(reduced.group.rotation.z, 3);
  const drawer = mount({ axis: 'z', target: 0.64, mode: 'position' });
  drawer.step(0.016);
  assert.equal(drawer.group.position.z, THREE.MathUtils.damp(0, 0.64, 8, 0.016));
});
