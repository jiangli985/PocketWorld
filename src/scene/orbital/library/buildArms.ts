import * as THREE from 'three';
import type { ResidentArm } from '../ResidentModel';
export function buildArms(arms: ResidentArm[]) {
  const material = new THREE.MeshStandardMaterial({ color: '#f1cec5', roughness: .88, emissive: '#f1cec5', emissiveIntensity: .13 });
  const ball = (parent: THREE.Object3D, position: THREE.Vector3, scale: [number, number, number]) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material); mesh.position.copy(position); mesh.scale.set(...scale); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const limb = (parent: THREE.Object3D, offset: THREE.Vector3, from: number, to: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(to, from, offset.length(), 20, 6), material);
    mesh.position.copy(offset).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), offset.clone().normalize()); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  };
  arms.forEach((arm, side) => {
    ball(arm.upper, new THREE.Vector3(), [.034, .038, .034]); limb(arm.upper, arm.restUpper, .034, .025);
    ball(arm.forearm, new THREE.Vector3(), [.025, .025, .025]); limb(arm.forearm, arm.restLower, .025, .016);
    ball(arm.hand, new THREE.Vector3(), [.017, .017, .017]);
    const palm = new THREE.Group(), direction = side ? new THREE.Vector3(-.025, -.004, .014) : new THREE.Vector3(-.008, -.025, -.004);
    palm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.clone().normalize()); arm.hand.add(palm); arm.palmBasis = palm.quaternion.clone(); arm.palmOffset = new THREE.Vector3(0, -.022, 0).applyQuaternion(palm.quaternion);
    ball(palm, new THREE.Vector3(0, -.022, 0), [.021, .027, .010]);
    for (let i = 0; i < 4; i++) ball(palm, new THREE.Vector3((i - 1.5) * .010, -.048 + Math.abs(i - 1.5) * .003, 0), [.0055, .016, .006]);
    const thumb = ball(palm, new THREE.Vector3(-.022, -.022, .001), [.008, .019, .008]); thumb.rotation.z = -.5;
  });
}
