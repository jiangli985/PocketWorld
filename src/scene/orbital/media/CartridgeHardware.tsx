import React, { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { GameId } from '../../../types/game';
import { SoftBox } from '../Primitives';
import { AssetBoundary } from '../ReusableAsset';
import { CARTRIDGE_DOCK_ORIGIN, CARTRIDGE_HEIGHT, CARTRIDGE_STAND_ORIGIN } from './cartridge-motion';

const fallbackColors: Record<GameId, [string, string]> = {
  mario: ['#4ea2d4', '#ef8733'],
  shooter: ['#7b5db8', '#e6b956'],
};

function useClonedHardwareScene(path: string, pixelLabels = false) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/${path}`);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.material = materials.map(material => {
        const copy = material.clone() as THREE.MeshStandardMaterial;
        if (pixelLabels && copy.map && /Cover|Spine|Spec/i.test(copy.name)) {
          copy.map.magFilter = THREE.NearestFilter;
          copy.map.minFilter = THREE.LinearMipmapLinearFilter;
          copy.map.needsUpdate = true;
        }
        return copy;
      });
      if (object.material.length === 1) object.material = object.material[0];
    });
    return clone;
  }, [scene, pixelLabels]);

  useEffect(() => () => {
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  }, [model]);

  return model;
}

function LoadedCartridge({ game }: { game: GameId }) {
  const model = useClonedHardwareScene(`furniture/cartridge-${game}.glb`, true);
  return <primitive object={model} name={`CartridgeModel_${game}`} dispose={null} />;
}

function CartridgeFallback({ game }: { game: GameId }) {
  const [shell, accent] = fallbackColors[game];
  return <group>
    <SoftBox dims={[0.214, CARTRIDGE_HEIGHT, 0.042]} color={shell} radius={0.008} />
    <SoftBox dims={[0.17, 0.024, 0.045]} position={[-0.006, 0.112, 0]} color={accent} radius={0.005} />
    <SoftBox dims={[0.156, 0.132, 0.004]} position={[0, 0.014, 0.022]} color="#f4ead4" radius={0.002} />
  </group>;
}

export function GameCartridgeModel({ game }: { game: GameId }) {
  const fallback = <CartridgeFallback game={game} />;
  return <AssetBoundary fallback={fallback}>
    <Suspense fallback={fallback}>
      <LoadedCartridge game={game} />
    </Suspense>
  </AssetBoundary>;
}

function LoadedCartridgeStand() {
  const model = useClonedHardwareScene('furniture/cartridge-stand.glb');
  return <primitive object={model} name="CartridgeStand_Model" dispose={null} />;
}

function CartridgeStandFallback() {
  return <group name="CartridgeStand_Fallback">
    <SoftBox dims={[0.548, 0.044, 0.16]} position={[0, 0.024, 0]} color="#6f4326" radius={0.006} />
  </group>;
}

export function CartridgeStandModel() {
  const fallback = <CartridgeStandFallback />;
  return <group name="CartridgeDisplayStand" position={CARTRIDGE_STAND_ORIGIN}>
    <AssetBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedCartridgeStand />
      </Suspense>
    </AssetBoundary>
  </group>;
}

function LoadedCartridgeDock() {
  const model = useClonedHardwareScene('furniture/cartridge-dock.glb');
  return <primitive object={model} name="CartridgeDock_Model" dispose={null} />;
}

function CartridgeDockFallback() {
  return <group name="CartridgeDock_Fallback">
    <SoftBox dims={[0.656, 0.092, 0.228]} position={[0, 0.046, 0]} color="#dad2bc" radius={0.008} />
  </group>;
}

export function CartridgeDockModel({ active, paused, pickup, nearSlot }: { active: boolean; paused: boolean; pickup: boolean; nearSlot: boolean }) {
  const fallback = <CartridgeDockFallback />;
  const ledColor = nearSlot ? '#9cf2a1' : pickup ? '#f2c86b' : active ? (paused ? '#f0a642' : '#7ae89a') : '#4b5c55';
  const ledIntensity = nearSlot ? 1.4 : pickup ? 0.9 : active ? 1.1 : 0.18;
  return <group name="CartridgeExpansionDock" position={CARTRIDGE_DOCK_ORIGIN}>
    <AssetBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedCartridgeDock />
      </Suspense>
    </AssetBoundary>
    {/* Live glowing status LED seated inside Dock_LedBezel (local X = -0.105 + 0.135 = +0.030, Y = 0.044, Z = +0.118) */}
    <mesh position={[0.030, 0.044, 0.118]} name="Dock_StatusLED">
      <sphereGeometry args={[0.0068, 16, 12]} />
      <meshStandardMaterial color={ledColor} emissive={ledColor} emissiveIntensity={ledIntensity} roughness={0.22} />
    </mesh>
    {/* Subtle glowing throat guide rim while dragging a cartridge toward the slot */}
    {pickup && <mesh position={[-0.105, 0.097, 0]} rotation={[-Math.PI / 2, 0, 0]} name="Dock_SlotGuideGlow">
      <planeGeometry args={[0.236, 0.060]} />
      <meshStandardMaterial color={nearSlot ? '#9cf2a1' : '#e8bf66'} emissive={nearSlot ? '#9cf2a1' : '#e8bf66'} emissiveIntensity={nearSlot ? 0.85 : 0.45} transparent opacity={0.45} />
    </mesh>}
  </group>;
}

/** Machined satin-brass & walnut-tip pause toggle lever seated inside Dock_SwitchBushing. */
export function PauseToggleLever({ paused }: { paused: boolean }) {
  return <group name="PauseToggleLever" rotation={[paused ? -0.38 : 0.38, 0, 0]}>
    <mesh position={[0, 0.022, 0]} castShadow>
      <cylinderGeometry args={[0.0068, 0.0056, 0.046, 16]} />
      <meshStandardMaterial color="#d9b264" metalness={0.88} roughness={0.28} />
    </mesh>
    <mesh position={[0, 0.050, 0]} castShadow>
      <sphereGeometry args={[0.0145, 20, 14]} />
      <meshStandardMaterial color={paused ? '#d6824b' : '#74482a'} roughness={0.42} metalness={0.08} />
    </mesh>
  </group>;
}
