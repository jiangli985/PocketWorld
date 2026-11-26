type Texture = 'surf' | 'wake' | 'pier' | 'room' | 'kitchen' | 'wind';
type Instrument = 'bell' | 'plucked' | 'reed';
type Arrangement = Readonly<{
  beat: number;
  instrument: Instrument;
  texture: Texture;
  roots: readonly number[];
  notes: readonly number[];
}>;

// MIDI note numbers. Zero leaves a rest. The opening four notes return in the harbor and journal.
const arrangements = {
  home: { beat: .60, instrument: 'bell', texture: 'surf', roots: [43, 40, 48, 50], notes: [
    67, 0, 69, 71, 74, 0, 71, 0, 64, 0, 67, 69, 71, 0, 67, 0,
    72, 0, 74, 76, 79, 0, 76, 0, 74, 0, 71, 69, 67, 0, 0, 0,
  ] },
  boat: { beat: .65, instrument: 'plucked', texture: 'surf', roots: [43, 47, 48, 50], notes: [
    67, 0, 71, 0, 74, 0, 69, 0, 66, 0, 69, 0, 74, 0, 71, 0,
    64, 0, 67, 0, 72, 0, 76, 0, 74, 0, 71, 0, 69, 0, 0, 0,
  ] },
  crossing: { beat: .42, instrument: 'plucked', texture: 'wake', roots: [43, 50], notes: [
    67, 71, 74, 79, 76, 74, 71, 0, 69, 71, 74, 76, 74, 71, 69, 0,
  ] },
  dock: { beat: .52, instrument: 'reed', texture: 'pier', roots: [48, 45, 41, 43], notes: [
    67, 0, 69, 71, 72, 0, 69, 67, 64, 0, 67, 69, 72, 0, 74, 0,
    76, 0, 72, 69, 65, 0, 69, 0, 74, 0, 71, 67, 69, 0, 67, 0,
  ] },
  tackle: { beat: .52, instrument: 'plucked', texture: 'room', roots: [45, 48, 41, 43], notes: [
    69, 72, 76, 0, 72, 69, 64, 0, 67, 72, 76, 0, 79, 76, 72, 0,
    65, 69, 72, 0, 76, 72, 69, 0, 67, 71, 74, 0, 71, 67, 0, 0,
  ] },
  market: { beat: .44, instrument: 'reed', texture: 'kitchen', roots: [48, 45, 41, 43], notes: [
    72, 0, 76, 79, 81, 79, 76, 0, 72, 69, 0, 72, 76, 0, 72, 0,
    65, 69, 72, 0, 74, 72, 69, 0, 67, 71, 74, 77, 76, 74, 71, 0,
  ] },
  journal: { beat: .66, instrument: 'bell', texture: 'room', roots: [48, 50, 47, 43], notes: [
    67, 0, 69, 71, 76, 0, 72, 0, 69, 0, 74, 0, 78, 0, 74, 0,
    71, 0, 74, 0, 78, 0, 74, 0, 72, 0, 71, 69, 67, 0, 0, 0,
  ] },
  fight: { beat: .34, instrument: 'plucked', texture: 'wind', roots: [40, 36, 38, 40], notes: [
    64, 0, 67, 64, 71, 0, 67, 64, 60, 0, 64, 60, 67, 0, 64, 60,
    62, 0, 65, 62, 69, 0, 65, 62, 64, 67, 71, 67, 76, 71, 67, 0,
  ] },
  result: { beat: .60, instrument: 'bell', texture: 'room', roots: [43, 48], notes: [
    74, 71, 67, 0, 69, 71, 74, 0, 76, 0, 72, 0, 67, 0, 0, 0,
  ] },
  career: { beat: .58, instrument: 'reed', texture: 'room', roots: [43, 48, 40, 50], notes: [
    67, 74, 79, 0, 79, 81, 83, 0, 84, 0, 79, 76, 72, 76, 79, 0,
    83, 0, 79, 76, 71, 76, 79, 0, 81, 79, 76, 74, 79, 0, 0, 0,
  ] },
} satisfies Record<string, Arrangement>;

export type FishingSoundscape = keyof typeof arrangements;
const sampleRate = 16_000;
const tau = Math.PI * 2;

function note(samples: Float32Array, pitch: number, at: number, duration: number, volume: number, instrument: Instrument) {
  const start = Math.round(at * sampleRate);
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const [second, third, decay] = instrument === 'bell' ? [.18, .24, 5] : instrument === 'reed' ? [.29, .13, 3.4] : [.32, .07, 7];
  for (let i = 0; i < duration * sampleRate; i++) {
    const time = i / sampleRate;
    const phase = tau * frequency * time;
    const attack = Math.min(1, time / .018);
    const release = Math.min(1, (duration - time) / .08);
    const wave = Math.sin(phase) + second * Math.sin(phase * 2) + third * Math.sin(phase * 3.01);
    samples[(start + i) % samples.length] += volume * wave * attack * release * Math.exp(-time * decay);
  }
}

function texture(samples: Float32Array, scene: Texture, beat: number) {
  let seed = 9147;
  let soft = 0;
  let low = 0;
  const level = { surf: .037, wake: .054, pier: .020, room: .006, kitchen: .024, wind: .044 }[scene];
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2 ** 31 - 1;
    soft += (noise - soft) * .11;
    low += (soft - low) * .019;
    const cycle = i / samples.length;
    const swell = .68 + .24 * Math.sin(tau * cycle * 3) + .08 * Math.sin(tau * cycle * 7);
    const pulse = (i / (sampleRate * beat)) % 2;
    const edge = Math.min(1, i / 128, (samples.length - i) / 128);
    const sound = scene === 'kitchen'
      ? (noise - soft) * (.18 + .6 * Math.exp(-pulse * 16))
      : scene === 'pier'
        ? soft * swell + .3 * (noise - soft) * Math.exp(-pulse * 20)
        : (soft * .65 + low * 2.2) * swell;
    samples[i] += sound * level * edge;
  }
}

export function createSoundscape(context: AudioContext, scene: FishingSoundscape) {
  const { beat, instrument, roots, notes, texture: atmosphere } = arrangements[scene];
  const subdivisions = beat / 2;
  const buffer = context.createBuffer(1, Math.round(notes.length * subdivisions * sampleRate), sampleRate);
  const samples = buffer.getChannelData(0);
  texture(samples, atmosphere, beat);
  for (const [index, pitch] of notes.entries()) {
    if (pitch) note(samples, pitch, index * subdivisions, beat * (instrument === 'bell' ? 2.2 : 1.25), .039, instrument);
  }
  for (const [index, root] of roots.entries()) {
    const bar = index * beat * 4;
    note(samples, root, bar, beat * 1.8, .027, 'plucked');
    if (scene === 'career') {
      note(samples, root + 12, bar, beat * 2.5, .018, 'reed');
      note(samples, root + (index === 2 ? 15 : 16), bar + beat * .5, beat * 1.8, .016, 'bell');
    }
    note(samples, root + 7, bar + beat * 1.5, beat * 1.3, .018, 'plucked');
    note(samples, root + 12, bar + beat * 2.5, beat, .015, 'bell');
    if (scene === 'fight' || scene === 'market') note(samples, root, bar + beat * 3, beat * .8, .02, 'plucked');
  }
  return buffer;
}
