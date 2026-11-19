import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTsModule(relativePath, replacements = []) {
  let source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  for (const [pattern, replacement] of replacements) {
    source = source.replace(pattern, replacement);
  }
  const compiled = ts.transpile(source, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  });
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

const clockStateMod = await loadTsModule('./clockState.ts');
const clockAudioMod = await loadTsModule('./clockAudio.ts', [
  [/import specialRingtoneUrl[^;]+;/, "const specialRingtoneUrl = 'builtin:alarm-special-intro.mp3';"],
  [/import type \{[^}]+\} from '\.\/clockState';/, ''],
]);

test('alarm time normalization, stepping and remaining time formatting', () => {
  const {
    normalizeAlarmTime,
    stepAlarmTime,
    formatTimeUntilAlarm,
    minutesUntilAlarm,
  } = clockStateMod;

  assert.equal(normalizeAlarmTime('7:5'), '07:05');
  assert.equal(normalizeAlarmTime('23:59'), '23:59');
  assert.equal(normalizeAlarmTime('25:00', '08:00'), '08:00');
  assert.equal(normalizeAlarmTime('invalid', '07:30'), '07:30');

  assert.equal(stepAlarmTime('07:30', 1, 15), '08:45');
  assert.equal(stepAlarmTime('00:05', -1, -10), '22:55');
  assert.equal(stepAlarmTime('23:55', 0, 10), '00:05');

  const now = new Date(2026, 10, 19, 7, 0, 0);
  assert.equal(minutesUntilAlarm('07:30', now), 30);
  assert.equal(formatTimeUntilAlarm('07:30', now), '还有 30 分钟');
  assert.equal(formatTimeUntilAlarm('09:00', now), '还有 2 小时');
  assert.equal(formatTimeUntilAlarm('09:15', now), '还有 2 小时 15 分钟');
});

test('alarm tick triggers once per target minute and does not re-trigger in the same minute', () => {
  const { DEFAULT_CLOCK_STATE, evaluateClockTick } = clockStateMod;
  const base = {
    ...DEFAULT_CLOCK_STATE,
    alarmTime: '08:15',
    alarmEnabled: true,
  };

  const before = evaluateClockTick(base, new Date(2026, 10, 19, 8, 14, 59));
  assert.equal(before.triggered, null);

  const hit = evaluateClockTick(before.nextState, new Date(2026, 10, 19, 8, 15, 0));
  assert.equal(hit.triggered, 'alarm');
  assert.equal(hit.nextState.lastTriggeredKey, '2026-11-19T08:15');

  const sameMinute = evaluateClockTick(hit.nextState, new Date(2026, 10, 19, 8, 15, 42));
  assert.equal(sameMinute.triggered, null);

  const nextDay = evaluateClockTick(sameMinute.nextState, new Date(2026, 10, 20, 8, 15, 0));
  assert.equal(nextDay.triggered, 'alarm');
  assert.equal(nextDay.nextState.lastTriggeredKey, '2026-11-20T08:15');
});

test('countdown start, pause, resume, reset, completion and storage persistence', () => {
  const {
    CLOCK_STORAGE_KEY,
    DEFAULT_CLOCK_STATE,
    startCountdown,
    pauseCountdown,
    resetCountdown,
    evaluateClockTick,
    formatCountdown,
    loadClockState,
    saveClockState,
  } = clockStateMod;

  assert.equal(formatCountdown(65), '01:05');
  assert.equal(formatCountdown(3661), '01:01:01');

  const t0 = 1_700_000_000_000;
  const started = startCountdown(DEFAULT_CLOCK_STATE, t0, 10);
  assert.equal(started.countdownRunning, true);
  assert.equal(started.countdownDurationSec, 10);
  assert.equal(started.countdownRemainingSec, 10);
  assert.equal(started.countdownTargetTimestamp, t0 + 10_000);

  const midTick = evaluateClockTick(started, new Date(t0 + 4_200));
  assert.equal(midTick.triggered, null);
  assert.equal(midTick.remainingSec, 6);

  const paused = pauseCountdown(midTick.nextState, t0 + 4_200);
  assert.equal(paused.countdownRunning, false);
  assert.equal(paused.countdownRemainingSec, 6);

  const resumed = startCountdown(paused, t0 + 10_000);
  assert.equal(resumed.countdownRunning, true);
  assert.equal(resumed.countdownTargetTimestamp, t0 + 16_000);

  const done = evaluateClockTick(resumed, new Date(t0 + 16_000));
  assert.equal(done.triggered, 'countdown');
  assert.equal(done.nextState.countdownRunning, false);
  assert.equal(done.nextState.countdownRemainingSec, 10);

  const store = new Map();
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const savedState = { ...resumed, ringtone: 'special' };
  saveClockState(savedState, storage);
  assert.ok(store.has(CLOCK_STORAGE_KEY));

  const reloadedMidway = loadClockState(storage, t0 + 12_500);
  assert.equal(reloadedMidway.ringtone, 'special');
  assert.equal(reloadedMidway.countdownRunning, true);
  assert.equal(reloadedMidway.countdownRemainingSec, 4);

  const reset = resetCountdown(reloadedMidway, 120);
  assert.equal(reset.countdownRunning, false);
  assert.equal(reset.countdownDurationSec, 120);
  assert.equal(reset.countdownRemainingSec, 120);
});

test('clockHandAngles computes clockwise rotations for time and target hand', () => {
  const { DEFAULT_CLOCK_STATE, clockHandAngles } = clockStateMod;
  const now = new Date(2026, 10, 19, 3, 0, 0, 0);
  const angles = clockHandAngles(now, {
    ...DEFAULT_CLOCK_STATE,
    alarmEnabled: true,
    alarmTime: '06:00',
  });
  assert.ok(Math.abs(angles.hourAngle - (-Math.PI / 2)) < 1e-6);
  assert.ok(Math.abs(angles.minuteAngle) < 1e-6);
  assert.ok(Math.abs(angles.secondAngle) < 1e-6);
  assert.ok(Math.abs(angles.targetAngle - (-Math.PI)) < 1e-6);
});

test('ClockAudioPlayer plays classic synthesized alarm and special built-in intro audio with mute and cleanup', async () => {
  const { ClockAudioPlayer } = clockAudioMod;
  const oscillators = [];
  const audios = [];
  const intervals = new Set();

  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    gain = { gain: { value: 1 }, connect() {} };
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        stopped: false,
        frequency: { setValueAtTime() {} },
        connect() {},
        disconnect() {},
        start() {},
        stop() {
          this.stopped = true;
          this.onended?.();
        },
      };
      oscillators.push(osc);
      return osc;
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  class FakeAudio {
    loop = false;
    volume = 1;
    muted = false;
    currentTime = 0;
    paused = true;
    constructor(src) {
      this.src = src;
      audios.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {
      this.src = '';
    }
    load() {}
  }

  const prevWindow = globalThis.window;
  globalThis.window = {
    AudioContext: FakeAudioContext,
    Audio: FakeAudio,
    setInterval: fn => {
      intervals.add(fn);
      return fn;
    },
    clearInterval: fn => {
      intervals.delete(fn);
    },
  };

  try {
    const player = new ClockAudioPlayer();
    player.start('classic');
    assert.equal(player.isPlaying(), true);
    assert.equal(player.getActiveRingtone(), 'classic');
    assert.equal(oscillators.length, 8); // 4 pulses * 2 oscillators per pulse
    assert.equal(intervals.size, 1);

    player.setMuted(true);
    assert.ok(oscillators.every(o => o.stopped));
    player.setMuted(false);

    player.start('special');
    assert.equal(player.getActiveRingtone(), 'special');
    assert.equal(intervals.size, 0);
    assert.equal(audios.length, 1);
    assert.equal(audios[0].src, 'builtin:alarm-special-intro.mp3');
    assert.equal(audios[0].loop, true);
    assert.equal(audios[0].paused, false);

    player.setMuted(true);
    assert.equal(audios[0].muted, true);

    player.stop();
    assert.equal(player.isPlaying(), false);
    assert.equal(audios[0].paused, true);

    player.dispose();
  } finally {
    globalThis.window = prevWindow;
  }
});
