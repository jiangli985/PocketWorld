import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  skyVertex, skyFragment, starVertex, starFragment, particleVertex, particleFragment,
  planetVertex, earthFragment, cloudFragment, atmosphereFragment,
} from './shaders/cosmos';
import {
  BASE_SUN_DIRECTION, SUN_CYCLE_SECONDS, createSunOrbit, readSunOverrides, roomLightDirection, sampleSun, startPhase,
} from './sunCycle';

/**
 * Shared, mutable Sun state. `Cosmos` writes it once per frame; the sky, Earth and the
 * room key light read it, so all three always agree on where the Sun is.
 */
export interface SunState {
  /** Unit vector from the habitat toward the Sun (world space). */
  direction: THREE.Vector3;
  /** Key-light direction for the room: same azimuth, never from below the floor. */
  light: THREE.Vector3;
  /** 0 inside Earth's shadow, 1 in full sunlight. */
  daylight: { value: number };
  /** 1 while the Sun grazes Earth's limb, 0 far from it. */
  warmth: number;
}

export function createSunState(): SunState {
  const direction = new THREE.Vector3(...BASE_SUN_DIRECTION).normalize();
  return { direction, light: direction.clone(), daylight: { value: 1 }, warmth: 0 };
}

const GALACTIC_POLE = new THREE.Vector3(0.32, 0.88, -0.35).normalize();
const STAR_COUNT = 9000;
const STAR_RADIUS = 1400;
const DRIFT_COUNT = 160;
const EARTH_POSITION: [number, number, number] = [-623, -277, -588];
const EARTH_NARROW_POSITION: [number, number, number] = [-606, -259, -613];
const EARTH_RADIUS = 115;
const EARTH_NARROW_SCALE = 0.72;
const NO_RAYCAST = () => undefined;
const STAR_COLORS = ['#8fb0ff', '#b9ccff', '#dfe9ff', '#f8f7ff', '#fff4e8', '#ffd9b0'].map(hex => new THREE.Color(hex));
const DRIFT_COLORS = ['#7fd4ff', '#a8e4ff', '#e6f4ff', '#9fb8ff'].map(hex => new THREE.Color(hex));

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createStarGeometry() {
  const random = seededRandom(20261106);
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const twinkles = new Float32Array(STAR_COUNT * 2);
  const tangent = new THREE.Vector3().crossVectors(GALACTIC_POLE, new THREE.Vector3(0, 0, 1)).normalize();
  const bitangent = new THREE.Vector3().crossVectors(GALACTIC_POLE, tangent);
  const direction = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    if (random() < 0.45) {
      const angle = random() * Math.PI * 2;
      const gaussian = Math.sqrt(-2 * Math.log(random() + 1e-6)) * Math.cos(Math.PI * 2 * random());
      direction.copy(tangent).multiplyScalar(Math.cos(angle)).addScaledVector(bitangent, Math.sin(angle)).addScaledVector(GALACTIC_POLE, gaussian * 0.12);
    } else {
      direction.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
      if (direction.lengthSq() < 1e-4) direction.set(0, 1, 0);
    }
    direction.setLength(STAR_RADIUS).toArray(positions, i * 3);
    const magnitude = Math.pow(random(), 7);
    const color = STAR_COLORS[Math.floor(random() * STAR_COLORS.length)];
    const brightness = 0.22 + 0.5 * random() + magnitude * 1.3;
    colors.set([color.r * brightness, color.g * brightness, color.b * brightness], i * 3);
    sizes[i] = 0.9 + magnitude * 4.6;
    twinkles.set([random() * Math.PI * 2, 0.4 + random() * 2.6], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 2));
  return geometry;
}

function createDriftGeometry() {
  const random = seededRandom(20261112);
  const positions = new Float32Array(DRIFT_COUNT * 3);
  const colors = new Float32Array(DRIFT_COUNT * 3);
  const sizes = new Float32Array(DRIFT_COUNT);
  const seeds = new Float32Array(DRIFT_COUNT * 3);
  const point = new THREE.Vector3();
  let i = 0;
  while (i < DRIFT_COUNT) {
    point.set(-14 + random() * 42, 0.6 + random() * 9.4, -14 + random() * 28);
    const nearFloor = point.y < 4.5 && Math.abs(point.z) < 6 && (Math.abs(point.x) < 6 || Math.abs(point.x - 14) < 6);
    if (nearFloor) continue;
    point.toArray(positions, i * 3);
    const color = DRIFT_COLORS[Math.floor(random() * DRIFT_COLORS.length)];
    const brightness = 0.5 + random() * 0.6;
    colors.set([color.r * brightness, color.g * brightness, color.b * brightness], i * 3);
    sizes[i] = 1.6 + random() * 2.6;
    seeds.set([random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2], i * 3);
    i++;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  return geometry;
}

interface CosmicClock { value: number }

function Drift({ clock }: { clock: CosmicClock }) {
  const geometry = useMemo(createDriftGeometry, []);
  const dpr = useThree(state => state.viewport.dpr);
  const uniforms = useMemo(() => ({ uTime: clock, uPixelRatio: { value: dpr } }), [clock]);
  useEffect(() => { uniforms.uPixelRatio.value = dpr; }, [dpr, uniforms]);
  return (
    <points geometry={geometry} raycast={NO_RAYCAST} frustumCulled={false}>
      <shaderMaterial uniforms={uniforms} vertexShader={particleVertex} fragmentShader={particleFragment}
        transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

function CelestialSphere({ clock, sun, onBeforeRender }: { clock: CosmicClock; sun: SunState; onBeforeRender: THREE.Object3D['onBeforeRender'] }) {
  const sphere = useRef<THREE.Group>(null);
  const dpr = useThree(state => state.viewport.dpr);
  const narrow = useThree(state => state.size.width < 720);
  const starGeometry = useMemo(createStarGeometry, []);
  const earthGlow = useMemo(() => new THREE.Vector3(...(narrow ? EARTH_NARROW_POSITION : EARTH_POSITION)).normalize(), [narrow]);
  const skyUniforms = useMemo(() => ({
    uTime: clock, uSun: { value: sun.direction }, uDaylight: sun.daylight, uGalacticPole: { value: GALACTIC_POLE }, uEarthGlow: { value: earthGlow },
  }), [clock, sun, earthGlow]);
  const starUniforms = useMemo(() => ({ uTime: clock, uPixelRatio: { value: dpr }, uDaylight: sun.daylight }), [clock, sun]);
  useEffect(() => { starUniforms.uPixelRatio.value = dpr; }, [dpr, starUniforms]);
  useFrame(() => { sphere.current?.quaternion.setFromAxisAngle(GALACTIC_POLE, clock.value * 0.0025); });
  return (
    <group ref={sphere}>
      <mesh renderOrder={-101} raycast={NO_RAYCAST} frustumCulled={false} onBeforeRender={onBeforeRender}>
        <sphereGeometry args={[1600, 64, 32]} />
        <shaderMaterial uniforms={skyUniforms} vertexShader={skyVertex} fragmentShader={skyFragment} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <points geometry={starGeometry} renderOrder={-100} raycast={NO_RAYCAST} frustumCulled={false}>
        <shaderMaterial uniforms={starUniforms} vertexShader={starVertex} fragmentShader={starFragment}
          transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}

function Earth({ clock, sun }: { clock: CosmicClock; sun: SunState }) {
  const spin = useRef<THREE.Group>(null);
  const narrow = useThree(state => state.size.width < 720);
  const radius = narrow ? EARTH_RADIUS * EARTH_NARROW_SCALE : EARTH_RADIUS;
  const uniforms = useMemo(() => ({ uTime: clock, uSun: { value: sun.direction } }), [clock, sun]);
  useFrame(() => { if (spin.current) spin.current.rotation.y = clock.value * 0.008; });
  return (
    <group position={narrow ? EARTH_NARROW_POSITION : EARTH_POSITION} rotation={[0.05, 2.05, 0.13]}>
      <group ref={spin}>
        <mesh renderOrder={-90} raycast={NO_RAYCAST}>
          <sphereGeometry args={[radius, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={earthFragment} />
        </mesh>
        <mesh renderOrder={-89} raycast={NO_RAYCAST}>
          <sphereGeometry args={[radius * 1.0037, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={cloudFragment} transparent depthWrite={false} />
        </mesh>
      </group>
      <mesh renderOrder={-88} raycast={NO_RAYCAST}>
        <sphereGeometry args={[radius * 1.0107, 96, 64]} />
        <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={atmosphereFragment}
          transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Mount once inside Canvas, outside SCENE_ORIGINS. Compatible with near=.1 / far=2000.
 * Copy only camera translation at draw time, after camera controls have run, retaining
 * celestial directions during rotations and removing room-scale stellar parallax.
 *
 * Also advances the compressed orbital day and writes it into `sun` (see sunCycle.ts).
 * Reduced motion keeps the Sun at its starting position unless `?sun=` pins a phase.
 */
export const Cosmos: React.FC<{ reducedMotion: boolean; sun: SunState }> = ({ reducedMotion, sun }) => {
  const distant = useRef<THREE.Group>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const clock = useMemo<CosmicClock>(() => ({ value: 0 }), []);
  const narrow = useThree(state => state.size.width < 720);
  const orbit = useMemo(() => narrow
    ? createSunOrbit(EARTH_NARROW_POSITION, EARTH_RADIUS * EARTH_NARROW_SCALE)
    : createSunOrbit(EARTH_POSITION, EARTH_RADIUS), [narrow]);
  const overrides = useMemo(() => readSunOverrides(window.location.search), []);
  const phase = useRef<number | null>(null);
  const follow = (camera: THREE.Camera) => {
    if (!distant.current) return;
    camera.getWorldPosition(worldPosition);
    distant.current.position.copy(worldPosition);
    distant.current.parent?.worldToLocal(distant.current.position);
  };
  useFrame(({ camera }, delta) => {
    const step = Math.min(delta, 0.1);
    if (!reducedMotion) clock.value += step;
    if (phase.current === null) phase.current = overrides.phase ?? startPhase(orbit);
    else if (!reducedMotion && overrides.phase === null) phase.current = (phase.current + step * overrides.speed / SUN_CYCLE_SECONDS) % 1;
    const sample = sampleSun(orbit, phase.current);
    sun.direction.set(...sample.direction);
    sun.light.set(...roomLightDirection(sample.direction));
    sun.daylight.value = sample.daylight;
    sun.warmth = sample.warmth;
    follow(camera);
  });
  return (
    <>
      <group ref={distant} name="cosmos">
        <CelestialSphere clock={clock} sun={sun} onBeforeRender={(_renderer, _scene, camera) => { follow(camera); distant.current?.updateMatrixWorld(true); }} />
        <Earth clock={clock} sun={sun} />
      </group>
      <Drift clock={clock} />
    </>
  );
};
