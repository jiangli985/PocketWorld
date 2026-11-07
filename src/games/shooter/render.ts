import { aimAngle, DANGER_Y, GAME_HEIGHT, GAME_WIDTH, LAUNCHER, WALL_LEFT, WALL_RIGHT, WALL_TOP } from './engine';
import type { Enemy, Point, Run } from './engine';

const TAU = Math.PI * 2;
const COLORS = { orb: '#ff879d', drifter: '#b9a5ff', armored: '#ffcf80' };
const mono = 'ui-monospace, SFMono-Regular, Consolas, monospace';

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, radius), 0, TAU);
}
function enemyShape(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  const { radius, kind } = enemy;
  ctx.beginPath();
  if (kind === 'orb') { ctx.arc(0, 0, radius, 0, TAU); return; }
  const sides = kind === 'drifter' ? 4 : 6;
  for (let i = 0; i < sides; i += 1) {
    const angle = i / sides * TAU - Math.PI / 2;
    const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number, gravity: boolean): void {
  const color = COLORS[enemy.kind];
  ctx.save(); ctx.translate(enemy.x, enemy.y);
  if (gravity) {
    ctx.strokeStyle = 'rgba(184,164,255,.13)'; ctx.lineWidth = 1;
    circle(ctx, 0, 0, 52 + Math.sin(time * 2 + enemy.phase) * 3); ctx.stroke();
  }
  ctx.shadowColor = color; ctx.shadowBlur = 17;
  ctx.fillStyle = enemy.flash > 0 ? '#fff8e9' : color;
  ctx.strokeStyle = enemy.flash > 0 ? '#fff' : `${color}99`;
  ctx.lineWidth = 1.5; enemyShape(ctx, enemy); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = enemy.kind === 'orb' ? '#4b233a' : enemy.kind === 'drifter' ? '#302948' : '#51402b';
  circle(ctx, 0, 0, enemy.radius * 0.48); ctx.fill();
  ctx.fillStyle = '#fff8ef'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 13px ${mono}`; ctx.fillText(String(enemy.hp), 0, 0.5);
  ctx.strokeStyle = `${color}66`; ctx.lineWidth = 1;
  circle(ctx, 0, 0, enemy.radius + 6 + Math.sin(time * 2 + enemy.phase) * 1.5); ctx.stroke();
  ctx.restore();
}

/** The simple guide previews wall bounces; gravity/enemy collisions change the real trajectory. */
function drawAim(ctx: CanvasRenderingContext2D, target: Point, time: number): void {
  const angle = aimAngle(target);
  let x = LAUNCHER.x; let y = LAUNCHER.y;
  let vx = Math.cos(angle); let vy = Math.sin(angle);
  ctx.save(); ctx.strokeStyle = 'rgba(182,255,217,.5)';
  ctx.setLineDash([3, 10]); ctx.lineDashOffset = -time * 12; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let step = 0; step < 100; step += 1) {
    x += vx * 6; y += vy * 6;
    if (x < WALL_LEFT + 8) { x = WALL_LEFT + 8; vx = Math.abs(vx); }
    if (x > WALL_RIGHT - 8) { x = WALL_RIGHT - 8; vx = -Math.abs(vx); }
    if (y < WALL_TOP + 8) { y = WALL_TOP + 8; vy = Math.abs(vy); }
    ctx.lineTo(x, y);
    if (y > LAUNCHER.y) break;
  }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#d2ffcf'; circle(ctx, x, y, 3); ctx.fill(); ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, run: Run, showAim = true): void {
  const t = run.elapsed;
  const bg = ctx.createLinearGradient(0, 0, 800, 600);
  bg.addColorStop(0, '#111a26'); bg.addColorStop(0.5, '#091b24'); bg.addColorStop(1, '#11172b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  const atmosphere = ctx.createRadialGradient(440, 240, 20, 440, 240, 460);
  atmosphere.addColorStop(0, 'rgba(76,153,131,.16)'); atmosphere.addColorStop(1, 'rgba(14,30,36,0)');
  ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  for (let i = 0; i < 75; i += 1) {
    const x = (i * 173.73 + 19) % GAME_WIDTH;
    const y = (i * 71.27 + t * (2 + i % 4)) % GAME_HEIGHT;
    ctx.fillStyle = `rgba(205,239,230,${0.12 + (i % 5) * 0.065})`;
    ctx.fillRect(x, y, i % 3 ? 1 : 1.7, i % 3 ? 1 : 1.7);
  }
  ctx.strokeStyle = 'rgba(155,216,195,.055)'; ctx.lineWidth = 1;
  for (let x = 42; x < 800; x += 48) { ctx.beginPath(); ctx.moveTo(x, 94); ctx.lineTo(x, 578); ctx.stroke(); }
  for (let y = 98; y < 580; y += 48) { ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(758, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(143,233,209,.24)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(WALL_LEFT, 92); ctx.lineTo(WALL_LEFT, 560);
  ctx.quadraticCurveTo(WALL_LEFT, 578, 61, 578); ctx.lineTo(739, 578);
  ctx.quadraticCurveTo(WALL_RIGHT, 578, WALL_RIGHT, 560); ctx.lineTo(WALL_RIGHT, 92); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,131,156,.3)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(57, DANGER_Y); ctx.lineTo(743, DANGER_Y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,166,180,.46)'; ctx.font = `9px ${mono}`;
  ctx.textAlign = 'right'; ctx.fillText('DANGER LINE', 741, DANGER_Y - 10);
  ctx.fillStyle = 'rgba(180,231,215,.4)'; ctx.textAlign = 'center';
  ctx.fillText('FIELD 01   /   THE GREENHOUSE', 400, 83);

  ctx.save();
  if (run.shake > 0) ctx.translate(Math.sin(t * 159) * run.shake, Math.cos(t * 131) * run.shake);
  if (showAim && run.phase === 'aim') drawAim(ctx, run.aim, t);
  for (const enemy of run.enemies) drawEnemy(ctx, enemy, t, run.upgrades.gravity > 0);
  for (const item of run.rings) {
    const fraction = item.life / item.maxLife;
    ctx.globalAlpha = fraction * 0.7; ctx.strokeStyle = item.color; ctx.lineWidth = fraction * 3;
    circle(ctx, item.x, item.y, item.radius * (1 - fraction) + 8); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const line of run.lines) {
    ctx.save(); ctx.globalAlpha = Math.min(1, line.life / 0.12);
    ctx.strokeStyle = '#ffe9a6'; ctx.shadowBlur = 12; ctx.shadowColor = '#ffe08a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(line.from.x, line.from.y);
    for (let i = 1; i < 7; i += 1) {
      const fraction = i / 7;
      ctx.lineTo(line.from.x + (line.to.x - line.from.x) * fraction + Math.sin(i * 11) * 6, line.from.y + (line.to.y - line.from.y) * fraction + Math.cos(i * 7) * 6);
    }
    ctx.lineTo(line.to.x, line.to.y); ctx.stroke(); ctx.restore();
  }
  for (const particle of run.particles) {
    const fraction = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = fraction; ctx.fillStyle = particle.color;
    circle(ctx, particle.x, particle.y, particle.radius * fraction); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const ball of run.balls) {
    for (let i = 0; i < ball.trail.length; i += 1) {
      const point = ball.trail[i]; const fraction = (i + 1) / ball.trail.length;
      ctx.globalAlpha = fraction * 0.22; ctx.fillStyle = '#a6ffd0';
      circle(ctx, point.x, point.y, ball.radius * fraction); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 19; ctx.shadowColor = '#97ffd9';
    ctx.fillStyle = '#c7ffd5'; circle(ctx, ball.x, ball.y, ball.radius); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#f6fff0'; circle(ctx, ball.x - ball.radius * 0.24, ball.y - ball.radius * 0.3, ball.radius * 0.4); ctx.fill();
  }
  for (const text of run.texts) {
    ctx.globalAlpha = Math.min(1, text.life * 2); ctx.fillStyle = text.color;
    ctx.font = `700 12px ${mono}`; ctx.textAlign = 'center'; ctx.fillText(text.text, text.x, text.y);
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(LAUNCHER.x, LAUNCHER.y, 0, LAUNCHER.x, LAUNCHER.y, 29);
  glow.addColorStop(0, 'rgba(172,255,198,.45)'); glow.addColorStop(1, 'rgba(172,255,198,0)');
  ctx.fillStyle = glow; circle(ctx, LAUNCHER.x, LAUNCHER.y, 29); ctx.fill();
  ctx.strokeStyle = '#b3ffc9'; ctx.lineWidth = 1.5; circle(ctx, LAUNCHER.x, LAUNCHER.y, 10); ctx.stroke();
  ctx.fillStyle = '#d0ffdb'; circle(ctx, LAUNCHER.x, LAUNCHER.y, 4); ctx.fill();
  ctx.restore();
  if (run.flash > 0) { ctx.fillStyle = `rgba(217,255,218,${run.flash})`; ctx.fillRect(0, 0, 800, 600); }
}
