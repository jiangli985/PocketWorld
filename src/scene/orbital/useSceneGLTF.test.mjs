import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadSceneAsset } from './assetQueue.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));

test('cached loader configuration survives repeated hooks, preload and module reload without nested queues', async () => {
  const started = [];
  const loader = { load(url, resolve, progress, reject) { started.push({ url, resolve, reject }); } };
  const hook = (url, draco, meshopt, configure) => {
    assert.equal(draco, true);
    assert.equal(meshopt, true);
    configure(loader);
  };
  hook.preload = hook;
  const compile = () => {
    const context = { exports: {}, require(name) {
      if (name === '@react-three/drei') return { useGLTF: hook };
      if (name === './assetQueue.ts') return { loadSceneAsset };
      throw new Error(name);
    } };
    const source = readFileSync(new URL('./useSceneGLTF.ts', import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
    return context.exports.useSceneGLTF;
  };
  compile().preload('./models/cabin/open-cabin.glb');
  compile()('./models/cabin/open-cabin.glb');
  const results = [];
  const failed = [];
  loader.load('one.glb', value => results.push(value), undefined, error => failed.push(error.message));
  loader.load('two.glb', value => results.push(value));
  loader.load('three.glb', value => results.push(value));
  await turn();
  assert.deepEqual(started.map(x => x.url), ['one.glb', 'two.glb']);
  started[0].reject(new Error('bad model'));
  started[1].resolve('two');
  await turn();
  assert.deepEqual(started.map(x => x.url), ['one.glb', 'two.glb', 'three.glb']);
  started[2].resolve('three');
  await turn();
  assert.deepEqual(failed, ['bad model']);
  assert.deepEqual(results, ['two', 'three']);
});
