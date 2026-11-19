import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { WALK_BOUNDS } from './cabinLayout';
import { createSlipperPair, stepSlippers, type SlipperRect } from './slipperMotion';
import { extractSlipperModel, SLIPPER_MODEL_URL } from './slipperModel';

interface SlipperPairProps {
  resident: React.RefObject<THREE.Group>;
  room: { boxes: SlipperRect[] };
  reducedMotion: boolean;
}

export function SlipperPair({ resident, room, reducedMotion }: SlipperPairProps) {
  const { scene } = useGLTF(SLIPPER_MODEL_URL);
  const model = useMemo(() => extractSlipperModel(scene), [scene]);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const bodies = useRef(createSlipperPair([[0, 0], [0, 0]]));
  const ready = useRef(false);
  const last = useRef<{ x: number; z: number } | null>(null);

  useFrame((_, rawDelta) => {
    const groups = [left.current, right.current];
    const root = resident.current;
    if (!model || !groups[0] || !groups[1] || !root) return;
    if (!ready.current) {
      ready.current = true;
      bodies.current = createSlipperPair([model.left.center, model.right.center], [model.left.radius, model.right.radius]);
    }
    const dt = Math.min(Math.max(rawDelta, 0), 0.04);
    const previous = last.current;
    last.current = { x: root.position.x, z: root.position.z };
    const posture = root.userData.posture ?? 'standing';
    stepSlippers(bodies.current, dt, {
      x: root.position.x,
      z: root.position.z,
      vx: previous && dt > 0 ? (root.position.x - previous.x) / dt : 0,
      vz: previous && dt > 0 ? (root.position.z - previous.z) / dt : 0,
      active: posture === 'standing' || posture === 'standing-up',
    }, room.boxes, WALK_BOUNDS, reducedMotion);
    bodies.current.forEach((body, index) => {
      groups[index]!.position.set(body.x, 0, body.z);
      groups[index]!.rotation.y = body.yaw;
    });
  });

  if (!model) return null;
  return <>
    {[model.left, model.right].map((side, index) => <group key={index} ref={index ? right : left}
      name={index ? 'Slipper_Right' : 'Slipper_Left'} position={[side.center[0], 0, side.center[1]]}>
      {side.parts.map((part, partIndex) => <mesh key={partIndex} geometry={part.geometry} material={part.material} castShadow receiveShadow />)}
    </group>)}
  </>;
}
