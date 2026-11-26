import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityState, resetQualitySamples, sampleQuality } from './adaptiveQuality.ts';

function feed(state, seconds, fps, eligible = true) {
  const changes = [];
  for (let i = 0; i < seconds * fps; i++) {
    const level = sampleQuality(state, 1 / fps, eligible);
    if (level !== null) changes.push(level);
  }
  return changes;
}

test('smooth rendering keeps the original maximum and an isolated stall does not lower quality', () => {
  const state = createQualityState();
  assert.deepEqual(feed(state, 10, 60), []);
  sampleQuality(state, 0.2);
  assert.deepEqual(feed(state, 10, 60), []);
  assert.equal(state.level, 2);
  assert.deepEqual(feed(state, 2, 30), []);
  feed(state, 4, 60);
  assert.equal(state.level, 2);
});

test('sustained low frame rate steps down one tier at a time and stops at the lower bound', () => {
  const state = createQualityState();
  assert.deepEqual(feed(state, 8, 30), [1]);
  assert.deepEqual(feed(state, 8, 30), [0]);
  assert.deepEqual(feed(state, 60, 30), []);
  assert.equal(state.level, 0);
});

test('recovery needs sustained headroom and waits at least thirty active seconds between promotions', () => {
  const state = createQualityState();
  feed(state, 16, 30);
  const previousChange = state.time;
  assert.deepEqual(feed(state, 20, 60), []);
  assert.equal(state.level, 0);
  assert.deepEqual(feed(state, 11, 60), [1]);
  assert.ok(state.time - previousChange >= 30);
  assert.deepEqual(feed(state, 20, 60), []);
  assert.deepEqual(feed(state, 11, 60), [2]);
  assert.deepEqual(feed(state, 60, 144), []);
});

test('the middle frame rate band does not repeatedly alternate quality tiers', () => {
  const state = createQualityState();
  feed(state, 8, 30);
  assert.deepEqual(feed(state, 120, 50), []);
  assert.equal(state.level, 1);
});

test('loading, background, game pause and a long resume gap discard evidence and rewarm sampling', () => {
  const state = createQualityState();
  feed(state, 5.5, 30);
  feed(state, 60, 30, false);
  assert.equal(state.time < 6, true);
  assert.deepEqual(feed(state, 6, 30), []);
  sampleQuality(state, 5);
  assert.deepEqual(feed(state, 6, 30), []);
  resetQualitySamples(state);
  assert.deepEqual(feed(state, 6, 30), []);
  assert.deepEqual(feed(state, 2, 30), [1]);
  for (const delta of [NaN, Infinity, 0, -1]) assert.equal(sampleQuality(state, delta), null);
});
