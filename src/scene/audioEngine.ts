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

export interface RoomAudioSnapshot {
  disc: MusicDisc;
  isPlaying: boolean;
  isMuted: boolean;
  status: 'idle' | 'starting' | 'playing' | 'paused' | 'error';
  error: string | null;
}

class RoomAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private isPlaying = false;
  private currentDisc: MusicDisc = PRESET_MUSIC_DISCS[0];
  private synthTimer: number | null = null;
  private stepIndex = 0;
  private htmlAudio: HTMLAudioElement | null = null;
  private preparedMusic: { disc: MusicDisc; audio: HTMLAudioElement } | null = null;
  private requestId = 0;
  private musicGain: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private listeners = new Set<() => void>();
  private snapshot: RoomAudioSnapshot = { disc: this.currentDisc, isPlaying: false, isMuted: false, status: 'idle', error: null };

  public getSnapshot = (): RoomAudioSnapshot => this.snapshot;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(status: RoomAudioSnapshot['status'], error: string | null = null) {
    this.snapshot = { disc: this.currentDisc, isPlaying: this.isPlaying, isMuted: this.isMuted, status, error };
    this.listeners.forEach(listener => listener());
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        if (typeof window.AudioContext !== 'function') return null;
        this.ctx = new window.AudioContext();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.isMuted ? 0 : 1;
        this.musicGain.connect(this.ctx.destination);
      }
      return this.ctx;
    } catch { return null; }
  }

  /** Call synchronously from a physical object's user gesture before its insertion animation. */
  public unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve(false);
    return (ctx.state === 'running' ? Promise.resolve() : ctx.resume())
      .then(() => ctx.state === 'running', () => false);
  }

  /** Prime the same media element during touch/click; audible playback waits for insertion. */
  public prepareMusic(disc: MusicDisc): void {
    void this.unlock();
    if (disc.audioUrl.startsWith('synth:') || (this.htmlAudio && this.currentDisc.id === disc.id && this.currentDisc.audioUrl === disc.audioUrl)) return;
    this.cancelPreparedMusic();
    try {
      const audio = new Audio(disc.audioUrl);
      audio.muted = true;
      audio.volume = 0;
      this.preparedMusic = { disc, audio };
      void audio.play().then(() => {
        if (this.preparedMusic?.audio !== audio) return;
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => { /* startMusic reports a recoverable playback error after insertion. */ });
    } catch { /* A browser without HTML audio is reported by startMusic. */ }
  }

  public cancelPreparedMusic(): void {
    const prepared = this.preparedMusic;
    this.preparedMusic = null;
    if (!prepared) return;
    prepared.audio.pause();
    prepared.audio.removeAttribute('src');
    prepared.audio.load();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.htmlAudio) {
      this.htmlAudio.muted = muted;
    }
    if (this.musicGain) this.musicGain.gain.value = muted ? 0 : 1;
    this.publish(this.snapshot.status, this.snapshot.error);
  }

  public playSfx(
    type: 'switch' | 'cat' | 'water' | 'paper' | 'soft' | 'disc'
  ) {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };

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

  /** Resolves only when playback really starts; stale and rejected requests resolve false. */
  public async startMusic(disc: MusicDisc): Promise<boolean> {
    const sameDisc = this.currentDisc.id === disc.id && this.currentDisc.audioUrl === disc.audioUrl;
    if (sameDisc && this.isPlaying) return true;
    const prepared = this.preparedMusic?.disc.id === disc.id && this.preparedMusic.disc.audioUrl === disc.audioUrl ? this.preparedMusic.audio : null;
    if (prepared) this.preparedMusic = null;
    if (!sameDisc) this.stopMusic();
    this.currentDisc = disc;
    const request = ++this.requestId;
    this.publish('starting');
    try {
      if (!disc.audioUrl.startsWith('synth:')) {
        if (!this.htmlAudio) {
          const audio = prepared ?? new Audio(disc.audioUrl);
          audio.loop = true;
          audio.volume = 0.65;
          audio.muted = this.isMuted;
          audio.onerror = () => {
            if (this.htmlAudio !== audio) return;
            this.pauseMusic();
            this.publish('error', '这张唱片暂时无法播放，请重新选择音乐。');
          };
          audio.onpause = () => {
            if (this.htmlAudio === audio && audio.paused && this.isPlaying) this.pauseMusic();
          };
          this.htmlAudio = audio;
        }
        const audio = this.htmlAudio;
        await audio.play();
        if (request !== this.requestId) {
          if (audio !== this.htmlAudio || (!this.isPlaying && this.snapshot.status !== 'starting')) audio.pause();
          return false;
        }
      } else {
        const ctx = this.ensureContext();
        if (!ctx) throw new Error('Audio unavailable');
        if (ctx.state !== 'running') await ctx.resume();
        if (ctx.state !== 'running') throw new Error('Audio suspended');
      }
      if (request !== this.requestId) return false;
      this.isPlaying = true;
      if (disc.audioUrl.startsWith('synth:')) this.startSynth();
      this.publish('playing');
      return true;
    } catch {
      if (request !== this.requestId) return false;
      this.pauseMusic();
      this.publish('error', '音乐未能开始播放，请再次触碰唱机。');
      return false;
    }
  }

  private startSynth() {
    if (this.synthTimer !== null) window.clearInterval(this.synthTimer);
    const scales: Record<string, number[]> = {
      'lofi-sunset': [261.63, 329.63, 392, 493.88, 523.25, 392, 329.63, 293.66],
      'midnight-rain': [220, 261.63, 329.63, 392, 440, 329.63, 293.66, 246.94],
      'warm-vinyl': [293.66, 369.99, 440, 554.37, 587.33, 440, 369.99, 329.63],
      'starlight-dream': [349.23, 440, 523.25, 659.25, 587.33, 523.25, 440, 392],
    };
    const notes = scales[this.currentDisc.synthPreset ?? 'lofi-sunset'] ?? scales['lofi-sunset'];
    const playStep = () => {
      const ctx = this.ctx;
      if (!this.isPlaying || !ctx || ctx.state !== 'running' || !this.musicGain) return;
      const frequency = notes[this.stepIndex++ % notes.length];
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.62);
      gain.connect(this.musicGain);
      let remaining = 2;
      for (const [type, multiplier] of [['sine', 1], ['triangle', 0.5]] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency * multiplier, now);
        osc.connect(gain);
        this.voices.add(osc);
        osc.onended = () => {
          this.voices.delete(osc);
          osc.disconnect();
          if (--remaining === 0) gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 0.65);
      }
    };
    playStep();
    this.synthTimer = window.setInterval(playStep, 520);
  }

  /** Keeps the selected disc and playback position for resumeMusic/startMusic(sameDisc). */
  public pauseMusic() {
    ++this.requestId;
    this.isPlaying = false;
    if (this.synthTimer !== null) window.clearInterval(this.synthTimer);
    this.synthTimer = null;
    this.htmlAudio?.pause();
    this.voices.forEach(voice => { try { voice.stop(); } catch { /* Already ended. */ } });
    this.voices.clear();
    this.publish('paused');
  }

  public resumeMusic(): Promise<boolean> { return this.startMusic(this.currentDisc); }

  /** Legacy stop API releases playback resources; object URL ownership stays with the caller. */
  public stopMusic() {
    this.pauseMusic();
    this.cancelPreparedMusic();
    if (this.htmlAudio) {
      this.htmlAudio.onerror = null;
      this.htmlAudio.onpause = null;
      this.htmlAudio.removeAttribute('src');
      this.htmlAudio.load();
      this.htmlAudio = null;
    }
    this.stepIndex = 0;
    this.publish('idle');
  }
}

export const roomAudio = new RoomAudioEngine();
