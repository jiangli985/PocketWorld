import * as THREE from 'three';
import type { ResidentArm, ResidentRig } from '../ResidentModel';
const origin = new THREE.Vector3(), target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3(), elbow = new THREE.Vector3(), local = new THREE.Vector3(), rotation = new THREE.Quaternion();
function aim(bone: THREE.Bone, rest: THREE.Vector3, point: THREE.Vector3) {
  bone.parent!.updateWorldMatrix(true, false);
  local.copy(point); bone.parent!.worldToLocal(local); local.sub(bone.position).normalize();
  bone.quaternion.setFromUnitVectors(axis.copy(rest).normalize(), local); bone.updateWorldMatrix(false, true);
}
export function reachArm(rig: ResidentRig, arm: ResidentArm, destination: THREE.Vector3, side: number) {
  rig.mesh.updateWorldMatrix(true, true);
  arm.upper.getWorldPosition(origin); target.copy(destination).sub(origin);
  const distance = THREE.MathUtils.clamp(target.length(), Math.abs(arm.upperLength - arm.lowerLength) + .002, arm.upperLength + arm.lowerLength - .002);
  target.normalize();
  bend.set(side ? .5 : -.5, -.35, .6).applyQuaternion(rig.mesh.getWorldQuaternion(rotation));
  bend.addScaledVector(target, -bend.dot(target)).normalize();
  const along = (arm.upperLength ** 2 - arm.lowerLength ** 2 + distance ** 2) / (2 * distance);
  elbow.copy(origin).addScaledVector(target, along).addScaledVector(bend, Math.sqrt(Math.max(0, arm.upperLength ** 2 - along ** 2)));
  aim(arm.upper, arm.restUpper, elbow); aim(arm.forearm, arm.restLower, destination);
  arm.hand.rotation.set(0, 0, side ? -.25 : .25);
}
export function resetArms(rig: ResidentRig, blend: number) {
  const identity = new THREE.Quaternion();
  rig.arms.forEach(arm => { arm.upper.quaternion.slerp(identity, blend); arm.forearm.quaternion.slerp(identity, blend); arm.hand.quaternion.slerp(identity, blend); });
  rig.neck.rotation.x *= 1 - blend;
}

export function reachPalm(rig: ResidentRig, arm: ResidentArm, contact: THREE.Vector3, side: number, orientation?: { quaternion: THREE.Quaternion; blend: number }) {
  const wrist = contact.clone();
  for (let i = 0; i < 2; i++) {
    reachArm(rig, arm, wrist, side); arm.hand.updateWorldMatrix(true, false);
    if (orientation && arm.palmBasis) {
      const base = arm.hand.getWorldQuaternion(new THREE.Quaternion()).multiply(arm.palmBasis).slerp(orientation.quaternion, orientation.blend);
      arm.hand.quaternion.copy(arm.hand.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(base).multiply(arm.palmBasis.clone().invert())); arm.hand.updateWorldMatrix(false, false);
    }
    const offset = (arm.palmOffset?.clone() ?? (side ? new THREE.Vector3(-.025, -.004, .014) : new THREE.Vector3(-.008, -.025, -.004))).applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion()));
    wrist.copy(contact).sub(offset);
  }
}
