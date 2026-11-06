import React, { useEffect, useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { timber } from './Materials';

const boxes = new Map<string, THREE.BufferGeometry>();
const surfaces = new Map<string, THREE.MeshStandardMaterial>();
export function surface(color: string, roughness = 0.65, metalness = 0) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!surfaces.has(key)) surfaces.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return surfaces.get(key)!;
}
type SoftBoxProps = Omit<ThreeElements['mesh'], 'args' | 'color'> & {
  dims: [number, number, number]; radius?: number; color?: string; roughness?: number; metalness?: number;
};
export function SoftBox({ dims, radius = 0.025, color = '#d9cbb4', roughness = 0.65, metalness = 0, material, ...props }: SoftBoxProps) {
  const key = `${dims.join('/')}/${radius}`;
  if (!boxes.has(key)) boxes.set(key, new RoundedBoxGeometry(...dims, 2, Math.max(0.0001, Math.min(radius, ...dims.map(d => d * 0.45)))));
  return <mesh castShadow receiveShadow {...props} geometry={boxes.get(key)} material={material ?? (color === '#b27c4e' || color === '#75503a' ? timber(color) : surface(color, roughness, metalness))} dispose={null} />;
}
export function Tube({ points, radius = 0.015, color = '#726452', ...props }: Omit<ThreeElements['mesh'], 'args' | 'color'> & { points: [number, number, number][]; radius?: number; color?: string }) {
  const shape = JSON.stringify(points);
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3((JSON.parse(shape) as [number, number, number][]).map(p => new THREE.Vector3(...p))), 24, radius, 6, false), [shape, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh {...props} geometry={geometry} material={surface(color)} castShadow dispose={null} />;
}
