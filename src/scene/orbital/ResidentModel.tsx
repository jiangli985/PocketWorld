import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { upholstery } from './Materials';

type RigRef = React.RefObject<THREE.Group>;
export interface ResidentRig {
  hips: RigRef; leftLeg: RigRef; rightLeg: RigRef; leftKnee: RigRef; rightKnee: RigRef;
  leftArm: RigRef; rightArm: RigRef; head: RigRef;
}
type Profile = [height: number, width: number, depth: number][];

function contour(profile: Profile, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([y, x, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 40;
  for (let row = 0; row <= rows; row++) {
    const point = curve.getPoint(row / rows);
    for (let col = 0; col <= segments; col++) {
      const theta = col / segments * Math.PI * 2;
      positions.push(Math.sin(theta) * point.x, point.y, Math.cos(theta) * point.z);
      uvs.push(col / segments, row / rows);
      if (row < rows && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function hairCap() {
  const geometry = new THREE.SphereGeometry(1, 48, 28);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const phi = Math.atan2(x, z);
    const polar = Math.acos(THREE.MathUtils.clamp(y, -1, 1));
    const front = Math.max(0, Math.cos(phi));
    const edge = 1.97 - front * 0.83 + Math.sin(phi * 2 + 0.6) * front * 0.09;
    const theta = polar / Math.PI * edge;
    positions.setXYZ(i, Math.sin(phi) * Math.sin(theta) * 0.12,
      0.018 + Math.cos(theta) * 0.144, Math.cos(phi) * Math.sin(theta) * 0.109 - 0.014);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function line(points: [number, number, number][], radius: number) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 20, radius, 6, false);
}

export function ResidentModel({ rig, sleeping, reducedMotion }: { rig: ResidentRig; sleeping: boolean; reducedMotion: boolean }) {
  const eyes = useRef<THREE.Group>(null);
  const time = useRef(0);
  const assets = useMemo(() => {
    const shapes = {
      sphere: new THREE.SphereGeometry(1, 24, 18),
      torso: contour([[0.035, 0, 0], [0.045, 0.128, 0.078], [0.08, 0.14, 0.085], [0.2, 0.133, 0.081], [0.35, 0.157, 0.087], [0.435, 0.17, 0.077], [0.475, 0.124, 0.065], [0.505, 0.056, 0.048], [0.51, 0, 0]]),
      hem: contour([[0.039, 0, 0], [0.043, 0.13, 0.08], [0.076, 0.139, 0.086], [0.082, 0, 0]]),
      pelvis: contour([[-0.085, 0, 0], [-0.07, 0.118, 0.077], [0.015, 0.137, 0.08], [0.058, 0.127, 0.077], [0.06, 0, 0]]),
      thigh: contour([[-0.312, 0, 0], [-0.295, 0.049, 0.049], [-0.23, 0.054, 0.056], [-0.12, 0.064, 0.064], [-0.035, 0.071, 0.069], [0.025, 0.054, 0.049], [0.035, 0, 0]]),
      shin: contour([[-0.26, 0, 0], [-0.247, 0.038, 0.037], [-0.19, 0.041, 0.044], [-0.1, 0.049, 0.053], [-0.025, 0.048, 0.048], [0.016, 0.038, 0.038], [0.025, 0, 0]]),
      sleeve: contour([[-0.353, 0, 0], [-0.342, 0.033, 0.034], [-0.29, 0.038, 0.038], [-0.18, 0.047, 0.046], [-0.07, 0.055, 0.054], [0.006, 0.052, 0.051], [0.043, 0, 0]]),
      cuff: contour([[-0.358, 0, 0], [-0.352, 0.034, 0.035], [-0.323, 0.035, 0.036], [-0.318, 0, 0]]),
      face: contour([[-0.132, 0, 0], [-0.123, 0.036, 0.05], [-0.097, 0.071, 0.07], [-0.05, 0.098, 0.084], [0.003, 0.11, 0.094], [0.067, 0.106, 0.091], [0.113, 0.082, 0.071], [0.14, 0, 0]], 48),
      hair: hairCap(),
      mouth: line([[-0.027, -0.084, 0.077], [-0.01, -0.088, 0.084], [0.009, -0.088, 0.084], [0.027, -0.082, 0.077]], 0.0019),
      collar: line([[-0.055, 0.494, 0.012], [-0.044, 0.486, 0.05], [0, 0.478, 0.062], [0.044, 0.486, 0.05], [0.055, 0.494, 0.012]], 0.009),
      pocket: line([[-0.09, 0.12, 0.071], [-0.068, 0.166, 0.076], [0, 0.175, 0.084], [0.068, 0.166, 0.076], [0.09, 0.12, 0.071]], 0.002),
      brow: line([[-0.021, 0, -0.002], [0, 0.005, 0.002], [0.021, 0, -0.002]], 0.003),
      eyelid: line([[-0.019, 0, -0.002], [0, 0.008, 0.002], [0.019, 0, -0.002]], 0.002),
      cord: line([[0, 0, 0], [-0.003, -0.044, 0.007], [0.003, -0.078, 0.008]], 0.0025),
      lace: line([[-0.027, 0, 0], [0, -0.002, 0.009], [0.027, 0, 0]], 0.002),
      hairSweep: line([[-0.08, 0.087, 0.06], [-0.06, 0.135, 0.064], [0.01, 0.146, 0.056], [0.075, 0.119, 0.05]], 0.009),
    };
    const materials = {
      skin: new THREE.MeshPhysicalMaterial({ color: '#ddb094', roughness: 0.63, metalness: 0, sheen: 0.12, sheenColor: new THREE.Color('#e4ad98'), sheenRoughness: 0.85 }),
      ear: new THREE.MeshStandardMaterial({ color: '#c58b78', roughness: 0.8 }),
      hair: new THREE.MeshStandardMaterial({ color: '#30221d', roughness: 0.86 }),
      hairLight: new THREE.MeshStandardMaterial({ color: '#392820', roughness: 0.88 }),
      eyes: new THREE.MeshPhysicalMaterial({ color: '#3a302b', roughness: 0.24, clearcoat: 0.3 }),
      white: new THREE.MeshStandardMaterial({ color: '#dcd5c9', roughness: 0.5 }),
      lips: new THREE.MeshStandardMaterial({ color: '#a96e60', roughness: 0.8 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#e6e0d2', roughness: 0.86 }),
      sole: new THREE.MeshStandardMaterial({ color: '#b28b60', roughness: 0.94 }),
    };
    return { shapes, materials };
  }, []);
  useEffect(() => () => {
    Object.values(assets.shapes).forEach(geometry => geometry.dispose());
    Object.values(assets.materials).forEach(material => material.dispose());
  }, [assets]);
  useFrame((_, delta) => {
    time.current += Math.min(delta, 0.05);
    const phase = time.current % 4.7;
    const blink = !reducedMotion && phase < 0.16 ? 1 - Math.sin(phase / 0.16 * Math.PI) * 0.94 : 1;
    if (eyes.current) eyes.current.scale.y = sleeping ? 0.08 : blink;
  });
  const { shapes: g, materials: m } = assets;
  const cloth = upholstery('#3b7a8c'), rib = upholstery('#326978'), denim = upholstery('#303d4d');
  const oval = (position: [number, number, number], scale: [number, number, number], material: THREE.Material, key?: string | number) =>
    <mesh key={key} geometry={g.sphere} material={material} position={position} scale={scale} castShadow dispose={null} />;
  return <group ref={rig.hips} position={[0, 0.61, 0]} name="ResidentBody">
    <mesh geometry={g.pelvis} material={denim} castShadow dispose={null} />
    {([[rig.leftLeg, rig.leftKnee, -0.077], [rig.rightLeg, rig.rightKnee, 0.077]] as const).map(([leg, knee, x]) => <group key={x} ref={leg} position={[x, -0.02, 0]}>
      <mesh geometry={g.thigh} material={denim} castShadow dispose={null} />
      <group ref={knee} position={[0, -0.28, 0]}>
        <mesh geometry={g.shin} material={denim} castShadow dispose={null} />
        {oval([0, -0.267, 0.025], [0.051, 0.035, 0.099], m.shoe)}
        {oval([0, -0.294, 0.025], [0.053, 0.015, 0.101], m.sole)}
        {oval([0, -0.277, 0.027], [0.053, 0.015, 0.1], m.shoe)}
        {[-0.008, 0.01, 0.028].map(z => <mesh key={z} geometry={g.lace} material={m.white} position={[0, -0.232, z + 0.025]} dispose={null} />)}
      </group>
    </group>)}
    <mesh geometry={g.torso} material={cloth} castShadow receiveShadow dispose={null} />
    <mesh geometry={g.hem} material={rib} castShadow dispose={null} />
    {oval([0, 0.465, -0.057], [0.092, 0.06, 0.063], rib)}
    {oval([0, 0.527, -0.005], [0.045, 0.065, 0.042], m.skin)}
    <mesh geometry={g.collar} material={rib} dispose={null} />
    <mesh geometry={g.pocket} material={rib} dispose={null} />
    {[-0.029, 0.029].map(x => <mesh key={x} geometry={g.cord} material={m.white} position={[x, 0.457, 0.069]} dispose={null} />)}
    {([[rig.leftArm, -1], [rig.rightArm, 1]] as const).map(([arm, side]) => <group key={side} ref={arm} position={[side * 0.17, 0.44, 0]} rotation={[0, 0, side * 0.065]}>
      <mesh geometry={g.sleeve} material={cloth} castShadow dispose={null} />
      <mesh geometry={g.cuff} material={rib} dispose={null} />
      <group position={[0, -0.375, 0.006]} rotation={[-0.12, 0, 0]}>
        {oval([0, 0, 0], [0.029, 0.039, 0.018], m.skin)}
        {[0, 1, 2, 3].map(i => oval([(i - 1.5) * 0.013, -0.034 + Math.abs(i - 1.5) * 0.005, 0.004], [0.0075, 0.023 - Math.abs(i - 1.5) * 0.003, 0.009], m.skin, i))}
        <group rotation={[0.2, 0, -side * 0.48]}>{oval([-side * 0.027, -0.005, 0.01], [0.012, 0.025, 0.012], m.skin)}</group>
      </group>
    </group>)}
    <group ref={rig.head} position={[0, 0.667, 0]} name="ResidentHead">
      <mesh geometry={g.face} material={m.skin} castShadow dispose={null} />
      {[-1, 1].map(side => <React.Fragment key={side}>
        {oval([side * 0.108, -0.017, -0.006], [0.02, 0.032, 0.022], m.skin)}
        {oval([side * 0.12, -0.017, 0.003], [0.006, 0.018, 0.012], m.ear)}
        <mesh geometry={g.brow} material={m.hair} position={[side * 0.043, 0.026, 0.088]} rotation={[0, side * 0.3, -side * 0.06]} dispose={null} />
      </React.Fragment>)}
      <group ref={eyes} position={[0, 0.002, 0]}>
        {[-1, 1].map(side => <group key={side} position={[side * 0.043, 0, 0.089]} rotation={[0, side * 0.3, 0]}>
          {oval([0, 0, 0], [0.019, 0.008, 0.006], m.white)}
          {oval([0, 0, 0.005], [0.007, 0.0075, 0.003], m.eyes)}
          {oval([-0.002, 0.003, 0.008], [0.0018, 0.0018, 0.001], m.white)}
          <mesh geometry={g.eyelid} material={m.ear} dispose={null} />
        </group>)}
      </group>
      {oval([0, -0.018, 0.091], [0.012, 0.032, 0.016], m.skin)}
      {oval([0, -0.039, 0.106], [0.019, 0.013, 0.019], m.skin)}
      {[-1, 1].map(side => oval([side * 0.012, -0.045, 0.103], [0.008, 0.004, 0.006], m.ear, side))}
      <mesh geometry={g.mouth} material={m.lips} dispose={null} />
      <mesh geometry={g.hair} material={m.hair} castShadow dispose={null} />
      <mesh geometry={g.hairSweep} material={m.hairLight} castShadow dispose={null} />
    </group>
  </group>;
}
