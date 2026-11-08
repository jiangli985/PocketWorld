import React, { Suspense, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { closeBody } from './library/closeBody';
import { buildArms } from './library/buildArms';

type Vec = [number, number, number];
export interface ResidentLeg {
  thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone;
  upperLength: number; lowerLength: number; ankleHeight: number; hipForward: number;
  straighten: [number, number];
}
export interface ResidentArm { shoulder: THREE.Bone; upper: THREE.Bone; forearm: THREE.Bone; hand: THREE.Bone; restUpper: THREE.Vector3; restLower: THREE.Vector3; upperLength: number; lowerLength: number; palmBasis?: THREE.Quaternion; palmOffset?: THREE.Vector3 }
export interface ResidentRig { legs: ResidentLeg[]; skirtFront: THREE.Bone; skirtBack: THREE.Bone; arms: ResidentArm[]; torso: THREE.Bone; neck: THREE.Bone; bunny: THREE.Group; mesh: THREE.SkinnedMesh }
const ARM_JOINTS: { shoulder: Vec; elbow: Vec; wrist: Vec }[] = [
  { shoulder: [-.125, 1.105, .025], elbow: [-.166, .91, .045], wrist: [-.213, .719, .08] },
  { shoulder: [.125, 1.105, .025], elbow: [.164, .91, .035], wrist: [.065, .889, .185] },
];
const segmentDistance = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const d = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(d) / d.lengthSq(), 0, 1); return { distance: p.distanceTo(a.clone().addScaledVector(d, t)), t }; };


const MODEL = `${import.meta.env.BASE_URL}models/resident/luna.glb`;
export const HIP_HEIGHT = 0.69;
const JOINTS: { hip: Vec; knee: Vec; ankle: Vec }[] = [
  { hip: [-0.055, HIP_HEIGHT, 0.06], knee: [-0.07, 0.30, 0.03], ankle: [-0.052, 0.065, 0.025] },
  { hip: [0.055, HIP_HEIGHT, 0.06], knee: [0.065, 0.30, 0.03], ankle: [0.046, 0.065, 0.025] },
];
const smooth = THREE.MathUtils.smoothstep;
const tilt = (from: Vec, to: Vec) => Math.atan2(to[2] - from[2], from[1] - to[1]);

export function rigResident(source: THREE.Mesh) {
  const geometry = source.geometry.clone();
  const position = geometry.getAttribute('position');
  const indices = new Uint16Array(position.count * 4), weights = new Float32Array(position.count * 4);
  const uv = geometry.getAttribute('uv');
  const material = source.material as THREE.MeshStandardMaterial;
  const image = material.map!.image as HTMLImageElement;
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const skin = new Uint8Array(position.count), bunnyVertices = new Uint8Array(position.count);
  const armJoints = ARM_JOINTS.map(j => ({ a: new THREE.Vector3(...j.shoulder), b: new THREE.Vector3(...j.elbow), c: new THREE.Vector3(...j.wrist) }));
  for (let i = 0; i < position.count; i++) {
    const u = Math.max(0, Math.min(image.width - 1, Math.floor(uv.getX(i) * image.width))), v = Math.max(0, Math.min(image.height - 1, Math.floor(uv.getY(i) * image.height)));
    const offset = (v * image.width + u) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    skin[i] = r > g + 7 && r > b + 5 && g > b - 12 && g < b + 35 ? 1 : 0;
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const flesh = r > g + 15 && r > b + 15 && b < 225 && Math.abs(g - b) < 22;
    const body = ((x - .12) / .075) ** 2 + ((y - .966) / .075) ** 2 < 1 && z > .139 && !(y < .932 && flesh);
    const ears = x > .12 && y >= 1.025 && y < 1.145 && z > .085;
    bunnyVertices[i] = body || ears ? 1 : 0;
  }
  const seams = new Map<string, number[]>();
  for (let i = 0; i < position.count; i++) { const key = `${position.getX(i).toFixed(5)}/${position.getY(i).toFixed(5)}/${position.getZ(i).toFixed(5)}`; const group = seams.get(key); if (group) group.push(i); else seams.set(key, [i]); }
  for (const group of seams.values()) { const hasSkin = group.some(i => skin[i]), hasBunny = group.some(i => bunnyVertices[i]); for (const i of group) { skin[i] = hasSkin ? 1 : 0; bunnyVertices[i] = hasBunny ? 1 : 0; } }
  const bodyTriangles: number[] = [], bunnyTriangles: number[] = [], sourceIndex = geometry.getIndex()!;
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const a = sourceIndex.getX(i), b = sourceIndex.getX(i + 1), c = sourceIndex.getX(i + 2);
    if (bunnyVertices[a] + bunnyVertices[b] + bunnyVertices[c] >= 2) { if ((position.getY(a) + position.getY(b) + position.getY(c)) / 3 > .967) bunnyTriangles.push(a, b, c); }
    else bodyTriangles.push(a, b, c);
  }
  geometry.setIndex(bodyTriangles);
  const bunnyGeometry = source.geometry.clone(); bunnyGeometry.setIndex(bunnyTriangles); bunnyGeometry.translate(-.115, -.895, -.17);
  const bunny = new THREE.Group(); bunny.name = 'ResidentBunny'; bunny.position.set(.115, .895, .17);
  const bunnyMesh = new THREE.Mesh(bunnyGeometry, source.material); bunnyMesh.castShadow = bunnyMesh.receiveShadow = true; bunny.add(bunnyMesh);
  const plush = new THREE.MeshStandardMaterial({ color: '#f6f1e8', roughness: .95 });
  const addPlush = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material = plush) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; bunny.add(m); };
  addPlush(0, .052, 0, .052, .055, .044);
  addPlush(0, .105, -.006, .064, .038, .036);
  addPlush(.033, .174, -.065, .018, .052, .016); bunny.children[bunny.children.length - 1].rotation.z = -.3;
  addPlush(.072, .16, -.056, .017, .052, .015); bunny.children[bunny.children.length - 1].rotation.z = -.95;
  addPlush(-.027, .006, .012, .024, .015, .027); addPlush(.027, .006, .012, .024, .015, .027);
  addPlush(-.045, .055, .008, .018, .034, .019); addPlush(.045, .055, .008, .018, .034, .019);
  const bow = new THREE.MeshStandardMaterial({ color: '#e7bb57', roughness: .8 });
  addPlush(-.017, .069, .045, .022, .012, .008, bow); addPlush(.017, .069, .045, .022, .012, .008, bow);


  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), side = x > 0 ? 1 : 0;
    if (y < 0.57) {
      const shin = 1 - smooth(y, 0.265, 0.335);
      const foot = 1 - smooth(y, 0.06, 0.12);
      const thighIndex = 1 + side * 3;
      indices.set([thighIndex, thighIndex + 1, thighIndex + 2, 0], i * 4);
      weights.set([1 - shin, shin * (1 - foot), shin * foot, 0], i * 4);
    } else {
      const skirt = 1 - smooth(y, 0.57, 0.86);
      const front = smooth(z, -0.13, 0.02);
      indices.set([0, 7, 8, 0], i * 4);
      weights.set([1 - skirt, skirt * front, skirt * (1 - front), 0], i * 4);
    }
    if (y > .60 && y < 1.14 && !bunnyVertices[i]) {
      const p = new THREE.Vector3(x, y, z), joint = armJoints[side];
      const upper = segmentDistance(p, joint.a, joint.b), lower = segmentDistance(p, joint.b, joint.c);
      const fingers = segmentDistance(p, joint.c, side ? new THREE.Vector3(.012, .88, .215) : new THREE.Vector3(-.232, .665, .06));
      const near = Math.min(upper.distance, lower.distance, fingers.distance);
      if (near < .045 && (skin[i] || (!side && (y > .80 || x < -.19)))) {
        const start = 12 + side * 4;
        const wrist = smooth(1 - lower.t, 0, .28);
        const elbow = smooth(y, .88, .96);
        if (upper.distance < lower.distance) { indices.set([start, start + 1, 9, 0], i * 4); const attach = smooth(y, 1.065, 1.14); weights.set([(1 - attach) * elbow, (1 - attach) * (1 - elbow), attach, 0], i * 4); }
        else { indices.set([start + 1, start + 2, start, 0], i * 4); weights.set([wrist, 1 - wrist, 0, 0], i * 4); }
      }
    }
    if (y > 1.17) { indices.set([10, 0, 0, 0], i * 4); weights.set([1, 0, 0, 0], i * 4); }
  }
  geometry.setAttribute('skinIndex' , new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const root = new THREE.Bone(), bones = [root];
  const rig = JOINTS.map(({ hip, knee, ankle }, side): ResidentLeg => {
    const thigh = new THREE.Bone(), shin = new THREE.Bone(), foot = new THREE.Bone();
    thigh.name = `ResidentThigh_${side}`; shin.name = `ResidentShin_${side}`; foot.name = `ResidentFoot_${side}`;
    thigh.position.set(...hip);
    shin.position.set(knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]);
    foot.position.set(ankle[0] - knee[0], ankle[1] - knee[1], ankle[2] - knee[2]);
    root.add(thigh); thigh.add(shin); shin.add(foot); bones.push(thigh, shin, foot);
    return { thigh, shin, foot, upperLength: Math.hypot(knee[1] - hip[1], knee[2] - hip[2]),
      lowerLength: Math.hypot(ankle[1] - knee[1], ankle[2] - knee[2]), ankleHeight: ankle[1], hipForward: hip[2],
      straighten: [tilt(hip, knee), tilt(knee, ankle) - tilt(hip, knee)] };
  });
  const skirtFront = new THREE.Bone(), skirtBack = new THREE.Bone();
  skirtFront.name = 'ResidentSkirtFront'; skirtBack.name = 'ResidentSkirtBack';
  skirtFront.position.set(0, HIP_HEIGHT, 0.19); skirtBack.position.set(0, HIP_HEIGHT, -0.10);
  root.add(skirtFront, skirtBack); bones.push(skirtFront, skirtBack);
  const torso = new THREE.Bone(), neck = new THREE.Bone(); torso.name = 'ResidentTorso'; neck.name = 'ResidentNeck';
  torso.position.set(0, .9, 0); neck.position.set(0, .27, 0); root.add(torso); torso.add(neck); bones.push(torso, neck);
  const arms = ARM_JOINTS.map((j, side): ResidentArm => {
    const shoulder = new THREE.Bone(), upper = new THREE.Bone(), forearm = new THREE.Bone(), hand = new THREE.Bone();
    shoulder.name = `ResidentShoulder_${side}`; upper.name = `ResidentUpperArm_${side}`; forearm.name = `ResidentForearm_${side}`; hand.name = `ResidentHand_${side}`;
    shoulder.position.set(j.shoulder[0], j.shoulder[1] - .9, j.shoulder[2]);
    forearm.position.set(j.elbow[0] - j.shoulder[0], j.elbow[1] - j.shoulder[1], j.elbow[2] - j.shoulder[2]);
    hand.position.set(j.wrist[0] - j.elbow[0], j.wrist[1] - j.elbow[1], j.wrist[2] - j.elbow[2]);
    torso.add(shoulder); shoulder.add(upper); upper.add(forearm); forearm.add(hand); bones.push(shoulder, upper, forearm, hand);
    return { shoulder, upper, forearm, hand, restUpper: forearm.position.clone(), restLower: hand.position.clone(), upperLength: forearm.position.length(), lowerLength: hand.position.length() };
  });
  const bodyOnly: number[] = [];
  const armBone = (index: number) => (index >= 12 && index <= 14) || (index >= 16 && index <= 18);
  const originalTriangles = geometry.getIndex()!;
  for (let i = 0; i < originalTriangles.count; i += 3) {
    const a = originalTriangles.getX(i), b = originalTriangles.getX(i + 1), c = originalTriangles.getX(i + 2);
    if ([a, b, c].some(index => armBone(indices[index * 4]))) continue;
    bodyOnly.push(a, b, c);
  }
  geometry.setIndex(bodyOnly); buildArms(arms);
  const mesh = new THREE.SkinnedMesh(geometry, source.material);
  mesh.name = 'Resident'; mesh.add(root, bunny); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = mesh.receiveShadow = true;
  const fabric = new THREE.SkinnedMesh(closeBody(geometry), new THREE.MeshStandardMaterial({ color: '#ded8ed', roughness: .88, emissive: '#ded8ed', emissiveIntensity: .15, side: THREE.DoubleSide })); fabric.bind(mesh.skeleton, mesh.bindMatrix); fabric.name = 'ResidentRestoredFabric'; fabric.castShadow = fabric.receiveShadow = true; fabric.frustumCulled = false; fabric.raycast = () => {}; mesh.add(fabric);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return { mesh, rig: { legs: rig, skirtFront, skirtBack, arms, torso, neck, bunny, mesh } };
}

function LoadedResident({ rig }: { rig: MutableRefObject<ResidentRig | null> }) {
  const { scene } = useGLTF(MODEL);
  const container = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const resident = rigResident(scene.getObjectByProperty('isMesh', true) as THREE.Mesh);
    const group = container.current!;
    group.add(resident.mesh); rig.current = resident.rig;
    return () => { rig.current = null; group.remove(resident.mesh); resident.mesh.geometry.dispose(); resident.mesh.skeleton.dispose(); resident.mesh.traverse(object => { if (object instanceof THREE.Mesh && object !== resident.mesh) { object.geometry.dispose(); if (object.material !== resident.mesh.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } } }); };
  }, [scene, rig]);
  return <group ref={container}>
    <mesh name="ResidentHitArea" position={[0, 0.725, 0.02]} visible={false}><capsuleGeometry args={[0.2, 1.05, 4, 8]} /></mesh>
  </group>;
}

function ModelStatus({ failed = false }: { failed?: boolean }) {
  return <group name={failed ? 'ResidentLoadError' : 'ResidentLoading'}>
    <mesh position={[0, 0.725, 0]} castShadow><capsuleGeometry args={[0.17, 1.05, 6, 16]} /><meshStandardMaterial color="#e6edf4" roughness={0.8} /></mesh>
    <Html center position={[0, 1.65, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap', color: '#f6efdc', fontSize: 12 }}>
      <span role={failed ? 'alert' : 'status'}>{failed ? '人物加载失败 · 轻触重试或刷新页面' : '人物加载中…'}</span>
    </Html>
  </group>;
}

class ResidentBoundary extends React.Component<{ children: React.ReactNode; onFailure?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure?.(); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <group onPointerDown={event => { event.stopPropagation(); useGLTF.clear(MODEL); this.setState({ failed: false }); }}><ModelStatus failed /></group>;
  }
}

export function ResidentModel({ rig, onFailure, ...props }: ThreeElements['group'] & { rig: MutableRefObject<ResidentRig | null>; onFailure?: () => void }) {
  return <group {...props}>
    <ResidentBoundary onFailure={onFailure}><Suspense fallback={<ModelStatus />}><LoadedResident rig={rig} /></Suspense></ResidentBoundary>
  </group>;
}

useGLTF.preload(MODEL);
