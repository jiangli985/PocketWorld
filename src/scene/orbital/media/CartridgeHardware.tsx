import React, { Suspense, useEffect, useMemo } from 'react';
import { useSceneGLTF as useGLTF } from '../useSceneGLTF';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import tavernMark from '../../../../assets/games/ski/tavern-mark.webp';
import type { GameId } from '../../../types/game';
import { SoftBox } from '../Primitives';
import { AssetBoundary } from '../ReusableAsset';
import { CARTRIDGE_DOCK_ORIGIN, CARTRIDGE_HEIGHT, CARTRIDGE_STAND_ORIGIN } from './cartridge-motion';

const fallbackColors: Record<GameId, [string, string]> = {
  mario: ['#4ea2d4', '#ef8733'],
  shooter: ['#7b5db8', '#e6b956'],
};

function useClonedHardwareScene(path: string, pixelLabels = false, castShadow = true) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/${path}`);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    clone.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      if (castShadow) {
        box.setFromObject(object);
        box.getSize(size);
        object.castShadow = Math.max(size.x, size.y, size.z) >= 0.06;
      } else {
        object.castShadow = false;
      }
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
  }, [scene, pixelLabels, castShadow]);
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

// Apply the new artwork to the existing cover, spine and rear label surfaces.
function TideLabels() {
  const mark = useLoader(THREE.TextureLoader, tavernMark);
  const labels = useMemo(() => {
    const createLabel = (width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#d8ac68';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#19383d';
      context.fillRect(2, 2, width - 4, height - 4);
      context.textAlign = 'center';
      paint(context);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      return texture;
    };
    return [
      createLabel(128, 108, context => {
        context.fillStyle = '#274e50';
        context.fillRect(6, 6, 116, 72);
        context.drawImage(mark.image, 28, 4, 72, 72);
        context.fillStyle = '#ffe2a6';
        context.font = 'bold 15px "Microsoft YaHei", sans-serif';
        context.fillText('潮汐小馆', 64, 94);
        context.fillRect(11, 88, 12, 2);
        context.fillRect(105, 88, 12, 2);
      }),
      createLabel(128, 24, context => {
        context.fillStyle = '#ffd897';
        context.font = 'bold 13px monospace';
        context.fillText('01 TIDE', 64, 17);
      }),
      createLabel(128, 80, context => {
        context.fillStyle = '#ffd897';
        context.font = 'bold 10px monospace';
        context.fillText('POCKET WORLD', 64, 22);
        context.fillText('CART-01 TIDE', 64, 43);
        context.fillRect(28, 56, 72, 2);
      }),
    ] as const;
  }, [mark]);
  useEffect(() => () => labels.forEach(texture => texture.dispose()), [labels]);
  return <group name="TideCartridgeLabels">
    <mesh position={[0, 0.014, 0.0243]}>
      <planeGeometry args={[0.156, 0.132]} />
      <meshBasicMaterial map={labels[0]} toneMapped={false} />
    </mesh>
    <mesh position={[-0.007, 0.1268, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.144, 0.030]} />
      <meshBasicMaterial map={labels[1]} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0.016, -0.0233]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[0.128, 0.080]} />
      <meshBasicMaterial map={labels[2]} toneMapped={false} />
    </mesh>
  </group>;
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
  return <group>
    <AssetBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedCartridge game={game} />
      </Suspense>
    </AssetBoundary>
    {game === 'mario' && <Suspense fallback={null}><TideLabels /></Suspense>}
  </group>;
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
