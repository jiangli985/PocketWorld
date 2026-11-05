import { MusicDisc } from '../types/interactable';

export const PRESET_MUSIC_DISCS: MusicDisc[] = [
  {
    id: 'disc-lofi-sunset',
    title: '午后暖阳 (Sunset Window)',
    artist: 'Pocket Studio · Lo-Fi Vinyl',
    audioUrl: 'synth:lofi-sunset',
    discThemeColor: ['#f59e0b', '#fb7185'],
    synthPreset: 'lofi-sunset',
    duration: 168,
  },
  {
    id: 'disc-midnight-rain',
    title: '静谧星夜 (Midnight Study)',
    artist: 'Pocket Studio · Ambient',
    audioUrl: 'synth:midnight-rain',
    discThemeColor: ['#38bdf8', '#818cf8'],
    synthPreset: 'midnight-rain',
    duration: 194,
  },
  {
    id: 'disc-warm-vinyl',
    title: '木质留声 (Warm Oak & Coffee)',
    artist: 'Pocket Studio · Acoustic',
    audioUrl: 'synth:warm-vinyl',
    discThemeColor: ['#34d399', '#059669'],
    synthPreset: 'warm-vinyl',
    duration: 152,
  },
  {
    id: 'disc-starlight-dream',
    title: '微缩梦境 (Diorama Reverie)',
    artist: 'Pocket Studio · Chillhop',
    audioUrl: 'synth:starlight-dream',
    discThemeColor: ['#c084fc', '#f472b6'],
    synthPreset: 'starlight-dream',
    duration: 180,
  },
];

/**
 * 根据本地音频文件名生成专属双色光盘渐变主题
 */
export function generateDiscColorsFromName(fileName: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < fileName.length; i++) {
    hash = (hash * 31 + fileName.charCodeAt(i)) >>> 0;
  }
  const palettes: [string, string][] = [
    ['#f97316', '#ec4899'],
    ['#06b6d4', '#3b82f6'],
    ['#10b981', '#14b8a6'],
    ['#eab308', '#f97316'],
    ['#8b5cf6', '#ec4899'],
    ['#38bdf8', '#34d399'],
  ];
  return palettes[hash % palettes.length];
}

class RoomAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private isPlaying = false;
  private currentDisc: MusicDisc = PRESET_MUSIC_DISCS[0];
  private synthTimer: number | null = null;
  private stepIndex = 0;
  private htmlAudio: HTMLAudioElement | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      if (typeof window.AudioContext === 'function') {
        this.ctx = new window.AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.htmlAudio) {
      this.htmlAudio.muted = muted;
    }
  }

  public playSfx(
    type: 'switch' | 'cat' | 'water' | 'paper' | 'soft' | 'disc'
  ) {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'switch') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.045);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'cat') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.28);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'water') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'paper') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (type === 'disc') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(310, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.16);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.07);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.09);
    }
  }

  public startMusic(disc: MusicDisc) {
    this.stopMusic();
    this.currentDisc = disc;
    this.isPlaying = true;

    if (!disc.audioUrl.startsWith('synth:')) {
      this.htmlAudio = new Audio(disc.audioUrl);
      this.htmlAudio.loop = true;
      this.htmlAudio.volume = 0.65;
      this.htmlAudio.muted = this.isMuted;
      this.htmlAudio.play().catch(() => {});
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const scales: Record<string, number[]> = {
      'lofi-sunset': [261.63, 329.63, 392.0, 493.88, 523.25, 392.0, 329.63, 293.66],
      'midnight-rain': [220.0, 261.63, 329.63, 392.0, 440.0, 329.63, 293.66, 246.94],
      'warm-vinyl': [293.66, 369.99, 440.0, 554.37, 587.33, 440.0, 369.99, 329.63],
      'starlight-dream': [349.23, 440.0, 523.25, 659.25, 587.33, 523.25, 440.0, 392.0],
    };

    const notes = scales[disc.synthPreset ?? 'lofi-sunset'] ?? scales['lofi-sunset'];
    this.stepIndex = 0;

    const playStep = () => {
      if (!this.isPlaying || this.isMuted) return;
      const audioCtx = this.ensureContext();
      if (!audioCtx) return;

      const freq = notes[this.stepIndex % notes.length];
      this.stepIndex += 1;

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const subOsc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(freq * 0.5, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.62);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + 0.65);
      subOsc.stop(now + 0.65);
    };

    playStep();
    this.synthTimer = window.setInterval(playStep, 520);
  }

  public stopMusic() {
    this.isPlaying = false;
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio = null;
    }
  }
}

export const roomAudio = new RoomAudioEngine();
