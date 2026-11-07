import React, { Suspense, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';

type Vec = [number, number, number];
export interface ResidentLeg {
  thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone;
  upperLength: number; lowerLength: number; ankleHeight: number; hipForward: number;
  straighten: [number, number];
}
export interface ResidentRig { legs: ResidentLeg[]; skirtFront: THREE.Bone; skirtBack: THREE.Bone }

const MODEL = `${import.meta.env.BASE_URL}models/resident/luna.glb`;
export const HIP_HEIGHT = 0.69;
const JOINTS: { hip: Vec; knee: Vec; ankle: Vec }[] = [
  { hip: [-0.055, HIP_HEIGHT, 0.06], knee: [-0.07, 0.30, 0.03], ankle: [-0.052, 0.065, 0.025] },
  { hip: [0.055, HIP_HEIGHT, 0.06], knee: [0.065, 0.30, 0.03], ankle: [0.046, 0.065, 0.025] },
];
const smooth = THREE.MathUtils.smoothstep;
const tilt = (from: Vec, to: Vec) => Math.atan2(to[2] - from[2], from[1] - to[1]);

function rigResident(source: THREE.Mesh) {
  const geometry = source.geometry.clone();
  const position = geometry.getAttribute('position');
  const indices = new Uint16Array(position.count * 4), weights = new Float32Array(position.count * 4);
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
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
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
  const mesh = new THREE.SkinnedMesh(geometry, source.material);
  mesh.name = 'Resident'; mesh.add(root); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return { mesh, rig: { legs: rig, skirtFront, skirtBack } };
}

function LoadedResident({ rig }: { rig: MutableRefObject<ResidentRig | null> }) {
  const { scene } = useGLTF(MODEL);
  const container = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const resident = rigResident(scene.getObjectByProperty('isMesh', true) as THREE.Mesh);
    const group = container.current!;
    group.add(resident.mesh); rig.current = resident.rig;
    return () => { rig.current = null; group.remove(resident.mesh); resident.mesh.geometry.dispose(); resident.mesh.skeleton.dispose(); };
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

class ResidentBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <group onPointerDown={event => { event.stopPropagation(); useGLTF.clear(MODEL); this.setState({ failed: false }); }}><ModelStatus failed /></group>;
  }
}

export function ResidentModel({ rig, ...props }: ThreeElements['group'] & { rig: MutableRefObject<ResidentRig | null> }) {
  return <group {...props}>
    <ResidentBoundary><Suspense fallback={<ModelStatus />}><LoadedResident rig={rig} /></Suspense></ResidentBoundary>
  </group>;
}

useGLTF.preload(MODEL);
