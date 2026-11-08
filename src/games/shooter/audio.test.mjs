import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup() {
  const contexts = [];
  class AudioContext {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    starts = 0;
    constructor() { contexts.push(this); }
    createGain() {
      return { gain: { value: 0, setValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    createOscillator() {
      return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start: () => this.starts++, stop() {} };
    }
    resume() { return Promise.resolve().then(() => { this.state = 'running'; }); }
    suspend() { return Promise.resolve().then(() => { this.state = 'suspended'; }); }
    close() { return Promise.resolve().then(() => { this.state = 'closed'; }); }
  }
  const context = { exports: {}, window: { AudioContext } };
  vm.runInNewContext(compiled, context);
  return { audio: new context.exports.PinballAudio(), contexts };
}

test('unmuting an unlocked game restores sound without another gameplay gesture', async () => {
  const { audio, contexts } = setup();
  audio.configure(true, false);
  assert.equal(contexts.length, 0);
  audio.unlock(); await Promise.resolve();
  const context = contexts[0];
  audio.play('launch'); assert.equal(context.starts, 1);
  audio.configure(true, true); await Promise.resolve();
  assert.equal(context.state, 'suspended');
  audio.play('launch'); assert.equal(context.starts, 1);
  audio.configure(true, false); await Promise.resolve();
  assert.equal(context.state, 'running');
  audio.play('launch'); assert.equal(context.starts, 2);
  assert.equal(contexts.length, 1);
  audio.dispose(); await Promise.resolve();
  assert.equal(context.state, 'closed');
});

test('reactivation stays silent while muted and resumes only when unmuted', async () => {
  const { audio, contexts } = setup();
  audio.configure(true, false); audio.unlock(); await Promise.resolve();
  const context = contexts[0];
  audio.configure(false, false); await Promise.resolve();
  assert.equal(context.state, 'suspended');
  audio.configure(true, true); await Promise.resolve();
  assert.equal(context.state, 'suspended');
  audio.configure(true, false); await Promise.resolve();
  assert.equal(context.state, 'running');
  audio.dispose();
});

test('rapid audio configuration changes leave the context in the latest requested state', async () => {
  const { audio, contexts } = setup();
  audio.configure(true, false); audio.unlock(); await Promise.resolve();
  const context = contexts[0];
  audio.configure(true, true); audio.configure(true, false);
  await Promise.resolve(); assert.equal(context.state, 'running');
  audio.configure(true, true); await Promise.resolve();
  audio.configure(true, false); audio.configure(false, false);
  await Promise.resolve(); assert.equal(context.state, 'suspended');
  audio.dispose();
});
