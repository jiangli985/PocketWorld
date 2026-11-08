// The simulation is independent of React and always uses the 800 × 600 game space.
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const WALL_LEFT = 42;
export const WALL_RIGHT = 758;
export const WALL_TOP = 98;
export const DANGER_Y = 510;
export const LAUNCHER = { x: 400, y: 551 };
export const MAX_BALLS = 40;
export const MAX_PARTICLES = 160;
export const MAX_ENEMIES = 18;
export const MAX_TEXTS = 20;
export const MAX_LINES = 16;

export type Point = { x: number; y: number };
export type UpgradeId = 'split' | 'chain' | 'gravity' | 'pierce' | 'power' | 'extra';
export type Phase = 'aim' | 'flight' | 'upgrade' | 'victory' | 'defeat';
export type SoundEvent = 'launch' | 'hit' | 'destroy' | 'wave';
export type Upgrade = { id: UpgradeId; name: string; icon: string; description: string; color: string; label: string };
export type EnemyKind = 'orb' | 'drifter' | 'armored';
export type Enemy = {
  id: number; kind: EnemyKind; x: number; baseX: number; y: number; radius: number;
  hp: number; maxHp: number; phase: number; flash: number;
};
export type Ball = {
  x: number; y: number; vx: number; vy: number; radius: number; life: number;
  lastEnemy: number; hitCooldown: number; splitBudget: number; trail: Point[];
};
export type Particle = Point & { vx: number; vy: number; life: number; maxLife: number; radius: number; color: string };
export type Ring = Point & { life: number; maxLife: number; radius: number; color: string };
export type FloatingText = Point & { text: string; life: number; color: string };
export type Lightning = { from: Point; to: Point; life: number };
export type Run = {
  phase: Phase; wave: number; turn: number; score: number; combo: number; bestCombo: number;
  elapsed: number; enemies: Enemy[]; balls: Ball[]; particles: Particle[]; rings: Ring[];
  texts: FloatingText[]; lines: Lightning[]; upgrades: Record<UpgradeId, number>;
  aim: Point; pending: number; launchDelay: number; launchAngle: number; volleySize: number;
  shake: number; flash: number; nextId: number; sounds: SoundEvent[]; random: () => number;
};

export const UPGRADES: readonly Upgrade[] = [
  { id: 'split', name: '分裂弹芯', icon: '✳', description: '碰撞时有机会分裂出两颗小球。', color: '#89f7d5', label: 'MULTIBALL' },
  { id: 'chain', name: '电弧链接', icon: 'ϟ', description: '命中时，电弧有机会伤害附近的敌人。', color: '#ffe18a', label: 'CHAIN REACTION' },
  { id: 'gravity', name: '引力涟漪', icon: '◎', description: '附近的敌人会轻轻吸引弹球。', color: '#b5a5ff', label: 'GRAVITY FIELD' },
  { id: 'pierce', name: '相位穿透', icon: '↟', description: '弹球穿过敌人，继续向前飞行。', color: '#ff9db3', label: 'PIERCING' },
  { id: 'power', name: '超载核心', icon: '✦', description: '每一次命中的伤害提升 1 点。', color: '#ffb781', label: 'POWER UP' },
  { id: 'extra', name: '备用弹仓', icon: '＋', description: '每次发射额外增加 2 颗弹球。', color: '#8ccfff', label: 'MORE BALLS' },
];

const COLORS: Record<EnemyKind, string> = { orb: '#ff879d', drifter: '#b9a5ff', armored: '#ffcf80' };
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const randomBetween = (run: Run, min: number, max: number): number => min + run.random() * (max - min);

function createEnemies(run: Run): Enemy[] {
  const count = Math.min(MAX_ENEMIES, 6 + run.wave * 3);
  const columns = 5;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const x = GAME_WIDTH / 2 + (col - (rowCount - 1) / 2) * 118 + randomBetween(run, -9, 9);
    const kind: EnemyKind = run.wave >= 2 && (index + run.wave) % 5 === 0
      ? 'armored' : (index + run.wave) % 3 === 0 ? 'drifter' : 'orb';
    const hp = kind === 'orb' ? 1 : kind === 'drifter' ? 2 : 3;
    return {
      id: run.nextId++, kind, x, baseX: x, y: 145 + row * 73,
      radius: kind === 'armored' ? 23 : 20, hp, maxHp: hp,
      phase: randomBetween(run, 0, Math.PI * 2), flash: 0,
    };
  });
}

export function createRun(random: () => number = Math.random): Run {
  const run: Run = {
    phase: 'aim', wave: 1, turn: 1, score: 0, combo: 0, bestCombo: 0, elapsed: 0,
    enemies: [], balls: [], particles: [], rings: [], texts: [], lines: [],
    upgrades: { split: 0, chain: 0, gravity: 0, pierce: 0, power: 0, extra: 0 },
    aim: { x: 400, y: 160 }, pending: 0, launchDelay: 0, launchAngle: -Math.PI / 2,
    volleySize: 5, shake: 0, flash: 0, nextId: 1, sounds: [], random,
  };
  run.enemies = createEnemies(run);
  return run;
}

// Clamp to an upward-facing arc, even when the pointer is below the launcher.
export function aimAngle(target: Point): number {
  const dx = target.x - LAUNCHER.x;
  const dy = Math.min(-50, target.y - LAUNCHER.y);
  return clamp(Math.atan2(dy, dx), -Math.PI + 0.32, -0.32);
}

export function launch(run: Run, target: Point): boolean {
  if (run.phase !== 'aim') return false;
  run.aim = target;
  run.launchAngle = aimAngle(target);
  run.pending = run.volleySize;
  run.launchDelay = 0;
  run.combo = 0;
  run.phase = 'flight';
  run.sounds.push('launch');
  return true;
}

export function chooseUpgrade(run: Run, id: UpgradeId): boolean {
  if (run.phase !== 'upgrade' || !UPGRADES.some((upgrade) => upgrade.id === id)) return false;
  run.upgrades[id] += 1;
  if (id === 'extra') run.volleySize = Math.min(11, run.volleySize + 2);
  run.wave += 1;
  run.turn = 1;
  run.enemies = createEnemies(run);
  run.balls = [];
  run.pending = 0;
  run.phase = 'aim';
  run.flash = 0.13;
  return true;
}

export function upgradeChoices(run: Run): Upgrade[] {
  // Fisher–Yates: no repeated option, and the pool stays small and bounded.
  const pool = [...UPGRADES];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(run.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function sound(run: Run, event: SoundEvent): void {
  if (run.sounds.length < 24) run.sounds.push(event);
}
function ring(run: Run, x: number, y: number, color: string, radius: number): void {
  if (run.rings.length >= 30) run.rings.shift();
  run.rings.push({ x, y, color, radius, life: 0.42, maxLife: 0.42 });
}
function burst(run: Run, x: number, y: number, color: string, count: number, speed: number): void {
  for (let i = 0; i < count; i += 1) {
    if (run.particles.length >= MAX_PARTICLES) run.particles.shift();
    const angle = randomBetween(run, 0, Math.PI * 2);
    const velocity = randomBetween(run, speed * 0.25, speed);
    const life = randomBetween(run, 0.24, 0.65);
    run.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, radius: randomBetween(run, 1.5, 4), color });
  }
}
function addBall(run: Run, x: number, y: number, angle: number, speed: number, radius: number, splitBudget: number): void {
  if (run.balls.length >= MAX_BALLS) return;
  run.balls.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius, life: radius < 7 ? 3.8 : 8, lastEnemy: -1, hitCooldown: 0, splitBudget, trail: [] });
}
function hitEnemy(run: Run, enemy: Enemy, damage: number): void {
  if (enemy.hp <= 0) return;
  enemy.hp -= damage;
  enemy.flash = 0.12;
  burst(run, enemy.x, enemy.y, COLORS[enemy.kind], 5, 100);
  sound(run, 'hit');
  if (enemy.hp > 0) return;
  const points = (enemy.kind === 'armored' ? 220 : enemy.kind === 'drifter' ? 150 : 100) + Math.min(run.combo, 15) * 10;
  run.combo += 1;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  run.score += points;
  if (run.texts.length >= MAX_TEXTS) run.texts.shift();
  run.texts.push({ x: enemy.x, y: enemy.y - 10, text: `+${points}`, life: 0.9, color: '#eaffbf' });
  burst(run, enemy.x, enemy.y, COLORS[enemy.kind], 13, 190);
  ring(run, enemy.x, enemy.y, COLORS[enemy.kind], 52);
  run.shake = Math.min(5, run.shake + 1.2);
  sound(run, 'destroy');
}

function tickPhysics(run: Run, dt: number): void {
  if (run.phase === 'flight') {
    run.launchDelay -= dt;
    while (run.pending > 0 && run.launchDelay <= 0) {
      const offset = randomBetween(run, -0.026, 0.026);
      addBall(run, LAUNCHER.x, LAUNCHER.y, run.launchAngle + offset, 525, 8, 2);
      run.pending -= 1;
      run.launchDelay += 0.12;
    }
  }
  for (const enemy of run.enemies) {
    enemy.flash = Math.max(0, enemy.flash - dt);
    if (enemy.kind === 'drifter') enemy.x = enemy.baseX + Math.sin(run.elapsed * 1.4 + enemy.phase) * 15;
  }
  // Process only balls present at the start of the step; newly split balls wait for the next step.
  const activeBalls = [...run.balls];
  for (const ball of activeBalls) {
    ball.life -= dt;
    ball.hitCooldown = Math.max(0, ball.hitCooldown - dt);
    if (run.upgrades.gravity > 0) {
      for (const enemy of run.enemies) {
        if (enemy.hp <= 0) continue;
        const d = distance(ball, enemy);
        if (d > 1 && d < 130) {
          const strength = 36 * Math.min(run.upgrades.gravity, 2) * (1 - d / 130);
          ball.vx += (enemy.x - ball.x) / d * strength * dt;
          ball.vy += (enemy.y - ball.y) / d * strength * dt;
        }
      }
    }
    ball.vy += 38 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x - ball.radius < WALL_LEFT) { ball.x = WALL_LEFT + ball.radius; ball.vx = Math.abs(ball.vx); }
    if (ball.x + ball.radius > WALL_RIGHT) { ball.x = WALL_RIGHT - ball.radius; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - ball.radius < WALL_TOP) { ball.y = WALL_TOP + ball.radius; ball.vy = Math.abs(ball.vy); }
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0 || (ball.lastEnemy === enemy.id && ball.hitCooldown > 0)) continue;
      const dx = ball.x - enemy.x;
      const dy = ball.y - enemy.y;
      const d = Math.hypot(dx, dy);
      if (d >= ball.radius + enemy.radius) continue;
      const nx = d > 0.01 ? dx / d : 0;
      const ny = d > 0.01 ? dy / d : -1;
      const dot = ball.vx * nx + ball.vy * ny;
      ball.lastEnemy = enemy.id;
      ball.hitCooldown = 0.2;
      if (!run.upgrades.pierce) {
        ball.x = enemy.x + nx * (ball.radius + enemy.radius + 0.5);
        ball.y = enemy.y + ny * (ball.radius + enemy.radius + 0.5);
        if (dot < 0) { ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny; }
      }
      const damage = 1 + run.upgrades.power;
      hitEnemy(run, enemy, damage);
      if (run.upgrades.split > 0 && ball.splitBudget > 0 && run.random() < Math.min(0.7, 0.4 * run.upgrades.split)) {
        const angle = Math.atan2(ball.vy, ball.vx);
        for (const side of [-1, 1]) addBall(run, ball.x + nx * 4, ball.y + ny * 4, angle + side * 0.55, 480, 5.5, ball.splitBudget - 1);
        ring(run, ball.x, ball.y, '#9cffe0', 35);
      }
      if (run.upgrades.chain > 0 && run.random() < Math.min(0.9, 0.5 * run.upgrades.chain)) {
        let nearest: Enemy | undefined;
        let nearestDistance = 145;
        for (const candidate of run.enemies) {
          const d2 = distance(enemy, candidate);
          if (candidate !== enemy && candidate.hp > 0 && d2 < nearestDistance) { nearest = candidate; nearestDistance = d2; }
        }
        if (nearest) {
          if (run.lines.length >= MAX_LINES) run.lines.shift();
          run.lines.push({ from: { x: enemy.x, y: enemy.y }, to: { x: nearest.x, y: nearest.y }, life: 0.18 });
          hitEnemy(run, nearest, damage);
        }
      }
      break;
    }
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 7) ball.trail.shift();
  }
  run.balls = run.balls.filter((ball) => ball.life > 0 && ball.y < GAME_HEIGHT - 24);
  run.enemies = run.enemies.filter((enemy) => enemy.hp > 0);

  if (run.phase === 'flight' && run.enemies.length === 0) {
    run.balls = [];
    run.pending = 0;
    run.phase = run.wave >= 3 ? 'victory' : 'upgrade';
    run.flash = 0.2;
    sound(run, 'wave');
  } else if (run.phase === 'flight' && run.pending === 0 && run.balls.length === 0) {
    for (const enemy of run.enemies) enemy.y += 26;
    run.turn += 1;
    run.phase = run.enemies.some((enemy) => enemy.y + enemy.radius >= DANGER_Y) ? 'defeat' : 'aim';
  }
}

/** Advance only while active and unpaused. The bounded timestep prevents tunnelling. */
export function advance(run: Run, delta: number): void {
  const dt = clamp(delta, 0, 0.05);
  if (dt === 0) return;
  run.elapsed += dt;
  run.shake = Math.max(0, run.shake - dt * 15);
  run.flash = Math.max(0, run.flash - dt * 0.7);
  for (const particle of run.particles) {
    particle.x += particle.vx * dt; particle.y += particle.vy * dt;
    const damping = Math.pow(0.12, dt);
    particle.vx *= damping; particle.vy *= damping; particle.life -= dt;
  }
  run.particles = run.particles.filter((particle) => particle.life > 0);
  for (const item of run.rings) item.life -= dt;
  run.rings = run.rings.filter((item) => item.life > 0);
  for (const text of run.texts) { text.life -= dt; text.y -= 20 * dt; }
  run.texts = run.texts.filter((text) => text.life > 0);
  for (const line of run.lines) line.life -= dt;
  run.lines = run.lines.filter((line) => line.life > 0);
  if (run.phase !== 'aim' && run.phase !== 'flight') return;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < steps; i += 1) tickPhysics(run, dt / steps);
}
