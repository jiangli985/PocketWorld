import type { PlushDollPlacement } from './cabinLayout';

export type PlushRect = [number, number, number, number];
export interface PlushBounds { left: number; right: number; back: number; front: number }

export interface PlushBody {
  id: PlushDollPlacement['id'];
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  yaw: number;
  spin: number;
  roll: number;
  rollVel: number;
  pitch: number;
  pitchVel: number;
  toppled: boolean;
  radius: number;
  cooldown: number;
}

export interface PlushMover {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  active: boolean;
  /** Multiplier for kick impulse (1.0 for walking resident, 0.9 for rolling chair). */
  strength?: number;
}

export const PLUSH_DRAG = 4.2;
export const PLUSH_REST = 0.28;
export const PLUSH_GRAVITY = 12.8;
export const PLUSH_TOPPLE_APPROACH = 0.48;
const MAX_KICK = 2.05;
const SUBSTEP = 0.03;

export function createPlushBodies(placements: readonly PlushDollPlacement[]): PlushBody[] {
  return placements.map(doll => ({
    id: doll.id,
    x: doll.position[0],
    z: doll.position[2],
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: doll.yaw,
    spin: 0,
    roll: 0,
    rollVel: 0,
    pitch: 0,
    pitchVel: 0,
    toppled: false,
    radius: doll.radius,
    cooldown: 0,
  }));
}

export function isValidPlushBody(body: PlushBody | undefined): boolean {
  return !!body
    && Number.isFinite(body.x)
    && Number.isFinite(body.y)
    && Number.isFinite(body.z)
    && Number.isFinite(body.vx)
    && Number.isFinite(body.vy)
    && Number.isFinite(body.vz)
    && Number.isFinite(body.yaw)
    && Number.isFinite(body.spin)
    && Number.isFinite(body.roll)
    && Number.isFinite(body.rollVel)
    && Number.isFinite(body.pitch)
    && Number.isFinite(body.pitchVel)
    && Number.isFinite(body.radius)
    && Number.isFinite(body.cooldown);
}

/** Smooth ellipsoid downward support height from a plush doll's volume center under YXZ Euler. */
export function plushSupportHeight(
  roll: number,
  pitch: number,
  halfWidth: number,
  halfHeight: number,
  halfDepth: number,
): number {
  const cosP = Math.cos(pitch);
  const dx = Math.sin(roll) * cosP;
  const dy = Math.cos(roll) * cosP;
  const dz = Math.sin(pitch);
  return Math.hypot(halfWidth * dx, halfHeight * dy, halfDepth * dz);
}

/** Smooth floor elevation: slightly raised on the woven bedside rug, flush on oak parquet outside it. */
export function plushFloorY(x: number, z: number, rugY = 0.0125): number {
  const d = Math.hypot((x + 4.05) / 1.08, (z - 0.11) / 0.62);
  if (d <= 0.94) return rugY;
  if (d >= 1.06) return 0;
  const t = (d - 0.94) / 0.12;
  const s = t * t * (3 - 2 * t);
  return rugY * (1 - s);
}

/** Live AABB collision rects around current plush positions (e.g. for slippers bouncing off dolls). */
export function plushObstacleBoxes(bodies: readonly PlushBody[], inflate = 0.11): PlushRect[] {
  return bodies.map(b => {
    const r = b.radius + inflate;
    return [b.x - r, b.x + r, b.z - r, b.z + r];
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function dollOpen(
  x: number,
  z: number,
  radius: number,
  staticBoxes: readonly PlushRect[],
  bounds: PlushBounds,
): boolean {
  return x >= bounds.left + radius
    && x <= bounds.right - radius
    && z >= bounds.back + radius
    && z <= bounds.front - radius
    && !staticBoxes.some(([a, b, c, d]) => x > a - radius && x < b + radius && z > c - radius && z < d + radius);
}

function trySlide(
  body: PlushBody,
  targetX: number,
  targetZ: number,
  staticBoxes: readonly PlushRect[],
  bounds: PlushBounds,
): boolean {
  if (dollOpen(targetX, targetZ, body.radius, staticBoxes, bounds)) {
    body.x = targetX;
    body.z = targetZ;
    return true;
  }
  let moved = false;
  if (dollOpen(targetX, body.z, body.radius, staticBoxes, bounds)) {
    body.x = targetX;
    moved = true;
  }
  if (dollOpen(body.x, targetZ, body.radius, staticBoxes, bounds)) {
    body.z = targetZ;
    moved = true;
  }
  return moved;
}

/**
 * Push a mover (Luna or the rolling chair) cleanly outside any plush doll it still overlaps
 * (for example when the doll is pinned solidly against a wall, sofa, wardrobe, or another doll).
 * Returns true if the mover was blocked/pushed back.
 */
export function resolveMoverAgainstPlush(
  pos: { x: number; z: number },
  moverRadius: number,
  bodies: readonly PlushBody[],
  isAllowed: (x: number, z: number) => boolean,
): boolean {
  let blocked = false;
  for (let pass = 0; pass < 3; pass++) {
    for (const body of bodies) {
      const dx = pos.x - body.x;
      const dz = pos.z - body.z;
      const gap = Math.hypot(dx, dz);
      const minGap = moverRadius + body.radius;
      if (gap < minGap - 1e-5) {
        const nx = gap > 1e-5 ? dx / gap : 0;
        const nz = gap > 1e-5 ? dz / gap : 1;
        const targetX = body.x + nx * minGap;
        const targetZ = body.z + nz * minGap;
        if (isAllowed(targetX, targetZ)) {
          pos.x = targetX;
          pos.z = targetZ;
        } else if (isAllowed(targetX, pos.z)) {
          pos.x = targetX;
        } else if (isAllowed(pos.x, targetZ)) {
          pos.z = targetZ;
        }
        blocked = true;
      }
    }
  }
  return blocked;
}

/**
 * Step kickable solid plush dolls:
 * - Walking or rolling into a doll pushes/kicks it with soft plush bounce, spin, wobble & optional topple.
 * - Dolls collide solidly with walls, static furniture, and each other without clipping.
 * - Reduced motion keeps dolls upright and grounded while sliding smoothly.
 */
export function stepPlushDolls(
  bodies: PlushBody[],
  dt: number,
  movers: readonly PlushMover[],
  staticBoxes: readonly PlushRect[],
  bounds: PlushBounds,
  reducedMotion = false,
  random: () => number = Math.random,
) {
  if (!(dt > 0) || !bodies.length) return;

  // 1. Contact impulses from active movers (Luna & rolling chair).
  for (const body of bodies) {
    if (body.cooldown > 0) body.cooldown = Math.max(0, body.cooldown - dt);

    for (const mover of movers) {
      if (!mover.active) continue;
      const dx = body.x - mover.x;
      const dz = body.z - mover.z;
      const gap = Math.hypot(dx, dz);
      const contact = mover.radius + body.radius;
      if (gap > 1e-5 && gap < contact) {
        const nx = dx / gap;
        const nz = dz / gap;
        trySlide(body, mover.x + nx * contact, mover.z + nz * contact, staticBoxes, bounds);

        const approach = mover.vx * nx + mover.vz * nz;
        const mult = mover.strength ?? 1;
        if (approach > 0.03) {
          const kick = Math.min(MAX_KICK, (0.42 + approach * 1.18) * mult);
          body.vx = nx * kick;
          body.vz = nz * kick;
          const lateral = mover.vx * nz - mover.vz * nx;
          body.spin = reducedMotion
            ? 0
            : clamp(lateral * 2.1 + (approach > 0.55 ? (nx >= 0 ? 1.1 : -1.1) : 0), -5.5, 5.5);

          if (!reducedMotion && body.cooldown <= 0 && body.y <= 0.04) {
            // Project kick direction into doll-local axes so it tips naturally in the kick direction!
            const cosY = Math.cos(body.yaw);
            const sinY = Math.sin(body.yaw);
            const localForward = nx * sinY + nz * cosY; // kick toward doll's +Z (front) -> pitch forward
            const localRight = nx * cosY - nz * sinY;   // kick toward doll's +X (right) -> roll right

            if (approach >= PLUSH_TOPPLE_APPROACH) {
              const s = clamp((approach - PLUSH_TOPPLE_APPROACH) / 0.55, 0, 1.2);
              if (body.toppled && random() < 0.68) {
                // Brisk kick on a toppled doll pops it cheerfully back upright!
                body.vy = 1.42 + s * 0.36;
                body.rollVel = -body.roll * 4.6 + (random() - 0.5) * 1.4;
                body.pitchVel = -body.pitch * 4.6 + (random() - 0.5) * 1.4;
                body.cooldown = 0.24;
              } else if (random() < 0.56) {
                // Playful plush tumble: hops softly and tips over in the kick direction!
                body.vy = 1.26 + s * 0.42 + random() * 0.16;
                const tumble = 5.4 + s * 2.2 + random() * 1.4;
                body.pitchVel = clamp(localForward * tumble + (random() - 0.5) * 1.8, -9, 9);
                body.rollVel = clamp(-localRight * tumble + (random() - 0.5) * 1.8, -9, 9);
                body.cooldown = 0.24;
              } else {
                // Bouncy hop & lively roly-poly wobble while staying seated upright!
                body.vy = 0.92 + s * 0.32;
                body.pitchVel = clamp(localForward * 3.4 + (random() - 0.5) * 1.4, -5, 5);
                body.rollVel = clamp(-localRight * 3.4 + (random() - 0.5) * 1.4, -5, 5);
                body.cooldown = 0.20;
              }
            } else if (approach > 0.14) {
              // Soft nudge: gentle scoot with cute plush bobble, stays sitting upright.
              body.vy = Math.max(body.vy, 0.24 + (approach - 0.14) * 0.9);
              body.pitchVel = clamp(body.pitchVel + localForward * 2.8, -4.2, 4.2);
              body.rollVel = clamp(body.rollVel - localRight * 2.8, -4.2, 4.2);
              body.cooldown = 0.14;
            }
          }
        }
      }
    }
  }

  // 2. Integrate horizontal motion, wall/furniture bounce, spin, vertical bounce & upright/topple settling.
  for (const body of bodies) {
    if (reducedMotion) {
      body.y = 0; body.vy = 0;
      body.roll = 0; body.rollVel = 0;
      body.pitch = 0; body.pitchVel = 0;
      body.spin = 0;
      body.toppled = false;
    }

    const airborne = body.y > 0.004 || body.vy > 0;
    const linearDrag = Math.exp(-dt * (reducedMotion ? 7.5 : airborne ? 0.75 : PLUSH_DRAG));
    body.vx *= linearDrag;
    body.vz *= linearDrag;
    body.spin *= Math.exp(-dt * (airborne ? 1.3 : 4.8));
    if (!airborne && Math.hypot(body.vx, body.vz) < 0.015) { body.vx = 0; body.vz = 0; }
    if (Math.abs(body.spin) < 0.02) body.spin = 0;

    let hitImpact = 0;
    const travel = Math.hypot(body.vx, body.vz) * dt;
    const steps = Math.max(1, Math.ceil(travel / SUBSTEP));
    for (let i = 0; i < steps; i++) {
      const nextX = body.x + (body.vx * dt) / steps;
      if (dollOpen(nextX, body.z, body.radius, staticBoxes, bounds)) {
        body.x = nextX;
      } else {
        hitImpact = Math.max(hitImpact, Math.abs(body.vx));
        body.vx *= -PLUSH_REST;
      }
      const nextZ = body.z + (body.vz * dt) / steps;
      if (dollOpen(body.x, nextZ, body.radius, staticBoxes, bounds)) {
        body.z = nextZ;
      } else {
        hitImpact = Math.max(hitImpact, Math.abs(body.vz));
        body.vz *= -PLUSH_REST;
      }
    }

    // Bumping fast into a wall or furniture triggers a soft plush recoil wobble.
    if (!reducedMotion && hitImpact >= 0.65 && body.y <= 0.02 && body.cooldown <= 0) {
      body.vy = Math.max(body.vy, 0.55);
      body.rollVel += (random() - 0.5) * 4.2;
      body.pitchVel += (random() - 0.5) * 4.2;
      body.cooldown = 0.18;
    }

    body.yaw += body.spin * dt;

    if (!reducedMotion) {
      if (body.y > 0 || body.vy > 0) {
        body.vy -= PLUSH_GRAVITY * dt;
        body.y += body.vy * dt;
        if (body.y <= 0) {
          body.y = 0;
          if (body.vy < -0.5) {
            // Soft plush bounce upon landing
            body.vy = -body.vy * 0.24;
            body.rollVel *= 0.62;
            body.pitchVel *= 0.62;
          } else {
            body.vy = 0;
          }
        }
      }

      const grounded = body.y <= 0.004 && body.vy === 0;
      if (grounded) {
        // Weighted beanbag bottom rights moderate tilts back to sitting;
        // stronger tilts past ~52 deg settle cozily onto a toppled side/back/front!
        const absR = Math.abs(body.roll);
        const absP = Math.abs(body.pitch);
        let targetRoll = 0;
        let targetPitch = 0;
        if (absR > 0.90 || absP > 0.90) {
          if (absR >= absP) {
            targetRoll = body.roll >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
            targetPitch = 0;
          } else {
            targetRoll = 0;
            targetPitch = body.pitch >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
          }
        }
        const springK = targetRoll === 0 && targetPitch === 0 ? 24 : 20;
        const damp = targetRoll === 0 && targetPitch === 0 ? 5.8 : 7.5;
        body.rollVel += -springK * (body.roll - targetRoll) * dt;
        body.rollVel *= Math.exp(-dt * damp);
        body.pitchVel += -springK * (body.pitch - targetPitch) * dt;
        body.pitchVel *= Math.exp(-dt * damp);

        body.roll = clamp(body.roll + body.rollVel * dt, -Math.PI * 0.56, Math.PI * 0.56);
        body.pitch = clamp(body.pitch + body.pitchVel * dt, -Math.PI * 0.56, Math.PI * 0.56);

        if (Math.abs(body.rollVel) < 0.04 && Math.abs(body.roll - targetRoll) < 0.015) {
          body.roll = targetRoll;
          body.rollVel = 0;
        }
        if (Math.abs(body.pitchVel) < 0.04 && Math.abs(body.pitch - targetPitch) < 0.015) {
          body.pitch = targetPitch;
          body.pitchVel = 0;
        }
      } else {
        body.rollVel *= Math.exp(-dt * 1.0);
        body.pitchVel *= Math.exp(-dt * 1.0);
        body.roll = clamp(body.roll + body.rollVel * dt, -Math.PI * 0.56, Math.PI * 0.56);
        body.pitch = clamp(body.pitch + body.pitchVel * dt, -Math.PI * 0.56, Math.PI * 0.56);
      }

      body.toppled = Math.hypot(body.roll, body.pitch) > 0.72;
    }
  }

  // 3. Solid doll-to-doll collision & plush momentum transfer.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const gap = Math.hypot(dx, dz);
        const minGap = a.radius + b.radius;
        if (gap < minGap) {
          const nx = gap > 1e-5 ? dx / gap : 1;
          const nz = gap > 1e-5 ? dz / gap : 0;
          const overlap = minGap - gap;
          const half = overlap * 0.5;
          const aMoved = trySlide(a, a.x - nx * half, a.z - nz * half, staticBoxes, bounds);
          const bMoved = trySlide(b, b.x + nx * half, b.z + nz * half, staticBoxes, bounds);
          if (!aMoved && bMoved) trySlide(b, b.x + nx * half, b.z + nz * half, staticBoxes, bounds);
          if (!bMoved && aMoved) trySlide(a, a.x - nx * half, a.z - nz * half, staticBoxes, bounds);

          if (pass === 0) {
            const relVn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (relVn < 0) {
              const impulse = -0.68 * relVn;
              a.vx -= nx * impulse;
              a.vz -= nz * impulse;
              b.vx += nx * impulse;
              b.vz += nz * impulse;
              if (!reducedMotion && Math.abs(relVn) > 0.25) {
                a.vy = Math.max(a.vy, 0.35);
                b.vy = Math.max(b.vy, 0.35);
                a.rollVel += (random() - 0.5) * 3.0;
                b.rollVel += (random() - 0.5) * 3.0;
              }
            }
          }
        }
      }
    }
  }
}
