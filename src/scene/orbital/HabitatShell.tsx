import { CABIN_LEFT, CABIN_RIGHT, CABIN_CENTER_X, WARDROBE_FOOTPRINT } from './cabinLayout';
import React, { Suspense, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { AssetBoundary } from './ReusableAsset';
import { extractSlipperModel, isSlipperMaterial } from './slipperModel';

import { ObjectHandle } from './ObjectHandle';
import { outfitHint, readOutfit } from './wardrobe/outfit';
import type { WorldModelProps } from '../../types/world';

interface HabitatShellProps {
  world: WorldModelProps;
  onFloorClick?: (point: [number, number, number]) => void;
}

function CabinModel({ world }: Pick<HabitatShellProps, 'world'>) {
  const variant = world.sceneId;
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/cabin/open-cabin.glb`);
  const cabin = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse(node => {
      if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true;
    });
    if (variant === 'observatory') {
      for (const part of ['Wardrobe_Nightstand', 'Stationery', 'Shelf_Gallery', 'Rugs']) copy.getObjectByName(part)?.removeFromParent();
    } else if (extractSlipperModel(scene)) {
      // The pair is re-mounted as separate props so Luna can kick them around.
      const slippers: THREE.Object3D[] = [];
      copy.traverse(node => { if (node instanceof THREE.Mesh && isSlipperMaterial(node.material)) slippers.push(node); });
      slippers.forEach(node => node.removeFromParent());
    }
    const wardrobe = copy.getObjectByName('Wardrobe_Nightstand');
    wardrobe?.removeFromParent();
    return { shell: copy, wardrobe };
  }, [scene, variant]);

  return <>
    <primitive object={cabin.shell} />
    {cabin.wardrobe && <ObjectHandle id="wardrobe" action="toggle" panorama world={world}
      hint={outfitHint(readOutfit(world.objects.wardrobe?.itemId))} acceptsHit={point => point.x <= WARDROBE_FOOTPRINT[1]}
      onClick={event => event.stopPropagation()}>
      <primitive object={cabin.wardrobe} />
    </ObjectHandle>}
  </>;
}

export function HabitatShell({ world, onFloorClick }: HabitatShellProps) {
  const variant = world.sceneId;
  const root = useRef<THREE.Group>(null);
  const floorPointer = useRef<number | null>(null);
  const fallback = <mesh name="Floor_Parquet" position={[CABIN_CENTER_X, -.12, 0]} receiveShadow>
    <boxGeometry args={[CABIN_RIGHT - CABIN_LEFT, .24, 6.45]} /><meshStandardMaterial color="#cb9c74" />
  </mesh>;
  const onFloor = (event: ThreeEvent<MouseEvent>) => {
    const startedOnFloor = floorPointer.current !== null;
    floorPointer.current = null;
    event.stopPropagation();
    if (!startedOnFloor || event.delta > 5 || !root.current || !isFloor(event.object)) return;
    const point = root.current.worldToLocal(event.point.clone());
    onFloorClick?.([point.x, 0, point.z]);
  };
  return <group ref={root} name={`${variant}-shell`}>
    <group onPointerDown={(event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      floorPointer.current = isFloor(event.object) ? event.pointerId : null;
    }} onPointerCancel={() => { floorPointer.current = null; }} onClick={onFloor}>
      <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><CabinModel world={world} /></Suspense></AssetBoundary>
    </group>
  </group>;
}

function isFloor(node: THREE.Object3D) {
  while (node.parent && node.name !== 'Floor_Parquet' && node.name !== 'Rugs') node = node.parent;
  return node.name === 'Floor_Parquet' || node.name === 'Rugs';
}
