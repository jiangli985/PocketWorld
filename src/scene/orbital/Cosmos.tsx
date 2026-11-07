import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  skyVertex, skyFragment, starVertex, starFragment, meteorVertex, meteorFragment,
  planetVertex, earthFragment, cloudFragment, atmosphereFragment,
} from './shaders/cosmos';

/** Unit vector from the habitat / Earth toward the Sun; use for the scene key light. */
export const SUN_DIRECTION: [number, number, number] = [-0.534522, 0.801784, 0.267261];

const GALACTIC_POLE = new THREE.Vector3(0.32, 0.88, -0.35).normalize();
const STAR_COUNT = 7000;
const STAR_RADIUS = 1400;
const METEOR_COUNT = 3;
const METEOR_RADIUS = 1200;
const NO_RAYCAST = () => undefined;
const STAR_COLORS = ['#9db4ff', '#cad7ff', '#f8f7ff', '#fff4e8', '#ffe2b8', '#ffc58f'].map(hex => new THREE.Color(hex));

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
    const brightness = 0.25 + 0.55 * random() + magnitude * 1.4;
    colors.set([color.r * brightness, color.g * brightness, color.b * brightness], i * 3);
    sizes[i] = 1.1 + magnitude * 5.5;
    twinkles.set([random() * Math.PI * 2, 0.4 + random() * 2.6], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 2));
  return geometry;
}

function createMeteorGeometry() {
  const meteors = new Float32Array(METEOR_COUNT * 4);
  const corners = new Float32Array(METEOR_COUNT * 8);
  const indices: number[] = [];
  for (let i = 0; i < METEOR_COUNT; i++) {
    meteors.fill(i, i * 4, i * 4 + 4);
    corners.set([-1, 0, 1, 0, -1, 1, 1, 1], i * 8);
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(METEOR_COUNT * 12), 3));
  geometry.setAttribute('aMeteor', new THREE.BufferAttribute(meteors, 1));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geometry.setIndex(indices);
  return geometry;
}

interface CosmicClock { value: number }

function Meteors({ enabled }: { enabled: boolean }) {
  const geometry = useMemo(createMeteorGeometry, []);
  const uniforms = useMemo(() => ({
    uHead: { value: Array.from({ length: METEOR_COUNT }, () => new THREE.Vector3()) },
    uTail: { value: Array.from({ length: METEOR_COUNT }, () => new THREE.Vector3()) },
    uAlpha: { value: new Array<number>(METEOR_COUNT).fill(0) },
    uResolution: { value: new THREE.Vector2(1, 1) },
  }), []);
  const meteors = useMemo(() => Array.from({ length: METEOR_COUNT }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), age: 0, life: 0 })), []);
  const basis = useMemo(() => ({ forward: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }), []);
  const nextSpawn = useRef(2);
  useFrame(({ camera, gl }, delta) => {
    gl.getDrawingBufferSize(uniforms.uResolution.value);
    nextSpawn.current -= delta;
    const idle = meteors.find(meteor => meteor.age >= meteor.life);
    if (enabled && idle && nextSpawn.current <= 0) {
      const { forward, right, up } = basis;
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();
      up.crossVectors(right, forward);
      idle.from.copy(forward).addScaledVector(right, (Math.random() - 0.5) * 0.9).addScaledVector(up, 0.08 + Math.random() * 0.32).normalize();
      const heading = -0.5 - Math.random() * 2.1;
      idle.to.copy(idle.from).addScaledVector(right, Math.cos(heading) * (0.14 + Math.random() * 0.14))
        .addScaledVector(up, Math.sin(heading) * (0.14 + Math.random() * 0.14)).normalize();
      idle.age = 0;
      idle.life = 0.7 + Math.random() * 0.6;
      nextSpawn.current = 2.5 + Math.random() * 6;
    }
    meteors.forEach((meteor, i) => {
      if (meteor.age >= meteor.life) { uniforms.uAlpha.value[i] = 0; return; }
      meteor.age += delta;
      const progress = Math.min(meteor.age / meteor.life, 1);
      uniforms.uHead.value[i].lerpVectors(meteor.from, meteor.to, progress).setLength(METEOR_RADIUS);
      uniforms.uTail.value[i].lerpVectors(meteor.from, meteor.to, Math.max(0, progress - 0.32)).setLength(METEOR_RADIUS);
      uniforms.uAlpha.value[i] = Math.sin(Math.PI * progress);
    });
  });
  return (
    <mesh geometry={geometry} renderOrder={-95} raycast={NO_RAYCAST} frustumCulled={false}>
      <shaderMaterial uniforms={uniforms} vertexShader={meteorVertex} fragmentShader={meteorFragment} defines={{ METEOR_COUNT }}
        transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function CelestialSphere({ clock, onBeforeRender }: { clock: CosmicClock; onBeforeRender: THREE.Object3D['onBeforeRender'] }) {
  const sphere = useRef<THREE.Group>(null);
  const dpr = useThree(state => state.viewport.dpr);
  const starGeometry = useMemo(createStarGeometry, []);
  const sun = useMemo(() => new THREE.Vector3(...SUN_DIRECTION).normalize(), []);
  const skyUniforms = useMemo(() => ({ uTime: clock, uSun: { value: sun }, uGalacticPole: { value: GALACTIC_POLE } }), [clock, sun]);
  const starUniforms = useMemo(() => ({ uTime: clock, uPixelRatio: { value: dpr } }), [clock]);
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

function Earth({ clock }: { clock: CosmicClock }) {
  const spin = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uTime: clock, uSun: { value: new THREE.Vector3(...SUN_DIRECTION).normalize() } }), [clock]);
  useFrame(() => { if (spin.current) spin.current.rotation.y = clock.value * 0.008; });
  return (
    <group position={[-645, -285, -560]} rotation={[0.05, 2.05, 0.13]}>
      <group ref={spin}>
        <mesh renderOrder={-90} raycast={NO_RAYCAST}>
          <sphereGeometry args={[82, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={earthFragment} />
        </mesh>
        <mesh renderOrder={-89} raycast={NO_RAYCAST}>
          <sphereGeometry args={[82.27, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={cloudFragment} transparent depthWrite={false} />
        </mesh>
      </group>
      <mesh renderOrder={-88} raycast={NO_RAYCAST}>
        <sphereGeometry args={[82.8, 96, 64]} />
        <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={atmosphereFragment} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Mount once inside Canvas, outside SCENE_ORIGINS. Compatible with near=.1 / far=2000.
 * Copy only camera translation at draw time, after camera controls have run, retaining
 * celestial directions during rotations and removing room-scale stellar parallax.
 */
export const Cosmos: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const distant = useRef<THREE.Group>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const clock = useMemo<CosmicClock>(() => ({ value: 0 }), []);
  const follow = (camera: THREE.Camera) => {
    if (!distant.current) return;
    camera.getWorldPosition(worldPosition);
    distant.current.position.copy(worldPosition);
    distant.current.parent?.worldToLocal(distant.current.position);
  };
  useFrame(({ camera }, delta) => {
    if (!reducedMotion) clock.value += Math.min(delta, 0.1);
    follow(camera);
  });
  return (
    <group ref={distant} name="cosmos">
      <CelestialSphere clock={clock} onBeforeRender={(_renderer, _scene, camera) => { follow(camera); distant.current?.updateMatrixWorld(true); }} />
      <Meteors enabled={!reducedMotion} />
      <Earth clock={clock} />
    </group>
  );
};
