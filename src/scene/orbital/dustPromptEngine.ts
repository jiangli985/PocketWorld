export interface DustPoint {
  x: number;
  y: number;
}

export interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  alpha: number;
  size: number;
  tone: number;
  mode: 'converge' | 'disperse';
  delay: number;
  age: number;
  life: number;
  maxLife: number;
  curl: number;
  driftAccel: number;
}

export interface DustPromptState {
  text: string;
  centerX: number;
  centerY: number;
  particles: DustParticle[];
  settleProgress: number;
  active: boolean;
}

export const MAX_DUST_PARTICLES = 3800;
export const DUST_TONES = ['#fffaf0', '#f5ebd6', '#e6d1a7', '#ffffff', '#d4e2db'] as const;
// Match the shared keycap size in orbital.css.
export const PROMPT_KEYCAP_SIZE = 23;
export const PROMPT_KEYCAP_GAP = 7;
export const PROMPT_SHORTCUT_GAP = 16;

const SPRING_STIFFNESS = 155;
const SPRING_DAMPING = 24.5;
export function createDustPromptState(): DustPromptState {
  return {
    text: '',
    centerX: 0,
    centerY: 0,
    particles: [],
    settleProgress: 0,
    active: false,
  };
}

export function decimatePoints(points: readonly DustPoint[], maxCount = MAX_DUST_PARTICLES): DustPoint[] {
  if (points.length <= maxCount) return points.slice();
  const sampled: DustPoint[] = [];
  const step = points.length / maxCount;
  for (let i = 0; i < maxCount; i++) {
    sampled.push(points[Math.floor(i * step)]);
  }
  return sampled;
}

export function splitPromptLines(text: string, measure: (value: string) => number, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (measure(trimmed) <= maxWidth) return [trimmed];
  const parts = trimmed.split(' · ');
  if (parts.length > 1) {
    let bestIndex = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < parts.length; i++) {
      const left = parts.slice(0, i).join(' · ');
      const right = parts.slice(i).join(' · ');
      const diff = Math.abs(measure(left) - measure(right));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
    const line1 = parts.slice(0, bestIndex).join(' · ');
    const line2 = parts.slice(bestIndex).join(' · ');
    if (measure(line1) <= maxWidth && measure(line2) <= maxWidth) {
      return [line1, line2];
    }
  }
  const mid = Math.ceil(trimmed.length / 2);
  return [trimmed.slice(0, mid), trimmed.slice(mid)];
}

interface PromptShortcut {
  key: string;
  label: string;
  width: number;
}

export function layoutPromptShortcuts(text: string, measure: (label: string) => number, maxWidth: number): PromptShortcut[][] {
  const rows: PromptShortcut[][] = [[]];
  let row = rows[0];
  let rowWidth = 0;
  for (const entry of text.trim().split('　')) {
    const match = /^([EQT]) · (.+)$/.exec(entry);
    if (!match) return [];
    const [, key, label] = match;
    const width = PROMPT_KEYCAP_SIZE + PROMPT_KEYCAP_GAP + measure(label);
    if (row.length && rowWidth + PROMPT_SHORTCUT_GAP + width > maxWidth) {
      row = [];
      rows.push(row);
      rowWidth = 0;
    }
    if (row.length) rowWidth += PROMPT_SHORTCUT_GAP;
    row.push({ key, label, width });
    rowWidth += width;
  }
  return rows;
}

function toDisperse(
  particle: DustParticle,
  reducedMotion: boolean,
  random: () => number,
): void {
  if (particle.mode === 'disperse') return;
  particle.mode = 'disperse';
  particle.life = 0;
  particle.delay = 0;
  if (reducedMotion) {
    particle.maxLife = 0.12;
    particle.vx = 0;
    particle.vy = 0;
    particle.curl = 0;
    particle.driftAccel = 0;
    return;
  }
  particle.vx = Math.max(particle.vx, 0) + 125 + random() * 190;
  particle.vy = particle.vy * 0.25 + (random() - 0.5) * 28 - 4;
  particle.maxLife = 0.52 + random() * 0.42;
  particle.curl = (random() - 0.5) * 24;
  particle.driftAccel = 180 + random() * 170;
}

export function setDustTargets(
  state: DustPromptState,
  text: string,
  points: readonly DustPoint[],
  centerX: number,
  centerY: number,
  reducedMotion = false,
  random: () => number = Math.random,
): void {
  const normalized = text.trim();
  state.centerX = centerX;
  state.centerY = centerY;

  if (!normalized || points.length === 0) {
    state.text = '';
    for (const particle of state.particles) {
      toDisperse(particle, reducedMotion, random);
    }
    state.active = state.particles.length > 0;
    return;
  }

  const bounded = decimatePoints(points, MAX_DUST_PARTICLES);
  const hadActive = state.particles.length > 0;
  state.text = normalized;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const pt of bounded) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
  }
  const spanX = Math.max(1, maxX - minX);

  const nextParticles: DustParticle[] = [];
  const count = bounded.length;
  for (let i = 0; i < count; i++) {
    const target = bounded[i];
    const normX = (target.x - minX) / spanX;
    const reused = i < state.particles.length ? state.particles[i] : null;
    if (reused) {
      reused.tx = target.x;
      reused.ty = target.y;
      reused.mode = 'converge';
      reused.life = 0;
      reused.delay = reducedMotion ? 0 : random() * 0.06;
      if (reducedMotion) {
        reused.x = target.x;
        reused.y = target.y;
        reused.vx = 0;
        reused.vy = 0;
        reused.alpha = 1;
      }
      nextParticles.push(reused);
    } else {
      const flyOffset = reducedMotion ? 0 : 130 + random() * 165;
      const x = target.x - flyOffset;
      const y = target.y + (reducedMotion ? 0 : (random() - 0.5) * 32);
      const toneRoll = random();
      const tone = toneRoll < 0.42 ? 0 : toneRoll < 0.72 ? 1 : toneRoll < 0.88 ? 2 : toneRoll < 0.96 ? 3 : 4;
      nextParticles.push({
        x,
        y,
        vx: reducedMotion ? 0 : 180 + random() * 140,
        vy: reducedMotion ? 0 : (random() - 0.5) * 28,
        tx: target.x,
        ty: target.y,
        alpha: reducedMotion ? 1 : 0,
        size: 0.52 + random() * 0.34,
        tone,
        mode: 'converge',
        delay: reducedMotion ? 0 : (hadActive ? 0.02 : normX * 0.14) + random() * 0.08,
        age: random() * Math.PI * 2,
        life: 0,
        maxLife: 1,
        curl: (random() - 0.5) * 18,
        driftAccel: 0,
      });
    }
  }

  for (let i = count; i < state.particles.length; i++) {
    const surplus = state.particles[i];
    toDisperse(surplus, reducedMotion, random);
    nextParticles.push(surplus);
  }

  state.particles = nextParticles;
  state.active = state.text !== '' || state.particles.length > 0;
}

export function stepDustPrompt(
  state: DustPromptState,
  rawDt: number,
  reducedMotion = false,
): void {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt === 0) return;

  const remaining: DustParticle[] = [];
  let converging = 0;
  let settled = 0;

  for (const p of state.particles) {
    p.age += dt;
    if (p.mode === 'converge') {
      converging++;
      if (reducedMotion) {
        p.x = p.tx;
        p.y = p.ty;
        p.vx = 0;
        p.vy = 0;
        p.alpha = 1;
        settled++;
        remaining.push(p);
        continue;
      }

      if (p.delay > 0) {
        p.delay = Math.max(0, p.delay - dt);
        p.x += p.vx * dt * 0.35;
        p.y += p.vy * dt * 0.35;
        p.alpha = Math.min(0.45, p.alpha + dt * 2.8);
        remaining.push(p);
        continue;
      }

      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const ax = dx * SPRING_STIFFNESS - p.vx * SPRING_DAMPING;
      const ay = dy * SPRING_STIFFNESS - p.vy * SPRING_DAMPING;
      p.vx += ax * dt;
      p.vy += ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.min(1, p.alpha + dt * 5.8);

      if (Math.hypot(dx, dy) < 1.8) settled++;
      remaining.push(p);
    } else {
      p.life += dt;
      const progress = p.life / p.maxLife;
      if (progress >= 1) continue;

      if (reducedMotion) {
        p.alpha = Math.max(0, 1 - progress);
      } else {
        p.vx = (p.vx + p.driftAccel * dt) * Math.exp(-0.5 * dt);
        p.vy = (p.vy + p.curl * 0.45 * dt) * Math.exp(-2.0 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, (1 - progress) * (1 - progress * 0.3));
      }

      if (p.alpha > 0.01) remaining.push(p);
    }
  }

  state.particles = remaining;

  if (state.text && converging > 0) {
    const ratio = settled / converging;
    const blend = reducedMotion ? 1 : Math.min(1, dt * 7);
    state.settleProgress += (ratio - state.settleProgress) * blend;
  } else {
    state.settleProgress = Math.max(0, state.settleProgress - dt * (reducedMotion ? 10 : 6));
  }

  state.active = state.text !== '' || state.particles.length > 0;
}
