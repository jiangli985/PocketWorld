import React, { Component, Suspense, useMemo } from 'react';
import { useSceneGLTF as useGLTF } from './useSceneGLTF';
import * as THREE from 'three';
import { cloneSuppliedModel } from './supplied-model';

type Vector = [number, number, number];
interface Props {
  name: string;
  size: Vector;
  position?: Vector;
  rotation?: Vector;
  /** A named part from the independently exported articulation file. */
  part?: string;
  partBounds?: boolean;
  fit?: 'contain' | 'contact';
  castShadow?: boolean;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

interface CachedBounds {
  extent: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
}

const boundsCache = new WeakMap<THREE.Object3D, Map<string, CachedBounds>>();

function measureSuppliedBounds(scene: THREE.Object3D, part?: string, partBounds?: boolean): CachedBounds {
  let byKey = boundsCache.get(scene);
  if (!byKey) {
    byKey = new Map();
    boundsCache.set(scene, byKey);
  }
  const key = partBounds && part ? part : '';
  const hit = byKey.get(key);
  if (hit) return hit;
  scene.updateMatrixWorld(true);
  const target = partBounds && part ? scene.getObjectByName(part) ?? scene : scene;
  const bounds = new THREE.Box3().setFromObject(target);
  const entry: CachedBounds = {
    extent: bounds.getSize(new THREE.Vector3()),
    center: bounds.getCenter(new THREE.Vector3()),
    minY: bounds.min.y,
  };
  byKey.set(key, entry);
  return entry;
}

class Boundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Loaded({ name, size, position, rotation, part, partBounds, fit: fitMode = 'contain', castShadow = true }: Props) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/replaced/${name}.glb`);
  const model = useMemo(() => cloneSuppliedModel(scene, part, { castShadow }), [scene, part, castShadow]);
  const fit = useMemo(() => {
    const { extent, center, minY } = measureSuppliedBounds(scene, part, partBounds);
    const ratios = size.map((value, axis) => value / Math.max(extent.getComponent(axis), .00001));
    const factors = (fitMode === 'contact' ? ratios : ratios.map(() => Math.min(...ratios))) as Vector;
    return { factors, offset: [-center.x, -minY, -center.z] as Vector };
  }, [scene, part, partBounds, fitMode, ...size]);
  return <group position={position} rotation={rotation} name={`Supplied_${name}${part ? '_' + part : ''}`} dispose={null}>
    <group scale={fit.factors}><group position={fit.offset}><primitive object={model} /></group></group>
  </group>;
}
/** Local loading/error fallback keeps the original object functional while loading. */
export function SuppliedAsset(props: Props) {
  const fallback = props.fallback ?? null;
  return <Boundary key={`${props.name}/${props.part ?? ''}`} fallback={fallback}><Suspense fallback={props.loadingFallback === undefined ? fallback : props.loadingFallback}><Loaded {...props} /></Suspense></Boundary>;
}
