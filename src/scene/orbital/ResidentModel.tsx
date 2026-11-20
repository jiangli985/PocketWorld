import React, { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { Html } from '@react-three/drei';
import { type ThreeElements } from '@react-three/fiber';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { createResidentRig } from './residentRig';
import { applyResidentSkin } from './residentSkin';
import { createChairAnimation } from './chairAnimation';
import { loadResidentAssets, type ResidentAssets } from './wardrobe/residentAssets';
import type { ResidentOutfit } from './wardrobe/outfit';

export { HIP_HEIGHT } from './residentRig';
export interface ResidentLeg {
  thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone;
  upperLength: number; lowerLength: number; ankleHeight: number; hipForward: number;
  straighten: [number, number];
}
export interface ResidentArm {
  shoulder: THREE.Bone; upper: THREE.Bone; forearm: THREE.Bone; hand: THREE.Bone;
  restUpper: THREE.Vector3; restLower: THREE.Vector3; restWrist: THREE.Vector3;
  upperLength: number; lowerLength: number;
  palmBasis: THREE.Quaternion; palmOffset: THREE.Vector3;
  fingerTipOffset?: THREE.Vector3;
  setFingers?: (curl: number, thumbOppose?: number) => void;
}
export interface ResidentRig {
  neutralPose: { joint: THREE.Bone; pose: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 } }[];
  legs: ResidentLeg[]; arms: ResidentArm[]; torso: THREE.Bone; neck: THREE.Bone; head?: THREE.Bone;
  skirtFront: THREE.Bone; skirtBack: THREE.Bone; mesh: THREE.Group;
  applyPose: (phase: number, walkWeight: number) => void;
  followMotion: (dt: number, enabled: boolean, yaw: number, dx: number, dz: number, phase: number) => void;
  fitted?: ResidentAssets['fitted'];
  applyChairPose?: (time: number, weight: number) => void;
  dispose: () => void;
}

function LoadedResident({ assets, rig }: { assets: ResidentAssets; rig: MutableRefObject<ResidentRig | null> }) {
  const container = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const group = container.current!;
    const asset = clone(assets.scene);
    const resident = createResidentRig(asset, assets.walk, !!assets.fitted);
    const chair = createChairAnimation(asset, assets.sit, assets.contact);
    resident.fitted = assets.fitted;
    resident.applyChairPose = chair.apply;
    resident.mesh.userData.outfit = assets.outfit;
    const restoreSkin = assets.outfit === 'everyday' ? applyResidentSkin(resident.mesh) : undefined;
    group.add(resident.mesh);
    rig.current = resident;
    return () => {
      if (rig.current === resident) rig.current = null;
      group.remove(resident.mesh);
      restoreSkin?.();
      chair.dispose();
      resident.dispose();
    };
  }, [assets, rig]);
  return <group ref={container} />;
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
    return <group onPointerDown={event => { event.stopPropagation(); this.setState({ failed: false }); }}><ModelStatus failed /></group>;
  }
}

export function ResidentModel({ rig, outfit = 'everyday', onFailure, ...props }: ThreeElements['group'] & {
  rig: MutableRefObject<ResidentRig | null>; outfit?: ResidentOutfit; onFailure?: () => void;
}) {
  const [assets, setAssets] = useState<ResidentAssets | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failureCallback = useRef(onFailure);
  failureCallback.current = onFailure;
  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadResidentAssets(outfit).then(value => {
      if (active) setAssets(value);
    }).catch(() => {
      if (active) { setFailed(true); failureCallback.current?.(); }
    });
    return () => { active = false; };
  }, [outfit, attempt]);
  return <group {...props}>
    {assets && <ResidentBoundary key={assets.outfit} onFailure={onFailure}><LoadedResident assets={assets} rig={rig} /></ResidentBoundary>}
    {failed ? <group onPointerDown={event => { event.stopPropagation(); setAttempt(value => value + 1); }}><ModelStatus failed /></group>
      : !assets && <ModelStatus />}
  </group>;
}
