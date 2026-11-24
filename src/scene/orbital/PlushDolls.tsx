import React, { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PLUSH_DOLLS, UPPER_DECK_OFFSET, deckFromAuthoredX, type PlushDollPlacement } from './cabinLayout';
import { UpperDeckVisibility } from './CabinUpperDeck';
import { AssetBoundary } from './ReusableAsset';
import { isValidPlushBody, plushFloorY, plushSupportHeight, type PlushBody } from './plushMotion';
import { ObjectHandle } from './ObjectHandle';
import type { WorldModelProps } from '../../types/world';
import { plushLabels, type PlushGrip } from './plushCarry';

interface PlushDollItemProps {
  grip: React.RefObject<PlushGrip | null>;
  world: WorldModelProps;
  doll: PlushDollPlacement;
  index: number;
  bodies: React.MutableRefObject<PlushBody[]>;
}

function LoadedPlushDoll({ doll, index, bodies, grip, world }: PlushDollItemProps) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/${doll.path}`);
  const group = useRef<THREE.Group>(null);

  const upperVisible = useContext(UpperDeckVisibility);
  const hand = useMemo(() => new THREE.Vector3(), []);
  const prepared = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.material = materials.map(material => {
        const copy = material.clone() as THREE.MeshStandardMaterial;
        if (copy.isMeshStandardMaterial) copy.roughness = Math.max(copy.roughness, 0.55);
        return copy;
      });
      if (object.material.length === 1) object.material = object.material[0];
    });
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = doll.height / size.y;
    clone.scale.setScalar(scale);
    // Center all three axes at the mesh volume center so wobble and toppling pivot cleanly.
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return {
      model: clone,
      halfWidth: size.x * scale * 0.5,
      halfHeight: size.y * scale * 0.5,
      halfDepth: size.z * scale * 0.5,
    };
  }, [gltf.scene, doll.height]);

  useEffect(() => () => {
    prepared.model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
  }, [prepared]);

  useFrame(() => {
    const root = group.current;
    const body = bodies.current[index];
    if (!root || !isValidPlushBody(body)) return;
    const held = grip.current?.body === body ? grip.current : null;
    const x = held?.floorX ?? body.x, z = held?.floorZ ?? body.z;
    const upper = deckFromAuthoredX(x) === 'upper';
    const weight = held?.handWeight ?? 0;
    const support = plushSupportHeight(body.roll, body.pitch, prepared.halfWidth, prepared.halfHeight, prepared.halfDepth);
    root.position.set(x + (upper ? UPPER_DECK_OFFSET[0] : 0),
      plushFloorY(x, z) + support + body.y + (upper ? UPPER_DECK_OFFSET[1] : 0), z);
    if (held && weight) root.position.lerp(root.parent!.worldToLocal(hand.copy(held.center)), weight);
    root.visible = held ? held.visible : !upper || upperVisible;
    const turn = held ? Math.atan2(Math.sin(held.yaw - body.yaw), Math.cos(held.yaw - body.yaw)) : 0;
    root.rotation.set(body.pitch * (1 - weight), body.yaw + turn * weight, body.roll * (1 - weight), 'YXZ');

  });

  return <group ref={group} name={doll.name}
    position={[doll.position[0], plushFloorY(doll.position[0], doll.position[2]) + prepared.halfHeight, doll.position[2]]}
    rotation={[0, doll.yaw, 0]} dispose={null}>
    <ObjectHandle id={doll.id} action="inspect" hint={`拿起或放下${plushLabels[doll.id]}`} panorama world={world}
      acceptsHit={() => !!group.current?.visible} onClick={event => event.stopPropagation()}>
      <primitive object={prepared.model} />
    </ObjectHandle>
  </group>;
}

export function PlushDolls(props: Omit<PlushDollItemProps, 'doll' | 'index'>) {
  return <>{PLUSH_DOLLS.map((doll, index) => <AssetBoundary key={doll.id}>
    <Suspense fallback={null}><LoadedPlushDoll {...props} doll={doll} index={index} /></Suspense>
  </AssetBoundary>)}</>;
}
