import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { planetVertex, earthFragment, cloudFragment, atmosphereFragment } from './shaders/cosmos';

/** Unit vector from the habitat / Earth toward the Sun; use for the scene key light. */
export const SUN_DIRECTION: [number, number, number] = [-0.534522, 0.801784, 0.267261];

const SPACE = `${import.meta.env.BASE_URL}textures/space/`;
const NO_RAYCAST = () => undefined;

function CelestialBodies() {
  const [stars, surface, clouds, ocean] = useLoader(THREE.TextureLoader, [
    `${SPACE}nasa-stars-4k.webp`, `${SPACE}earth-day-2k.webp`,
    `${SPACE}earth-clouds-1k.webp`, `${SPACE}earth-ocean-1k.webp`,
  ]);
  const uniforms = useMemo(() => {
    stars.colorSpace = surface.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [stars, surface, clouds, ocean]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    }
    return {
      uSun: { value: new THREE.Vector3(...SUN_DIRECTION).normalize() },
      uSurface: { value: surface }, uClouds: { value: clouds }, uOcean: { value: ocean },
    };
  }, [stars, surface, clouds, ocean]);
  return (
    <>
      <mesh rotation={[0.18, 1.1, -0.12]} renderOrder={-100} raycast={NO_RAYCAST} frustumCulled={false}>
        <sphereGeometry args={[1500, 64, 40]} />
        <meshBasicMaterial map={stars} color="#2b2d30" side={THREE.BackSide} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <group position={[-645, -285, -560]} rotation={[0.05, 2.05, 0.13]}>
        <mesh renderOrder={-90} raycast={NO_RAYCAST}>
          <sphereGeometry args={[82, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={earthFragment} />
        </mesh>
        <mesh renderOrder={-89} raycast={NO_RAYCAST}>
          <sphereGeometry args={[82.27, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={cloudFragment} transparent depthWrite={false} />
        </mesh>
        <mesh renderOrder={-88} raycast={NO_RAYCAST}>
          <sphereGeometry args={[82.8, 96, 64]} />
          <shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={atmosphereFragment} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

/** Mount once inside Canvas, outside SCENE_ORIGINS. Compatible with near=.1 / far=2000.
 * Copy only camera translation at draw time, after camera controls have run, retaining
 * celestial directions during rotations and removing room-scale stellar parallax.
 */
export const Cosmos: React.FC = () => {
  const distant = useRef<THREE.Group>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!distant.current) return;
    camera.getWorldPosition(worldPosition);
    distant.current.position.copy(worldPosition);
    distant.current.parent?.worldToLocal(distant.current.position);
  });
  return (
    <group ref={distant} name="cosmos">
      <mesh renderOrder={-101} raycast={NO_RAYCAST} frustumCulled={false}
        onBeforeRender={(_renderer, _scene, camera) => {
          if (!distant.current) return;
          camera.getWorldPosition(worldPosition);
          distant.current.position.copy(worldPosition);
          distant.current.parent?.worldToLocal(distant.current.position);
          distant.current.updateMatrixWorld(true);
        }}>
        <sphereGeometry args={[1600, 24, 16]} />
        <meshBasicMaterial color="#000000" side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      <Suspense fallback={null}><CelestialBodies /></Suspense>
    </group>
  );
};
