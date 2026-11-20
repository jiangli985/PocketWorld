export type SlipperRect = [number, number, number, number];
export interface SlipperBounds { left: number; right: number; back: number; front: number }
export interface SlipperBody {
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
  flipped: boolean;
  radius: number;
  cooldown: number;
}
export interface SlipperMover {
  x: number;
  z: number;
  vx: number;
  vz: number;
  active: boolean;
}

export const SLIPPER_DRAG = 3.6;
export const SLIPPER_REST = 0.22;
export const SLIPPER_GRAVITY = 14.5;
export const SLIPPER_FLIP_APPROACH = 0.52;
const MAX_KICK = 1.7;
const SUBSTEP = 0.035;

export function createSlipperPair(centers: [number, number][], radii: number[] = []): SlipperBody[] {
  return centers.map(([x, z], index) => ({
    x,
    z,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    spin: 0,
    roll: 0,
    rollVel: 0,
    pitch: 0,
    pitchVel: 0,
    flipped: false,
    radius: radii[index] ?? 0.12,
    cooldown: 0,
  }));
}

/** Exact downward reach from the slipper's centered pivot under YXZ Euler (yaw, pitch, roll). */
export function slipperSupportHeight(
  roll: number,
  pitch: number,
  halfHeight: number,
  halfWidth: number,
  halfLength: number,
) {
  const cosP = Math.abs(Math.cos(pitch));
  return halfWidth * Math.abs(Math.sin(roll)) * cosP
    + halfHeight * Math.abs(Math.cos(roll)) * cosP
    + halfLength * Math.abs(Math.sin(pitch));
}

/** Smooth floor elevation: slightly raised on the woven bedside rug, flush on oak parquet outside it. */
export function slipperFloorY(x: number, z: number, rugY: number) {
  const d = Math.hypot((x + 4.05) / 1.08, (z - 0.11) / 0.62);
  if (d <= 0.94) return rugY;
  if (d >= 1.06) return 0.001;
  const t = (d - 0.94) / 0.12;
  const s = t * t * (3 - 2 * t);
  return rugY + (0.001 - rugY) * s;
}

function open(x: number, z: number, boxes: SlipperRect[], bounds: SlipperBounds) {
  return x >= bounds.left && x <= bounds.right && z >= bounds.back && z <= bounds.front
    && !boxes.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
}

function wrapAngle(rad: number) {
  let a = (rad + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Loose slippers slide, hop and occasionally flip upside down when Luna kicks them briskly. */
export function stepSlippers(
  bodies: SlipperBody[],
  dt: number,
  mover: SlipperMover,
  boxes: SlipperRect[],
  bounds: SlipperBounds,
  reducedMotion = false,
  random: () => number = Math.random,
) {
  if (!(dt > 0)) return;
  for (const body of bodies) {
    if (body.cooldown > 0) body.cooldown = Math.max(0, body.cooldown - dt);

    if (mover.active) {
      const dx = body.x - mover.x, dz = body.z - mover.z;
      const gap = Math.hypot(dx, dz);
      const contact = 0.23 + body.radius;
      if (gap > 1e-5 && gap < contact) {
        const nx = dx / gap, nz = dz / gap;
        const px = mover.x + nx * contact, pz = mover.z + nz * contact;
        if (open(px, pz, boxes, bounds)) { body.x = px; body.z = pz; }
        const approach = mover.vx * nx + mover.vz * nz;
        if (approach > 0.03) {
          const kick = Math.min(MAX_KICK, 0.3 + approach * 1.25);
          body.vx = nx * kick; body.vz = nz * kick;
          const lateral = mover.vx * nz - mover.vz * nx;
          body.spin = reducedMotion ? 0 : clamp(lateral * 2.4 + (approach > 0.7 ? (nx >= 0 ? .9 : -.9) : 0), -5, 5);

          if (!reducedMotion && body.cooldown <= 0 && body.y <= 0.025) {
            const crossSide = nx * Math.cos(body.yaw) - nz * Math.sin(body.yaw);
            const sideFactor = Math.abs(crossSide);
            const rollDir = sideFactor > 0.15 ? -Math.sign(crossSide) : (random() < 0.5 ? 1 : -1);

            if (approach >= SLIPPER_FLIP_APPROACH) {
              const strength = clamp((approach - SLIPPER_FLIP_APPROACH) / 0.35, 0, 1.5);
              const flipChance = clamp(0.24 + strength * 0.36 + sideFactor * 0.16, 0.24, 0.78);
              if (random() < flipChance) {
                const s = Math.min(strength, 1);
                body.vy = 1.48 + s * 0.36 + random() * 0.18;
                body.rollVel = rollDir * (11.2 + s * 2.2 + random() * 1.4);
                body.pitchVel = (random() - 0.5) * 4.0;
                body.cooldown = 0.24;
              } else {
                // Strong kick that hops and rocks without quite turning over this time.
                const s = Math.min(strength, 1);
                body.vy = 0.70 + s * 0.28;
                body.rollVel = rollDir * (4.0 + random() * 1.8);
                body.pitchVel = (random() - 0.5) * 2.8;
                body.cooldown = 0.20;
              }
            } else if (approach > 0.25) {
              // Gentle nudge: tiny grounded wobble, never flips.
              body.vy = Math.max(body.vy, 0.22 + (approach - 0.25) * 0.6);
              body.rollVel = rollDir * (1.8 + (approach - 0.25) * 4.5);
              body.pitchVel = (random() - 0.5) * 1.6;
              body.cooldown = 0.14;
            }
          }
        }
      }
    }

    if (reducedMotion) {
      body.y = 0; body.vy = 0;
      body.roll = 0; body.rollVel = 0;
      body.pitch = 0; body.pitchVel = 0;
      body.flipped = false;
    }

    const airborne = body.y > 0.004 || body.vy > 0;
    const linearDrag = Math.exp(-dt * (reducedMotion ? 7 : airborne ? 0.65 : SLIPPER_DRAG));
    body.vx *= linearDrag;
    body.vz *= linearDrag;
    body.spin *= Math.exp(-dt * (airborne ? 1.2 : 5));
    if (!airborne && Math.hypot(body.vx, body.vz) < 0.015) { body.vx = 0; body.vz = 0; }
    if (Math.abs(body.spin) < 0.02) body.spin = 0;

    let hitImpact = 0;
    const travel = Math.hypot(body.vx, body.vz) * dt;
    const steps = Math.max(1, Math.ceil(travel / SUBSTEP));
    for (let i = 0; i < steps; i++) {
      const x = body.x + body.vx * dt / steps;
      if (open(x, body.z, boxes, bounds)) body.x = x;
      else { hitImpact = Math.max(hitImpact, Math.abs(body.vx)); body.vx *= -SLIPPER_REST; }
      const z = body.z + body.vz * dt / steps;
      if (open(body.x, z, boxes, bounds)) body.z = z;
      else { hitImpact = Math.max(hitImpact, Math.abs(body.vz)); body.vz *= -SLIPPER_REST; }
    }

    // Slamming rapidly into a wall, furniture or the trash can may also pop and flip the slipper.
    if (!reducedMotion && hitImpact >= 0.80 && body.y <= 0.015 && body.cooldown <= 0) {
      if (random() < 0.55) {
        body.vy = Math.max(body.vy, 1.32);
        body.rollVel = (random() < 0.5 ? 1 : -1) * (11.6 + random() * 2.0);
        body.pitchVel = (random() - 0.5) * 3.5;
        body.cooldown = 0.22;
      }
    }

    body.yaw += body.spin * dt;

    if (!reducedMotion) {
      if (body.y > 0 || body.vy > 0) {
        body.vy -= SLIPPER_GRAVITY * dt;
        body.y += body.vy * dt;
        if (body.y <= 0) {
          body.y = 0;
          if (body.vy < -0.55) {
            body.vy = -body.vy * 0.26;
            body.rollVel *= 0.65;
            body.pitchVel *= 0.55;
          } else {
            body.vy = 0;
          }
        }
      }

      const grounded = body.y <= 0.004 && body.vy === 0;
      if (grounded) {
        // Bistable restoring torque settles the slipper flat at either 0 (upright) or +/-PI (upside down).
        body.rollVel += -28 * Math.sin(2 * body.roll) * dt;
        body.rollVel *= Math.exp(-dt * 8.5);
        body.pitchVel += -36 * Math.sin(body.pitch) * dt;
        body.pitchVel *= Math.exp(-dt * 10);
      } else {
        body.rollVel *= Math.exp(-dt * 0.9);
        body.pitchVel *= Math.exp(-dt * 1.4);
      }

      body.roll = wrapAngle(body.roll + body.rollVel * dt);
      body.pitch = clamp(body.pitch + body.pitchVel * dt, -0.75, 0.75);

      if (grounded) {
        const targetRoll = Math.cos(body.roll) < 0 ? (body.roll >= 0 ? Math.PI : -Math.PI) : 0;
        if (Math.abs(body.rollVel) < 0.06 && Math.abs(body.roll - targetRoll) < 0.025) {
          body.roll = targetRoll === 0 ? 0 : Math.PI;
          body.rollVel = 0;
        }
        if (Math.abs(body.pitchVel) < 0.06 && Math.abs(body.pitch) < 0.02) {
          body.pitch = 0;
          body.pitchVel = 0;
        }
      }
      body.flipped = Math.cos(body.roll) < 0;
    }
  }
}
