import { createSoundscape, type FishingSoundscape } from './soundscape.ts';

// Short cues over one looped scene score. Everything is scheduled against the audio clock.
const cues = {
  cast: [430, 185, .15, 'sine'],
  tap: [350, 210, 0.085, 'sine'],
  splash: [360, 115, .13, 'sine'],
  nibble: [710, 395, .065, 'sine'],
  bite: [265, 91, .22, 'sine'],
  strike: [145, 63, .29, 'triangle'],
  reel: [540, 820, .13, 'triangle'],
  locked: [523, 1047, .23, 'triangle'],
  slip: [330, 152, .17, 'triangle'],
  escape: [465, 92, .29, 'sine'],
  catch: [523, 1047, .32, 'triangle'],
  rareCatch: [587, 1319, .48, 'triangle'],
  record: [523, 1568, .66, 'triangle'],
  honors: [392, 1175, .66, 'triangle'],
  ticket: [540, 690, .12, 'sine'],
  stove: [255, 420, .20, 'triangle'],
  chop: [325, 182, .10, 'triangle'],
  sale: [750, 1100, 0.19, 'triangle'],
  guest: [587, 1175, 0.38, 'triangle'],
  upgrade: [440, 880, 0.32, 'triangle'],
  crossing: [185, 90, .48, 'sine'],
  dock: [380, 245, .17, 'triangle'],
  door: [660, 895, .24, 'sine'],
  journal: [720, 470, .15, 'sine'],
  result: [392, 784, .40, 'triangle'],
} as const;

type Cue = keyof typeof cues;
type Tone = Readonly<{ from: number; to: number; duration: number; wave: OscillatorType; delay: number; volume: number }>;
const layers: Partial<Record<Cue, Tone>> = {
  splash: { from: 680, to: 410, duration: .055, wave: 'triangle', delay: .015, volume: .025 },
  bite: { from: 820, to: 360, duration: .1, wave: 'triangle', delay: .024, volume: .046 },
  strike: { from: 760, to: 211, duration: .18, wave: 'triangle', delay: .016, volume: .055 },
  reel: { from: 870, to: 640, duration: .05, wave: 'square', delay: .030, volume: .018 },
  locked: { from: 660, to: 784, duration: .21, wave: 'sine', delay: .055, volume: .040 },
  catch: { from: 392, to: 784, duration: .25, wave: 'sine', delay: .038, volume: .043 },
  rareCatch: { from: 440, to: 880, duration: .40, wave: 'triangle', delay: .055, volume: .042 },
  record: { from: 262, to: 784, duration: .57, wave: 'triangle', delay: .07, volume: .046 },
};
const catchCues: readonly Cue[] = ['catch', 'rareCatch', 'record'];

type Voice = { oscillator: OscillatorNode; gain: GainNode };
type Track = { source: AudioBufferSourceNode; gain: GainNode; scene: FishingSoundscape; start: number };
const crossfade = .22;

export function createFishingAudio(openContext: () => AudioContext = () => new AudioContext()) {
  let context: AudioContext | undefined;
  let unlocked = false;
  let enabled = false;
  let disposed = false;
  const voices = new Set<Voice>();
  const loops = new Map<FishingSoundscape, AudioBuffer>();
  let desired: FishingSoundscape | undefined;
  let current: Track | undefined;
  let outgoing: Track | undefined;
  let musicGain: GainNode | undefined;

  function releaseTrack(track: Track | undefined) {
    if (!track) return;
    track.source.onended = null;
    track.source.disconnect();
    track.gain.disconnect();
    try { track.source.stop(); } catch { /* It may already have ended. */ }
  }

  function updateTrack() {
    const ctx = context;
    if (!enabled || !unlocked || !desired || ctx?.state !== 'running' || current?.scene === desired) return;
    let next: Track | undefined;
    try {
      let buffer = loops.get(desired);
      if (!buffer) {
        buffer = createSoundscape(ctx, desired);
        loops.set(desired, buffer);
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      next = { source, gain, scene: desired, start: now };
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(1, now + crossfade);
      source.connect(gain);
      if (!musicGain) {
        musicGain = ctx.createGain();
        musicGain.connect(ctx.destination);
      }
      gain.connect(musicGain);
      source.start(now);

      releaseTrack(outgoing);
      outgoing = current;
      current = next;
      const fading = outgoing;
      if (fading) {
        const age = Math.min(1, Math.max(0, (now - fading.start) / crossfade));
        fading.gain.gain.cancelScheduledValues(now);
        fading.gain.gain.setValueAtTime(.0001 ** (1 - age), now);
        fading.gain.gain.exponentialRampToValueAtTime(.0001, now + crossfade);
        fading.source.onended = () => {
          releaseTrack(fading);
          if (outgoing === fading) outgoing = undefined;
        };
        fading.source.stop(now + crossfade);
      }
    } catch {
      releaseTrack(next);
      if (current === next) current = undefined;
    }
  }

  function release(voice: Voice) {
    if (!voices.delete(voice)) return;
    voice.oscillator.onended = null;
    voice.oscillator.disconnect();
    voice.gain.disconnect();
  }

  function silence() {
    releaseTrack(current);
    releaseTrack(outgoing);
    current = outgoing = undefined;
    musicGain?.disconnect();
    musicGain = undefined;
    for (const voice of voices) {
      release(voice); // Disconnect immediately, independent of the context state transition.
      try { voice.oscillator.stop(); } catch { /* It may already have ended. */ }
    }
  }

  function resume(ctx: AudioContext) {
    try {
      void ctx.resume().then(() => {
        if (ctx !== context) return;
        unlocked = true;
        updateTrack();
      }).catch(() => {});
    } catch { /* Audio is optional. */ }
  }

  function voice(ctx: AudioContext, tone: Tone, accents: readonly number[] = []) {
    if (voices.size >= 4) return;
    let current: Voice | undefined;
    try {
      const start = ctx.currentTime + tone.delay;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const node = { oscillator, gain };
      current = node;
      voices.add(node);
      oscillator.onended = () => release(node);
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.from, start);
      accents.forEach((pitch, index) => oscillator.frequency.setValueAtTime(pitch, start + .075 * (index + 1)));
      oscillator.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.volume, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + tone.duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + tone.duration);
    } catch {
      if (current) release(current);
    }
  }

  return {
    setScene(scene: FishingSoundscape) {
      if (desired === scene || disposed) return;
      desired = scene;
      updateTrack();
    },
    setEnabled(value: boolean) {
      if (disposed || enabled === value) return;
      enabled = value;
      if (!enabled) {
        silence();
        try { void context?.suspend().catch(() => {}); } catch { /* Audio is optional. */ }
      } else if (context && unlocked) resume(context);
    },
    /** Called synchronously from a trusted click/keypress, never a frame or lifecycle event. */
    unlock() {
      if (!enabled || disposed || (unlocked && context?.state === 'running')) return;
      try { resume(context ??= openContext()); } catch { /* Disabled/unsupported Web Audio. */ }
    },
    play(cue: Cue) {
      const ctx = context;
      if (!enabled || !unlocked || ctx?.state !== 'running') return;
      const reward = catchCues.includes(cue);
      if (reward) {
        // Reserve room for the reward even if the last reel or a shop cue is winding down.
        for (const prior of voices) {
          release(prior);
          try { prior.oscillator.stop(); } catch { /* It may already have ended. */ }
        }
        const music = musicGain?.gain;
        const now = ctx.currentTime;
        music?.cancelScheduledValues(now);
        music?.setValueAtTime(1, now);
        music?.exponentialRampToValueAtTime(cue === 'catch' ? .48 : .27, now + .045);
        music?.exponentialRampToValueAtTime(1, now + .8);
      }
      const [from, to, duration, wave] = cues[cue];
      const accents = cue === 'record' || cue === 'honors' ? [784, 1047, 1319]
        : cue === 'rareCatch' ? [784, 988, 1175] : cue === 'catch' || cue === 'guest' ? [784, 988] : [];
      voice(ctx, { from, to, duration, wave, delay: 0, volume: reward ? .1 : .065 }, accents);
      const layer = layers[cue];
      if (layer) voice(ctx, layer);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      silence();
      const ctx = context;
      context = undefined;
      loops.clear();
      try { void ctx?.close().catch(() => {}); } catch { /* Already released. */ }
    },
  };
}
