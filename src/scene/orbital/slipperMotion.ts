export type SlipperRect = [number, number, number, number];
export interface SlipperBounds { left: number; right: number; back: number; front: number }
export interface SlipperBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  spin: number;
  radius: number;
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
const MAX_KICK = 1.7;
const SUBSTEP = 0.035;

export function createSlipperPair(centers: [number, number][], radii: number[] = []): SlipperBody[] {
  return centers.map(([x, z], index) => ({ x, z, vx: 0, vz: 0, yaw: 0, spin: 0, radius: radii[index] ?? 0.12 }));
}

function open(x: number, z: number, boxes: SlipperRect[], bounds: SlipperBounds) {
  return x >= bounds.left && x <= bounds.right && z >= bounds.back && z <= bounds.front
    && !boxes.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
}

/** Loose slippers slide when Luna steps into them and settle against walls or furniture. */
export function stepSlippers(bodies: SlipperBody[], dt: number, mover: SlipperMover, boxes: SlipperRect[], bounds: SlipperBounds, reducedMotion = false) {
  if (!(dt > 0)) return;
  const drag = Math.exp(-dt * (reducedMotion ? 7 : SLIPPER_DRAG));
  for (const body of bodies) {
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
          body.spin = reducedMotion ? 0 : Math.max(-5, Math.min(5, lateral * 2.4 + (approach > 0.7 ? (nx >= 0 ? .9 : -.9) : 0)));
        }
      }
    }

    body.vx *= drag; body.vz *= drag;
    body.spin *= Math.exp(-dt * 5);
    if (Math.hypot(body.vx, body.vz) < 0.015) { body.vx = 0; body.vz = 0; }
    if (Math.abs(body.spin) < 0.02) body.spin = 0;

    const travel = Math.hypot(body.vx, body.vz) * dt;
    const steps = Math.max(1, Math.ceil(travel / SUBSTEP));
    for (let i = 0; i < steps; i++) {
      const x = body.x + body.vx * dt / steps;
      if (open(x, body.z, boxes, bounds)) body.x = x;
      else body.vx *= -SLIPPER_REST;
      const z = body.z + body.vz * dt / steps;
      if (open(body.x, z, boxes, bounds)) body.z = z;
      else body.vz *= -SLIPPER_REST;
    }
    body.yaw += body.spin * dt;
  }
}
