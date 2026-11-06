import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Html,
  OrbitControls,
  OrthographicCamera,
} from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import gsap from 'gsap';
import * as THREE from 'three';
import {
  CharacterPosture,
  InteractableId,
  MusicDisc,
  RoomLightingState,
} from '../types/interactable';
import {
  DEFAULT_ROOM_CAMERA_POSE,
  INTERACTABLE_MAP,
} from './interactables';
import { RoomArchitecture } from './models/RoomArchitecture';
import { RoomFurniture } from './models/RoomFurniture';
import { RoomDecor } from './models/RoomDecor';
import { PetCat } from './models/PetCat';
import { Protagonist } from './models/Protagonist';

export type RoomViewAction = 'rotate-left' | 'rotate-right' | 'zoom-in' | 'zoom-out' | 'reset';

export interface RoomViewCommand {
  action: RoomViewAction;
  nonce: number;
}

interface CameraRigProps {
  focusedId: InteractableId | null;
  viewCommand: RoomViewCommand | null;
}

const BASE_AZIMUTH = Math.PI / 4;
const AZIMUTH_RANGE = THREE.MathUtils.degToRad(43);
const MIN_ZOOM = 34;
const MAX_ZOOM = 190;
const TWEEN = { duration: 0.88, ease: 'power3.inOut' };

interface FreeView {
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom: number;
}

const CameraRig: React.FC<CameraRigProps> = ({ focusedId, viewCommand }) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const savedFreeViewRef = useRef<FreeView | null>(null);
  const wasFocusedRef = useRef(false);

  const animateTo = (position: THREE.Vector3, target: THREE.Vector3, zoom: number) => {
    const orthoCam = camera as THREE.OrthographicCamera;
    const controls = controlsRef.current;
    if (!controls) return;
    gsap.killTweensOf(orthoCam.position);
    gsap.killTweensOf(orthoCam);
    gsap.killTweensOf(controls.target);

    gsap.to(orthoCam.position, { x: position.x, y: position.y, z: position.z, ...TWEEN });
    gsap.to(controls.target, {
      x: target.x,
      y: target.y,
      z: target.z,
      ...TWEEN,
      onUpdate: () => controls.update(),
    });
    gsap.to(orthoCam, {
      zoom,
      ...TWEEN,
      onUpdate: () => orthoCam.updateProjectionMatrix(),
    });
  };

  useEffect(() => {
    const orthoCam = camera as THREE.OrthographicCamera;
    const controls = controlsRef.current;
    if (!controls) return;

    if (focusedId && INTERACTABLE_MAP[focusedId]) {
      if (!wasFocusedRef.current) {
        savedFreeViewRef.current = {
          position: orthoCam.position.clone(),
          target: controls.target.clone(),
          zoom: orthoCam.zoom,
        };
      }
      wasFocusedRef.current = true;
      const pose = INTERACTABLE_MAP[focusedId].focusCameraPose;
      animateTo(
        new THREE.Vector3(...pose.position),
        new THREE.Vector3(...pose.lookAt),
        pose.zoom ?? DEFAULT_ROOM_CAMERA_POSE.zoom
      );
      return;
    }

    if (!wasFocusedRef.current) return;
    wasFocusedRef.current = false;
    const saved = savedFreeViewRef.current;
    animateTo(
      saved?.position ?? new THREE.Vector3(...DEFAULT_ROOM_CAMERA_POSE.position),
      saved?.target ?? new THREE.Vector3(...DEFAULT_ROOM_CAMERA_POSE.lookAt),
      saved?.zoom ?? DEFAULT_ROOM_CAMERA_POSE.zoom
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, focusedId]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!viewCommand || !controls || focusedId) return;
    const orthoCam = camera as THREE.OrthographicCamera;

    if (viewCommand.action === 'reset') {
      animateTo(
        new THREE.Vector3(...DEFAULT_ROOM_CAMERA_POSE.position),
        new THREE.Vector3(...DEFAULT_ROOM_CAMERA_POSE.lookAt),
        DEFAULT_ROOM_CAMERA_POSE.zoom
      );
      return;
    }

    if (viewCommand.action === 'zoom-in' || viewCommand.action === 'zoom-out') {
      const factor = viewCommand.action === 'zoom-in' ? 1.25 : 0.8;
      animateTo(
        orthoCam.position.clone(),
        controls.target.clone(),
        THREE.MathUtils.clamp(orthoCam.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      );
      return;
    }

    const step = THREE.MathUtils.degToRad(viewCommand.action === 'rotate-left' ? -22 : 22);
    const offset = orthoCam.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta = THREE.MathUtils.clamp(
      spherical.theta + step,
      BASE_AZIMUTH - AZIMUTH_RANGE,
      BASE_AZIMUTH + AZIMUTH_RANGE
    );
    animateTo(
      new THREE.Vector3().setFromSpherical(spherical).add(controls.target),
      controls.target.clone(),
      orthoCam.zoom
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCommand]);

  const clampTarget = () => {
    const target = controlsRef.current?.target;
    if (!target) return;
    target.x = THREE.MathUtils.clamp(target.x, -3, 3);
    target.y = THREE.MathUtils.clamp(target.y, 0.3, 2.6);
    target.z = THREE.MathUtils.clamp(target.z, -3, 3);
  };

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={!focusedId}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      zoomToCursor
      screenSpacePanning
      target={DEFAULT_ROOM_CAMERA_POSE.lookAt}
      minAzimuthAngle={BASE_AZIMUTH - AZIMUTH_RANGE}
      maxAzimuthAngle={BASE_AZIMUTH + AZIMUTH_RANGE}
      minPolarAngle={THREE.MathUtils.degToRad(18)}
      maxPolarAngle={THREE.MathUtils.degToRad(72)}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      onChange={clampTarget}
    />
  );
};

interface DynamicLightsProps {
  lighting: RoomLightingState;
  isMusicPlaying: boolean;
}

const DynamicLights: React.FC<DynamicLightsProps> = ({
  lighting,
  isMusicPlaying,
}) => {
  const mainLightRef = useRef<THREE.DirectionalLight>(null);
  const windowLightRef = useRef<THREE.SpotLight>(null);
  const bedsideLightRef = useRef<THREE.PointLight>(null);
  const stringLightRef = useRef<THREE.PointLight>(null);
  const monitorLightRef = useRef<THREE.PointLight>(null);

  const isDay = lighting.timeOfDay === 'day';

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    if (mainLightRef.current) {
      const targetMain = lighting.mainLightOn ? (isDay ? 1.15 : 0.85) : 0.04;
      mainLightRef.current.intensity = THREE.MathUtils.lerp(
        mainLightRef.current.intensity,
        targetMain,
        delta * 6
      );
    }

    if (windowLightRef.current) {
      const targetWindow = isDay ? 2.4 : 0.95;
      windowLightRef.current.intensity = THREE.MathUtils.lerp(
        windowLightRef.current.intensity,
        targetWindow,
        delta * 5
      );
    }

    if (bedsideLightRef.current) {
      const targetBedside = lighting.bedsideLampOn ? 1.65 : 0;
      bedsideLightRef.current.intensity = THREE.MathUtils.lerp(
        bedsideLightRef.current.intensity,
        targetBedside,
        delta * 8
      );
    }

    if (stringLightRef.current) {
      const targetString = lighting.stringLightsOn
        ? 0.95 + Math.sin(t * 3.2) * 0.08
        : 0;
      stringLightRef.current.intensity = THREE.MathUtils.lerp(
        stringLightRef.current.intensity,
        targetString,
        delta * 8
      );
    }

    if (monitorLightRef.current) {
      const pulse = isMusicPlaying ? 0.55 + Math.sin(t * 7.5) * 0.18 : 0.42;
      monitorLightRef.current.intensity = pulse;
    }
  });

  const ambientIntensity =
    (lighting.mainLightOn ? 0.52 : 0.18) + (isDay ? 0.28 : 0.08);

  return (
    <>
      <ambientLight
        intensity={ambientIntensity}
        color={isDay ? '#f8e8dc' : '#8ea4d2'}
      />

      <hemisphereLight
        color={isDay ? '#fff3e0' : '#64748b'}
        groundColor="#3d2c35"
        intensity={lighting.mainLightOn ? 0.55 : 0.24}
      />

      {/* 房间主顶灯 */}
      <directionalLight
        ref={mainLightRef}
        position={[3.8, 7.6, 4.2]}
        intensity={lighting.mainLightOn ? 1.15 : 0.05}
        color="#fff1e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
        shadow-camera-left={-5.5}
        shadow-camera-right={5.5}
        shadow-camera-top={5.5}
        shadow-camera-bottom={-5.5}
        shadow-bias={-0.0005}
      />

      {/* 窗户斜射入室的暖阳/月光聚光灯 */}
      <spotLight
        ref={windowLightRef}
        position={[-2.1, 4.2, -5.2]}
        target-position={[0.6, 0, 0.8]}
        angle={0.62}
        penumbra={0.65}
        intensity={isDay ? 2.4 : 0.95}
        color={isDay ? '#fde68a' : '#60a5fa'}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
      />

      {/* 床头阅读暖灯点光源 */}
      <pointLight
        ref={bedsideLightRef}
        position={[-3.22, 1.24, -0.12]}
        intensity={lighting.bedsideLampOn ? 1.65 : 0}
        distance={5.2}
        decay={1.8}
        color="#fbbf24"
      />

      {/* 吊柜下方串灯暖光点光源 */}
      <pointLight
        ref={stringLightRef}
        position={[-3.25, 2.15, 1.55]}
        intensity={lighting.stringLightsOn ? 0.95 : 0}
        distance={4.6}
        decay={1.8}
        color="#fde047"
      />

      {/* 电脑屏幕与唱机微光点光源 */}
      <pointLight
        ref={monitorLightRef}
        position={[0.65, 1.58, -2.35]}
        intensity={0.45}
        distance={3.6}
        decay={2}
        color={isMusicPlaying ? '#f59e0b' : '#38bdf8'}
      />
    </>
  );
};

export interface RoomSceneProps {
  lighting: RoomLightingState;
  hoveredId: InteractableId | null;
  onHoverChange: (id: InteractableId | null) => void;
  focusedId: InteractableId | null;
  onInteract: (id: InteractableId) => void;
  posture: CharacterPosture;
  onPostureChange: (posture: CharacterPosture) => void;
  walkTarget: [number, number, number] | null;
  onWalkTargetChange: (target: [number, number, number] | null) => void;
  nearbyId: InteractableId | null;
  onNearbyChange: (id: InteractableId | null) => void;
  characterPos: [number, number, number];
  onCharacterPosChange: (pos: [number, number, number]) => void;
  statusBubble: string | null;
  isMusicPlaying: boolean;
  activeDisc: MusicDisc;
  chairAngle: number;
  pettedAt: number;
  plantWateredAt: number;
  trashTossedAt: number;
  viewCommand: RoomViewCommand | null;
}

const DRAG_CLICK_THRESHOLD = 6;

export const RoomScene: React.FC<RoomSceneProps> = ({
  lighting,
  hoveredId,
  onHoverChange,
  focusedId,
  onInteract,
  posture,
  onPostureChange,
  walkTarget,
  onWalkTargetChange,
  nearbyId,
  onNearbyChange,
  characterPos,
  onCharacterPosChange,
  statusBubble,
  isMusicPlaying,
  activeDisc,
  chairAngle,
  pettedAt,
  plantWateredAt,
  trashTossedAt,
  viewCommand,
}) => {
  const hoveredConfig = hoveredId ? INTERACTABLE_MAP[hoveredId] : null;
  const pointerDownRef = useRef<[number, number] | null>(null);
  const draggedRef = useRef(false);

  const handleSceneInteract = (id: InteractableId) => {
    if (!draggedRef.current) onInteract(id);
  };

  return (
    <div
      className="room-canvas-wrapper"
      onPointerDown={(e) => {
        pointerDownRef.current = [e.clientX, e.clientY];
        draggedRef.current = false;
      }}
      onPointerMove={(e) => {
        const start = pointerDownRef.current;
        if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > DRAG_CLICK_THRESHOLD) {
          draggedRef.current = true;
        }
      }}
      onPointerUp={() => {
        pointerDownRef.current = null;
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.06 }}
      >
        <OrthographicCamera
          makeDefault
          position={DEFAULT_ROOM_CAMERA_POSE.position}
          zoom={DEFAULT_ROOM_CAMERA_POSE.zoom}
          near={-20}
          far={60}
        />

        <CameraRig focusedId={focusedId} viewCommand={viewCommand} />
        <DynamicLights lighting={lighting} isMusicPlaying={isMusicPlaying} />

        {/* 等轴测房间主体组 */}
        <group position={[0, -0.35, 0]}>
          <RoomArchitecture
            lighting={lighting}
            hoveredId={hoveredId}
            onHoverChange={onHoverChange}
            onInteract={handleSceneInteract}
            onFloorClick={(pt) => {
              if (!focusedId && !draggedRef.current) {
                onWalkTargetChange(pt);
              }
            }}
          />

          <RoomFurniture
            lighting={lighting}
            hoveredId={hoveredId}
            onHoverChange={onHoverChange}
            onInteract={handleSceneInteract}
            isMusicPlaying={isMusicPlaying}
            activeDisc={activeDisc}
            chairAngle={chairAngle}
            plantWateredAt={plantWateredAt}
            trashTossedAt={trashTossedAt}
          />

          <RoomDecor lighting={lighting} />

          <PetCat
            hoveredId={hoveredId}
            onHoverChange={onHoverChange}
            onInteract={handleSceneInteract}
            pettedAt={pettedAt}
            characterPos={characterPos}
          />

          <Protagonist
            controlsEnabled={!focusedId}
            posture={posture}
            onPostureChange={onPostureChange}
            walkTarget={walkTarget}
            onClearWalkTarget={() => onWalkTargetChange(null)}
            nearbyId={nearbyId}
            onNearbyChange={onNearbyChange}
            onInteract={onInteract}
            onPositionUpdate={onCharacterPosChange}
            statusBubble={statusBubble}
          />

          {/* 地板点击移动目标点指示环 */}
          {walkTarget && !focusedId && (
            <mesh
              position={[walkTarget[0], 0.03, walkTarget[2]]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.12, 0.2, 24]} />
              <meshBasicMaterial color="#fbbf24" side={THREE.DoubleSide} />
            </mesh>
          )}

          {/* 鼠标悬停物品时的 3D 空间名称标签气泡 */}
          {hoveredConfig && hoveredConfig.anchorPosition && !focusedId && (
            <Html
              position={[
                hoveredConfig.anchorPosition[0],
                hoveredConfig.anchorPosition[1] + 0.58,
                hoveredConfig.anchorPosition[2],
              ]}
              center
              zIndexRange={[30, 0]}
            >
              <div className="scene-hover-badge">
                <span className="scene-hover-title">{hoveredConfig.label}</span>
                {hoveredConfig.hint && (
                  <span className="scene-hover-hint">{hoveredConfig.hint}</span>
                )}
              </div>
            </Html>
          )}

          <ContactShadows
            position={[0, -0.51, 0]}
            opacity={0.42}
            scale={15}
            blur={2.2}
            far={4}
          />
        </group>
      </Canvas>
    </div>
  );
};
