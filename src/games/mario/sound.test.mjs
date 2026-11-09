import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = (await readFile(new URL('./sound.ts', import.meta.url), 'utf8'))
  .replace(/import laughUrl[^;]+;/, "const laughUrl = 'laugh';")
  .replace(/import mountUrl[^;]+;/, "const mountUrl = 'mount';");
const compiled = ts.transpile(source, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext });
const { SkiSound } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const contexts = [];
class FakeContext {
  currentTime = 0; oscillators = []; madeGain = false;
  state = 'suspended'; sources = []; gain = { gain: { value: 1 }, connect() {} }; destination = {};
  constructor() { contexts.push(this); }
  createGain() {
    if (!this.madeGain) { this.madeGain = true; return this.gain; }
    return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
  }
  createOscillator() {
    const node = { stopped: false, connected: false, onended: null, startAt: -1, stopAt: -1,
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() { this.connected = true; }, disconnect() { this.connected = false; },
      start(time) { this.startAt = time; }, stop(time) { this.stopped = true; this.stopAt = time; } };
    this.oscillators.push(node); return node;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  decodeAudioData(bytes) { return Promise.resolve({ duration: bytes.byteLength === 14 ? 14.113 : 1.812 }); }
  createBufferSource() {
    const node = { stopped: false, connected: false, buffer: null, onended: null, startArgs: [],
      connect() { this.connected = true; }, disconnect() { this.connected = false; },
      start(...args) { this.startArgs = args; }, stop() { this.stopped = true; } };
    this.sources.push(node); return node;
  }
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('laugh is exactly three seconds, mount uses the whole cue, repeated events restart without stacking', async () => {
  globalThis.AudioContext = FakeContext;
  globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(url === 'laugh' ? 14 : 2) });
  const sound = new SkiSound(); sound.unlock(); await flush();
  const ctx = contexts.at(-1);
  sound.play('laugh'); assert.deepEqual(ctx.sources[0].startArgs, [0, 0, 3]);
  sound.play('laugh'); assert.equal(ctx.sources[0].stopped, true); assert.equal(ctx.sources.length, 2);
  sound.play('mount'); assert.deepEqual(ctx.sources[2].startArgs, [0, 0, 1.812]);
  sound.dispose(); assert.equal(ctx.state, 'closed'); assert.ok(ctx.sources.every(node => node.stopped && !node.connected));
});

test('mute stops playback immediately; pause suspends context and blocks events; dispose cannot restart', async () => {
  globalThis.AudioContext = FakeContext;
  const sound = new SkiSound(); sound.unlock(); await flush(); const ctx = contexts.at(-1);
  sound.play('laugh'); sound.setMuted(true);
  assert.equal(ctx.gain.gain.value, 0); assert.equal(ctx.sources[0].stopped, true);
  sound.play('mount'); assert.equal(ctx.sources.length, 1);
  sound.setMuted(false); assert.equal(ctx.gain.gain.value, 0.8);
  sound.play('mount'); sound.setPaused(true); assert.equal(ctx.state, 'suspended');
  sound.play('laugh'); assert.equal(ctx.sources.length, 2);
  sound.setPaused(false); assert.equal(ctx.state, 'running'); sound.stop(); assert.equal(ctx.sources[1].stopped, true);
  sound.dispose(); const count = contexts.length; sound.unlock(); sound.play('laugh'); assert.equal(contexts.length, count);
});

test('only crashes and catches trigger original laughter; coin and boost use short tones', async () => {
  globalThis.AudioContext = FakeContext;
  const sound = new SkiSound(); sound.unlock(); await flush();
  const ctx = contexts.at(-1);
  for (const event of ['flip', 'land', 'coin']) sound.playEvent(event);
  assert.equal(ctx.sources.length, 0);
  assert.equal(ctx.oscillators.length, 1);
  assert.equal(ctx.oscillators[0].stopAt, .08);
  sound.playEvent('boost');
  assert.equal(ctx.oscillators[1].stopAt, .16);
  assert.equal(ctx.sources.length, 0);
  sound.playEvent('crash');
  assert.deepEqual(ctx.sources[0].startArgs, [0, 0, 3]);
  sound.playEvent('caught');
  assert.equal(ctx.sources[0].stopped, true);
  assert.deepEqual(ctx.sources[1].startArgs, [0, 0, 3]);
  sound.playEvent('mount');
  assert.deepEqual(ctx.sources[2].startArgs, [0, 0, 1.812]);
  sound.dispose();
});

test('feedback tones are bounded and obey mute, pause, stop and disposal', async () => {
  globalThis.AudioContext = FakeContext;
  const sound = new SkiSound(); sound.unlock(); await flush();
  const ctx = contexts.at(-1);
  for (let i = 0; i < 20; i++) sound.playEvent('boost');
  assert.equal(ctx.oscillators.length, 4);
  ctx.oscillators[0].onended();
  sound.playEvent('coin');
  assert.equal(ctx.oscillators.length, 5);
  sound.setPaused(true); sound.playEvent('boost');
  assert.equal(ctx.oscillators.length, 5);
  sound.setPaused(false); sound.setMuted(true);
  assert.ok(ctx.oscillators.every(node => !node.connected));
  sound.playEvent('boost'); assert.equal(ctx.oscillators.length, 5);
  sound.setMuted(false); sound.playEvent('boost');
  assert.equal(ctx.oscillators.length, 6);
  sound.dispose(); sound.playEvent('coin'); sound.unlock();
  assert.equal(ctx.oscillators.length, 6);
  assert.ok(ctx.oscillators.every(node => !node.connected));
});

test('unmount during async audio loading cannot open another context or start a cue', async () => {
  globalThis.AudioContext = FakeContext;
  const sound = new SkiSound(); sound.unlock(); const ctx = contexts.at(-1); sound.dispose();
  await flush(); sound.play('laugh'); assert.equal(ctx.state, 'closed'); assert.equal(ctx.sources.length, 0);
});
