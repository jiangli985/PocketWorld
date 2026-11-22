import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { surface } from './Primitives';
import { createPillowGeometry } from '../geometry';
import { timber, upholstery } from './Materials';

export const FURNITURE = {
  wood: '#73503c', edge: '#624231', cream: '#f3eee4', ink: '#333d46',
  brass: '#d8b872', cloth: '#e59aa7', paper: '#f5f0e6', dark: '#2e363c',
};
export type FurnitureVector = [number, number, number];

export function FurnitureMotion({ children, axis = 'y', target, mode = 'rotation', reducedMotion = false, ...props }: Omit<ThreeElements['group'], 'ref'> & {
  axis?: 'x' | 'y' | 'z'; target: number; mode?: 'rotation' | 'position'; reducedMotion?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    const transform = group.current[mode];
    transform[axis] = reducedMotion ? target : THREE.MathUtils.damp(transform[axis], target, 8, Math.min(dt, 0.05));
  });
  return <group {...props} ref={group}>{children}</group>;
}

export function FurnitureCylinder({ radius, height, color = FURNITURE.ink, topRadius = radius, metalness = 0, ...props }: Omit<ThreeElements['mesh'], 'args' | 'color'> & {
  radius: number; topRadius?: number; height: number; color?: string; metalness?: number;
}) {
  return <mesh {...props} castShadow receiveShadow material={color === FURNITURE.wood || color === FURNITURE.edge ? timber(color) : surface(color, metalness ? 0.35 : 0.7, metalness)}>
    <cylinderGeometry args={[topRadius, radius, height, 32]} />
  </mesh>;
}

export function FurnitureOrb({ scale, color = FURNITURE.cloth, ...props }: Omit<ThreeElements['mesh'], 'args' | 'color'> & { color?: string }) {
  return <mesh {...props} scale={scale} castShadow receiveShadow material={surface(color, 0.88)}><sphereGeometry args={[1, 24, 16]} /></mesh>;
}

export function FurnitureCushion({ dims, color, ...props }: Omit<ThreeElements['mesh'], 'args' | 'color'> & { dims: [number, number, number]; color: string }) {
  const [width, thickness, depth] = dims;
  const geometry = useMemo(() => createPillowGeometry(width, thickness, depth), [width, thickness, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh {...props} geometry={geometry} material={upholstery(color)} castShadow receiveShadow dispose={null} />;
}
