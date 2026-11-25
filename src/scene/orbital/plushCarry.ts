import { MathUtils, Quaternion, Vector3, type Bone, type Object3D } from 'three';
import { BEDROOM_LEFT, CABIN_DIVIDER_X, PLUSH_DOLLS, PLUSH_FLOOR_BOUNDS, RESIDENT_RADIUS, deckFromAuthoredX } from './cabinLayout.ts';
import { dollOpen, type PlushBody, type PlushRect } from './plushMotion.ts';
import { placeLimbEnd } from './residentRig.ts';

export const plushLabels = { 'plush-bunny': '兔子', 'plush-bear': '小熊', 'plush-penguin': '企鹅' };
export function plushBounds(upper: boolean) {
  return upper ? { ...PLUSH_FLOOR_BOUNDS, left: BEDROOM_LEFT + .15, right: CABIN_DIVIDER_X - .05 }
    : { ...PLUSH_FLOOR_BOUNDS, left: CABIN_DIVIDER_X + .05 };
}
export function dropSpot(body: PlushBody, x: number, z: number, yaw: number, boxes: PlushRect[], dolls: PlushBody[]) {
  const bounds = plushBounds(deckFromAuthoredX(x) === 'upper');
  const distance = body.radius + RESIDENT_RADIUS + .055;
  for (const offset of [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.57, -1.57, 2.3, -2.3, Math.PI]) {
    const facing = yaw + offset;
    const px = x + Math.sin(facing) * distance, pz = z + Math.cos(facing) * distance;
    if (dollOpen(px, pz, body.radius, boxes, bounds)
      && dolls.every(other => other === body || Math.hypot(px - other.x, pz - other.z) >= body.radius + other.radius + .02)) {
      return { x: px, z: pz, yaw: facing };
    }
  }
  return null;
}

export function gripPlush(body: PlushBody) {
  const height = PLUSH_DOLLS.find(doll => doll.id === body.id)!.height;
  return { body, height, floorX: body.x, floorZ: body.z, handWeight: 0, center: new Vector3(), yaw: body.yaw, visible: true };
}
export type PlushGrip = ReturnType<typeof gripPlush>;

/** The pickup clip supplies the initial one-handed lift. Both arms then support the toy
 * against the torso while the independent leg tracks continue to walk or climb. */
export function createPlushPose(mesh: Object3D) {
  const arms = ['Right', 'Left'].map(side => ['Arm', 'ForeArm', 'Hand'].map(
    part => mesh.getObjectByName('mixamorig' + side + part) as Bone));
  const wrist = new Vector3(), goal = new Vector3(), pole = new Vector3(), facing = new Quaternion();
  const fingers = ['Right', 'Left'].map(side => mesh.getObjectByName('mixamorig' + side + 'HandMiddle1')!.position.clone().normalize());
  const handRotation = new Quaternion(), curl = new Quaternion();
  const fingerDirection = new Vector3(), wrapped = new Vector3();
  const center = new Vector3(), offset = new Vector3(), hips = mesh.getObjectByName('mixamorigHips')!;
  return (root: Object3D, grip: PlushGrip, time: number, gripTime: number) => {
    const { height } = grip;
    root.getWorldQuaternion(facing);
    hips.getWorldPosition(center);
    center.add(offset.set(0, height * .32, .225).applyQuaternion(facing));
    const cradle = MathUtils.smoothstep(time, gripTime + .25, gripTime + 1.2);
    if (cradle > 0) {
      arms.forEach((arm, index) => {
        const side = index ? 1 : -1;
        goal.copy(center).add(offset.set(side * grip.body.radius * .94, -height * .16, .025).applyQuaternion(facing));
        arm[2].getWorldPosition(wrist).lerp(goal, cradle);
        arm[2].getWorldQuaternion(handRotation);
        fingerDirection.copy(fingers[index]).applyQuaternion(handRotation);
        wrapped.set(-side * .64, .15, .75).normalize().applyQuaternion(facing);
        wrapped.lerpVectors(fingerDirection, wrapped, cradle).normalize();
        curl.setFromUnitVectors(fingerDirection, wrapped);
        placeLimbEnd(arm, wrist, handRotation.premultiply(curl), pole.set(side, -.65, -.32).applyQuaternion(facing));
      });
    }
    arms[0][2].getWorldPosition(grip.center).add(offset.set(.045, .012, .075).applyQuaternion(facing)).lerp(center, cradle);
    grip.handWeight = MathUtils.smoothstep(time, gripTime - .06, gripTime + .32);
    grip.yaw = root.rotation.y;
  };
}
