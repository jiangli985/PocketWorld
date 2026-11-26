import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetQueue } from './assetQueue.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('model jobs retain their two slots until loading and parsing finish', async () => {
  const queue = createAssetQueue();
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  const jobs = gates.map((gate, index) => queue.run(() => { started.push(index); return gate.promise; }));
  await turn();
  assert.deepEqual(started, [0, 1]);
  gates[1].resolve('parsed');
  await turn();
  assert.deepEqual(started, [0, 1, 2]);
  gates[0].resolve();
  await turn();
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[2].resolve();
  await turn();
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  gates[3].resolve(); gates[4].resolve();
  assert.equal((await Promise.all(jobs))[1], 'parsed');
});

test('a requested outfit overtakes queued decorations without interrupting active work', async () => {
  const queue = createAssetQueue(1);
  const first = deferred();
  const started = [];
  const initial = queue.run(() => first.promise);
  const decoration = queue.run(async () => { started.push('decoration'); }, 1);
  const outfit = queue.run(async () => { started.push('outfit'); }, 0);
  const seat = queue.run(async () => { started.push('seat'); }, 2);
  first.resolve();
  await Promise.all([initial, decoration, outfit, seat]);
  assert.deepEqual(started, ['outfit', 'decoration', 'seat']);
});

test('rejected and synchronously failed loads release slots and permit retries', async () => {
  const queue = createAssetQueue(1);
  const failed = queue.run(() => Promise.reject(new Error('unavailable')));
  const sync = queue.run(() => { throw new Error('decoder failed'); });
  const retry = queue.run(async () => 'loaded');
  await assert.rejects(failed, /unavailable/);
  await assert.rejects(sync, /decoder failed/);
  assert.equal(await retry, 'loaded');
});
