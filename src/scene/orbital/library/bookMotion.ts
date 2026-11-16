import * as THREE from 'three';
import { readingStand, shelfOrigin, slotFor, type LibraryBook, type Vec3 } from './catalog';
import type { LibraryFlow } from './useLibrary';

export const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

const hermite = (p0: THREE.Vector3, t0: THREE.Vector3, p1: THREE.Vector3, t1: THREE.Vector3, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return new THREE.Vector3()
    .addScaledVector(p0, 2 * u3 - 3 * u2 + 1)
    .addScaledVector(t0, u3 - 2 * u2 + u)
    .addScaledVector(p1, -2 * u3 + 3 * u2)
    .addScaledVector(t1, u3 - u2);
};

const hermiteScalar = (p0: number, t0: number, p1: number, t1: number, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * t0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * t1;
};

export const shelfQuaternion = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)),
);

const HELD_TILT = -0.32;
const READING_TILT = 0.08;
export const heldQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(HELD_TILT, Math.PI, 0));

export function bookStand(scene: string, book: LibraryBook, near = false): Vec3 {
  const origin = shelfOrigin(scene);
  const slot = slotFor(book);
  const x = THREE.MathUtils.clamp(origin[0] + slot.position[0] + 0.01, origin[0] - 0.44, origin[0] + 0.46);
  return [x, 0, origin[2] + (near ? 0.52 : 0.90)];
}

export const AUTHORED_BOOK_RETREAT = .30;

export function authoredBookStand(scene: string, book: LibraryBook, held = false): Vec3 {
  const [x, y, z] = shelfOrigin(scene);
  return [x + slotFor(book).position[0], y, z + .58 + (held ? AUTHORED_BOOK_RETREAT : 0)];
}

export function bookHalfStepOffset(book: LibraryBook): number {
  const row = slotFor(book).row;
  return row === 2 ? 0.065 : row === 1 ? 0.032 : 0.025;
}

export function bookGrabSide(book: LibraryBook): 0 | 1 {
  return slotFor(book).column <= 2 ? 1 : 0;
}

export function bookGrabLocal(book: LibraryBook): THREE.Vector3 {
  const slot = slotFor(book);
  const side = bookGrabSide(book);
  const grabZ = slot.row === 2 ? -0.042 : slot.row === 0 ? 0.015 : 0.0;
  // Touch the actual side/spine surface next to the hand instead of the book's interior center.
  return new THREE.Vector3(-0.003, side === 0 ? -0.002 : 0.060, grabZ);
}

export function coverOpenCurve(flow: LibraryFlow): number {
  const p = THREE.MathUtils.clamp(flow.progress, 0, 1);
  if (flow.phase === 'open') return smooth((p - 0.04) / 0.74);
  if (flow.phase === 'close') return 1 - smooth((p - 0.22) / 0.68);
  if (['reading', 'turn'].includes(flow.phase)) return 1;
  return 0;
}

export const BOOK_WING_ANGLE = THREE.MathUtils.degToRad(12);
export const BOOK_PAGE_WIDTH = 0.235;
const CLOSED_PAGE_THICKNESS = 0.041;
const PAGE_BOTTOM = 0.0065;
const PAGE_CLEARANCE = 0.0015;

/** Shared frames for the covers, page stacks, text and hand contacts. */
export function bookWingPose(side: 0 | 1, openVal = 1) {
  const open = THREE.MathUtils.clamp(openVal, 0, 1);
  const spread = Math.sin(open * Math.PI / 2) ** 2;
  const angle = side === 0 ? (Math.PI - BOOK_WING_ANGLE) * open - Math.PI : BOOK_WING_ANGLE * open;
  const thickness = CLOSED_PAGE_THICKNESS * (side === 0 ? spread / 2 : 1 - spread / 2);
  return {
    position: new THREE.Vector3(0, side === 0 ? 0.058 * (1 - open) : 0, 0),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle),
    widthScale: side === 0 ? spread : 1,
    thickness,
    surfaceY: PAGE_BOTTOM + thickness + PAGE_CLEARANCE,
  };
}

export function bookWingPoint(side: 0 | 1, openVal: number, radius: number, y: number, z: number) {
  const wing = bookWingPose(side, openVal);
  return new THREE.Vector3((side === 0 ? -1 : 1) * radius * wing.widthScale, y, z)
    .applyQuaternion(wing.quaternion).add(wing.position);
}

export function bookCoverPose(openVal: number) {
  const wing = bookWingPose(0, openVal);
  return { position: wing.position, quaternion: wing.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)),
  };
}

export function bookCoverGripPose(openVal: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const open = THREE.MathUtils.clamp(openVal, 0, 1);
  const cover = bookCoverPose(open);
  const position = new THREE.Vector3(0.18, -0.004, -0.088).applyQuaternion(cover.quaternion).add(cover.position);
  const theta = Math.PI * open;
  const wingTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -BOOK_WING_ANGLE * open);
  const normal = new THREE.Vector3(-0.85 * Math.sin(theta), 0.35 + 0.65 * Math.cos(theta) ** 2, 0).applyQuaternion(wingTilt);
  const fingers = new THREE.Vector3(0.36 * (1 - open), 0.18 * Math.sin(theta), 0.92).applyQuaternion(wingTilt);
  return { position, quaternion: palmQuaternion(fingers, normal) };
}

export const PAGE_TURN_SECONDS = 3;
export const PAGE_CONTACT_START = 0.30;
export const PAGE_CONTACT_END = 0.66;

export function turningPageCurve(progress: number, direction: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  // The sheet waits for the crossing hand, peels slowly, then falls onto the other stack.
  // One continuous curve keeps its velocity unchanged when the fingers release it.
  const forwardRatio = smooth((p - PAGE_CONTACT_START) / 0.60);
  const leafRatio = direction >= 0 ? forwardRatio : 1 - forwardRatio;
  const bendAmp = Math.sin(leafRatio * Math.PI) * 0.022;
  const handContact = smooth((p - 0.16) / 0.14) * (1 - smooth((p - PAGE_CONTACT_END) / 0.10));
  return { leafRatio, bendAmp, handContact, liftPhase: forwardRatio, forwardRatio };
}

function palmQuaternion(fingerDirection: THREE.Vector3, palmNormal: THREE.Vector3) {
  const y = fingerDirection.clone().normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, palmNormal).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function bookSupportPose(side: 0 | 1, openVal = 1) {
  const open = THREE.MathUtils.clamp(openVal, 0, 1);
  const wing = bookWingPose(side, open);
  // +Z is the reader's front edge after the held book's PI yaw.
  const radius = side === 0 ? 0.125 : THREE.MathUtils.lerp(0.12, 0.035, open) + Math.sin(open * Math.PI) * 0.012;
  const y = THREE.MathUtils.lerp(-0.009, -0.014, open);
  const z = THREE.MathUtils.lerp(-0.072, 0.112, open);
  return {
    position: bookWingPoint(side, open, radius, y, z),
    quaternion: palmQuaternion(new THREE.Vector3(side === 0 ? 0.36 : -0.36, 0, 0.93),
      new THREE.Vector3(side === 0 ? -0.10 : 0.10, 0.995, 0)).premultiply(wing.quaternion),
  };
}

function pageGrip(progress: number, direction: number) {
  const curve = turningPageCurve(progress, direction);
  const page = turningPagePoint(curve.leafRatio, curve.bendAmp, 0.205, 0.085);
  // Approach the visible face palm-down. As the sheet rises, the palm follows its normal.
  const palmNormal = page.normal.clone().multiplyScalar(direction >= 0 ? -1 : 1);
  const fingerDirection = page.tangent.clone().multiplyScalar(0.42).add(new THREE.Vector3(0, 0, 0.9075));
  return {
    position: page.position.clone().addScaledVector(palmNormal, -0.002),
    quaternion: palmQuaternion(fingerDirection, palmNormal),
  };
}

/** Book-local contact and palm frame; shared with numerical/rig validation, without a frame clock. */
export function turningHandPose(progress: number, direction: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const side: 0 | 1 = direction >= 0 ? 0 : 1;
  const support = bookSupportPose(side);
  const sign = side === 0 ? -1 : 1;
  const outside = new THREE.Vector3(sign * 0.255, -0.012, 0.045);
  const lifted = new THREE.Vector3(sign * 0.255, 0.085, 0.045);
  const edgeOn = palmQuaternion(new THREE.Vector3(-sign * 0.36, 0, 0.93), new THREE.Vector3(sign, 0.18, 0));
  const catchPose = pageGrip(PAGE_CONTACT_START, direction);
  let position: THREE.Vector3, quaternion: THREE.Quaternion;
  let tipWeight = 0;
  if (p < 0.08) {
    const u = smooth(p / 0.08);
    position = support.position.clone().lerp(outside, u);
    quaternion = support.quaternion.clone();
  } else if (p < 0.16) {
    const u = smooth((p - 0.08) / 0.08);
    position = outside.clone().lerp(lifted, u);
    quaternion = support.quaternion.clone().slerp(edgeOn, u);
  } else if (p < PAGE_CONTACT_START) {
    const u = smooth((p - 0.16) / (PAGE_CONTACT_START - 0.16));
    position = lifted.clone().lerp(catchPose.position, u);
    position.y += Math.sin(u * Math.PI) * 0.055;
    quaternion = edgeOn.clone().slerp(catchPose.quaternion, u);
    tipWeight = u;
  } else if (p <= PAGE_CONTACT_END) {
    ({ position, quaternion } = pageGrip(p, direction));
    tipWeight = 1;
  } else if (p < 0.82) {
    const u = (p - PAGE_CONTACT_END) / (0.82 - PAGE_CONTACT_END);
    const release = pageGrip(PAGE_CONTACT_END, direction);
    const epsilon = 0.0001;
    const velocity = pageGrip(PAGE_CONTACT_END + epsilon, direction).position
      .sub(pageGrip(PAGE_CONTACT_END - epsilon, direction).position).multiplyScalar((0.82 - PAGE_CONTACT_END) / (2 * epsilon));
    // Keep the page's tangent at release, then clear the outer edge before lowering the hand.
    position = hermite(release.position, velocity, lifted, new THREE.Vector3(), u);
    quaternion = release.quaternion.clone().slerp(support.quaternion, smooth(u));
    tipWeight = 1 - smooth(u);
  } else if (p < 0.91) {
    const u = smooth((p - 0.82) / 0.09);
    position = lifted.clone().lerp(outside, u);
    quaternion = support.quaternion.clone();
  } else {
    const u = smooth((p - 0.91) / 0.09);
    position = outside.clone().lerp(support.position, u);
    quaternion = support.quaternion.clone();
  }
  const pinch = smooth((p - 0.24) / 0.06) * (1 - smooth((p - PAGE_CONTACT_END) / 0.08));
  return { side, position, quaternion, tipWeight,
    fingerCurl: THREE.MathUtils.lerp(0.04, 0.12, pinch),
    thumbOppose: THREE.MathUtils.lerp(0.024, 0.18, pinch),
    shoulderWeight: 0.1 + 0.20 * Math.sin(Math.PI * p) ** 2 };
}

export function turningPagePoint(leafRatio: number, bendAmp: number, rx = 0.185, rz = -0.085) {
  const ratio = THREE.MathUtils.clamp(leafRatio, 0, 1);
  const theta = BOOK_WING_ANGLE + (Math.PI - 2 * BOOK_WING_ANGLE) * ratio;
  const surface = bookWingPose(1).surfaceY;
  const by = Math.sin((rx / BOOK_PAGE_WIDTH) * Math.PI) * bendAmp;
  // The sheet bridges the small gutter between the two tilted top faces. At both
  // endpoints every vertex coincides with its static page wing, including the normal.
  const gutterX = THREE.MathUtils.lerp(-1, 1, ratio) * surface * Math.sin(BOOK_WING_ANGLE);
  const position = new THREE.Vector3(
    gutterX + rx * Math.cos(theta) - by * Math.sin(theta),
    surface * Math.cos(BOOK_WING_ANGLE) + rx * Math.sin(theta) + by * Math.cos(theta),
    rz,
  );
  const slope = (Math.PI / BOOK_PAGE_WIDTH) * Math.cos((rx / BOOK_PAGE_WIDTH) * Math.PI) * bendAmp;
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
  return {
    position,
    tangent: new THREE.Vector3(1, slope, 0).normalize().applyQuaternion(rot),
    normal: new THREE.Vector3(-slope, 1, 0).normalize().applyQuaternion(rot),
  };
}

export function bookPose(scene: string, book: LibraryBook, flow: LibraryFlow, authored = false) {
  const origin = shelfOrigin(scene);
  const slot = slotFor(book);
  const p = THREE.MathUtils.clamp(flow.progress, 0, 1);
  const t = smooth(p);
  const phase = flow.book?.id === book.id ? flow.phase : 'idle';
  const shelf = new THREE.Vector3(origin[0] + slot.position[0] + 0.035, slot.position[1], origin[2] + 0.20);
  const outside = shelf.clone().add(new THREE.Vector3(0, 0, 0.31));
  const root = authored ? authoredBookStand(scene, book, true) : bookStand(scene, book);
  const open = coverOpenCurve({ ...flow, phase });
  // Preserve the baked closed handoff; lower and draw the open book 6 cm nearer
  // so the visible front-edge grips remain comfortably inside the arm's reach.
  const heldBase = new THREE.Vector3(root[0] + 0.11 * (1 - open), THREE.MathUtils.lerp(0.93, 0.85, open), root[2] - 0.285 + 0.06 * open);
  const position = shelf.clone();
  const quaternion = shelfQuaternion.clone();

  if (phase === 'shelving') {
    position.z += (1 - t) * 0.15;
  } else if (phase === 'extract') {
    const u = 2.1 * p * p - 1.1 * p * p * p;
    position.lerpVectors(shelf, outside, u);
  } else if (['carry', 'open', 'reading', 'turn', 'close', 'return-carry'].includes(phase)) {
    position.copy(heldBase);
    quaternion.copy(heldQuaternion);
    // Keep the closed baked handoff, then raise the front edge with the opening cover.
    if (open > 0) quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.lerp(HELD_TILT, READING_TILT, open), Math.PI, 0));
    if (phase === 'carry') {
      // Continue straight-out +Z velocity from extract before arcing cleanly toward chest.
      const exitVel = new THREE.Vector3(0, 0, 0.44);
      position.copy(hermite(outside, exitVel, heldBase, new THREE.Vector3(0, 0, 0), p));
      quaternion.slerpQuaternions(shelfQuaternion, heldQuaternion, smooth((p - 0.06) / 0.88));
    } else if (phase === 'return-carry') {
      const enterVel = new THREE.Vector3(0, 0, -0.44);
      position.copy(hermite(heldBase, new THREE.Vector3(0, 0, 0), outside, enterVel, p));
      // Finish aligning straight to shelf slot before insert starts.
      quaternion.slerpQuaternions(heldQuaternion, shelfQuaternion, smooth(p / 0.86));
    } else if (phase === 'open') {
      const lift = smooth(p / 0.18) * (1 - smooth((p - 0.74) / 0.26)) * 0.015;
      const weightDip = -Math.sin(open * Math.PI) * 0.006;
      position.y += lift + weightDip;
      const roll = Math.sin(open * Math.PI) * 0.032;
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    } else if (phase === 'close') {
      const lift = smooth(p / 0.22) * (1 - smooth((p - 0.85) / 0.15)) * 0.015;
      const weightDip = -Math.sin(open * Math.PI) * 0.005;
      position.y += lift + weightDip;
      const roll = Math.sin(open * Math.PI) * 0.025;
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    } else if (phase === 'turn') {
      const tilt = Math.sin(smooth(p) * Math.PI) * (flow.direction >= 0 ? -0.016 : 0.016);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    }
  } else if (phase === 'insert') {
    const q = 1 - p;
    const u = 1 - (2.1 * q * q - 1.1 * q * q * q);
    position.lerpVectors(outside, shelf, u);
  }

  return { position, quaternion, open, phase };
}

export function residentLibraryTarget(scene: string, flow: LibraryFlow, authored = false): Vec3 {
  if (flow.book && flow.phase === 'align') return authored ? authoredBookStand(scene, flow.book) : bookStand(scene, flow.book, true);
  return readingStand(scene);
}

export const leafProgress = (flow: LibraryFlow) => turningPageCurve(flow.progress, flow.direction).forwardRatio;
