import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFishingAudio } from './audio.ts';

const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
function audioContext() {
  const voices = [];
  const transitions = [];
  const sources = [];
  return {
    state: 'suspended', currentTime: 0, destination: {}, voices, transitions, sources,
    resume() { transitions.push('resume'); this.state = 'running'; return Promise.resolve(); },
    suspend() { transitions.push('suspend'); this.state = 'suspended'; return Promise.resolve(); },
    close() { transitions.push('close'); this.state = 'closed'; return Promise.resolve(); },
    createGain() {
      const ramps = [];
      return { ramps, gain: { ...param, exponentialRampToValueAtTime(...args) { ramps.push(args); } },
        connect(destination) { this.destination = destination; },
        disconnect() { this.disconnected = true; } };
    },
    createBuffer(_channels, length) {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    },
    createBufferSource() {
      const source = {
        connect(gain) { this.gain = gain; }, start() { this.started = true; },
        stop(time) { this.stoppedAt = time; }, disconnect() { this.disconnected = true; },
      };
      sources.push(source);
      return source;
    },
    createOscillator() {
      const oscillator = { frequency: param, connect(gain) { this.gain = gain; }, start() {}, stop() {}, disconnect() { this.disconnected = true; } };
      voices.push(oscillator);
      return oscillator;
    },
  };
}

test('scene scores start after a gesture, replace old tracks and release every source on mute', async () => {
  const ctx = audioContext();
  const audio = createFishingAudio(() => ctx);
  audio.setEnabled(true);
  audio.setScene('home');
  assert.equal(ctx.sources.length, 0);
  audio.unlock();
  await Promise.resolve();
  const [home] = ctx.sources;
  assert.equal(home.loop, true);
  assert.ok(home.buffer.getChannelData(0).some(sample => sample > .01));
  audio.setScene('dock');
  audio.setScene('dock');
  assert.equal(ctx.sources.length, 2);
  const dock = ctx.sources[1];
  assert.notEqual(dock.buffer.getChannelData(0).length, home.buffer.getChannelData(0).length);
  assert.ok(home.stoppedAt > 0);
  audio.setScene('market');
  assert.ok(home.disconnected);
  audio.setEnabled(false);
  assert.ok(ctx.sources.every(source => source.disconnected && source.gain.disconnected));
  const market = ctx.sources.at(-1).buffer;
  audio.setEnabled(true);
  await Promise.resolve();
  assert.equal(ctx.sources.at(-1).buffer, market);
  audio.dispose();
  assert.equal(ctx.state, 'closed');
});

test('no context until gesture, four bounded voices, immediate silence and release', async () => {
  const ctx = audioContext();
  let opens = 0;
  const audio = createFishingAudio(() => { opens++; return ctx; });
  audio.unlock();
  audio.setEnabled(true);
  audio.play('tap');
  assert.equal(opens, 0);
  audio.unlock();
  await Promise.resolve();
  for (let i = 0; i < 6; i++) audio.play('tap');
  assert.equal(ctx.voices.length, 4);
  ctx.voices[0].onended();
  audio.play('sale');
  assert.equal(ctx.voices.length, 5);
  audio.setEnabled(false);
  assert(ctx.voices.every(voice => voice.onended === null && voice.disconnected && voice.gain.disconnected));
  assert.equal(ctx.state, 'suspended');
  audio.play('sale');
  assert.equal(ctx.voices.length, 5);
  audio.setEnabled(true);
  audio.play('catch');
  assert.equal(ctx.voices.length, 7);
  audio.dispose();
  audio.dispose();
  assert(ctx.voices.at(-1).disconnected);
  assert.deepEqual(ctx.transitions, ['resume', 'suspend', 'resume', 'close']);
});

test('a late gesture resume resolution after suspension or disposal never starts a cue', async () => {
  for (const stop of ['suspend', 'dispose']) {
    const ctx = audioContext();
    const resume = Promise.withResolvers();
    ctx.resume = () => resume.promise;
    const audio = createFishingAudio(() => ctx);
    audio.setEnabled(true);
    audio.unlock();
    if (stop === 'dispose') audio.dispose();
    else audio.setEnabled(false);
    resume.resolve();
    await Promise.resolve();
    audio.play('catch');
    assert.equal(ctx.voices.length, 0);
    assert.equal(ctx.state, stop === 'dispose' ? 'closed' : 'suspended');
    audio.dispose();
  }
});

test('landing reserves both cue voices and briefly ducks only the music bus', async () => {
  const ctx = audioContext();
  const audio = createFishingAudio(() => ctx);
  audio.setEnabled(true);
  audio.setScene('boat');
  audio.unlock();
  await Promise.resolve();
  const music = ctx.sources[0].gain.destination;
  audio.play('bite');
  audio.play('reel');
  assert.equal(ctx.voices.length, 4);
  audio.play('rareCatch');
  assert.ok(ctx.voices.slice(0, 4).every(voice => voice.disconnected));
  assert.deepEqual(music.ramps, [[.27, .045], [1, .8]]);
  assert.equal(ctx.voices.length, 6);
  assert.ok(ctx.voices.slice(-2).every(voice => voice.gain.destination === ctx.destination));
  audio.dispose();
  assert.ok(music.disconnected);
});
