export type QualityLevel = 0 | 1 | 2;

export const SCENE_QUALITY = [
  { dpr: 1, shadowSize: 1024 },
  { dpr: 1.25, shadowSize: 1024 },
  { dpr: 1.6, shadowSize: 2048 },
] as const;

const MAX_SCENE_PIXELS = 2_000_000;

export function sceneMaxDpr(qualityDpr: number, width: number, height: number, devicePixelRatio = 2): number {
  const safeDevice = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const area = Math.max(1, (Number.isFinite(width) ? width : 0) * (Number.isFinite(height) ? height : 0));
  const areaCap = width > 0 && height > 0 ? Math.max(1, Math.sqrt(MAX_SCENE_PIXELS / area)) : qualityDpr;
  return +Math.min(qualityDpr, safeDevice, areaCap).toFixed(2);
}
export function createQualityState() {
  return {
    level: 2 as QualityLevel,
    time: 0,
    recoverAfter: 0,
    warmup: 3,
    elapsed: 0,
    frames: 0,
    slowWindows: 0,
    fastWindows: 0,
  };
}

export function resetQualitySamples(state: ReturnType<typeof createQualityState>) {
  state.warmup = 3;
  state.elapsed = 0;
  state.frames = 0;
  state.slowWindows = state.fastWindows = 0;
}

export function sampleQuality(state: ReturnType<typeof createQualityState>, delta: number, eligible = true): QualityLevel | null {
  if (!eligible || !Number.isFinite(delta) || delta <= 0 || delta > 1) {
    resetQualitySamples(state);
    return null;
  }
  state.time += delta;
  if (state.warmup > 0) {
    state.warmup -= delta;
    return null;
  }
  state.elapsed += delta;
  state.frames++;
  if (state.elapsed < 2) return null;
  const fps = state.frames / state.elapsed;
  state.slowWindows = fps < 42 ? state.slowWindows + 1 : 0;
  state.fastWindows = fps > 57 ? state.fastWindows + 1 : 0;
  state.elapsed = 0;
  state.frames = 0;
  let level = state.level;
  if (state.slowWindows >= 2 && level > 0) level--;
  else if (state.fastWindows >= 8 && state.time >= state.recoverAfter && level < 2) level++;
  if (level === state.level) return null;
  state.level = level as QualityLevel;
  state.recoverAfter = state.time + 30;
  resetQualitySamples(state);
  return state.level;
}
