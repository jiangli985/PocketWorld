import React, { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { InteractableId, RoomLightingState } from '../../types/interactable';
import {
  createArtPrintTexture,
  createSunbeamGradientTexture,
  createWallStuccoTexture,
  createWoodFloorTexture,
  createWovenRugTexture,
} from '../textures';
import { createArchShape, normalizePlanarUV } from '../geometry';

const WINDOW_CENTER_X = -1.5;
const WINDOW_SILL_Y = 1.15;
const WINDOW_SPRING_Y = 2.9;
const WINDOW_HALF_WIDTH = 0.75;
const WINDOW_LOCAL_Y = 2.4;
const WALL_BEVEL = { bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 };

function createArchedWindowWallGeometry() {
  const wall = new THREE.Shape();
  wall.moveTo(-4.15, 0);
  wall.lineTo(4.12, 0);
  wall.lineTo(4.12, 4.6);
  wall.lineTo(-4.15, 4.6);
  wall.lineTo(-4.15, 0);
  wall.holes.push(
    createArchShape(WINDOW_HALF_WIDTH, WINDOW_SILL_Y, WINDOW_SPRING_Y, WINDOW_CENTER_X, new THREE.Path()) as THREE.Path
  );
  return normalizePlanarUV(new THREE.ExtrudeGeometry(wall, { depth: 0.26, curveSegments: 32, ...WALL_BEVEL }));
}

function createWindowFrameGeometry() {
  const springY = WINDOW_SPRING_Y - WINDOW_LOCAL_Y;
  const outer = createArchShape(0.8, WINDOW_SILL_Y - WINDOW_LOCAL_Y - 0.03, springY) as THREE.Shape;
  outer.holes.push(createArchShape(0.66, WINDOW_SILL_Y - WINDOW_LOCAL_Y + 0.08, springY, 0, new THREE.Path()) as THREE.Path);
  return new THREE.ExtrudeGeometry(outer, {
    depth: 0.14,
    curveSegments: 32,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 3,
  });
}

interface RoomArchitectureProps {
  lighting: RoomLightingState;
  hoveredId: InteractableId | null;
  onHoverChange: (id: InteractableId | null) => void;
  onInteract: (id: InteractableId) => void;
  onFloorClick?: (point: [number, number, number]) => void;
}

export const RoomArchitecture: React.FC<RoomArchitectureProps> = ({
  lighting,
  hoveredId,
  onHoverChange,
  onInteract,
  onFloorClick,
}) => {
  const woodFloorTex = useMemo(() => createWoodFloorTexture(), []);
  const rugTex = useMemo(() => createWovenRugTexture(), []);
  const wallTex = useMemo(() => createWallStuccoTexture(), []);
  const sunbeamTex = useMemo(() => createSunbeamGradientTexture(), []);
  const artTex0 = useMemo(() => createArtPrintTexture(0), []);
  const artTex1 = useMemo(() => createArtPrintTexture(1), []);
  const artTex2 = useMemo(() => createArtPrintTexture(2), []);
  const backWallGeometry = useMemo(createArchedWindowWallGeometry, []);
  const windowFrameGeometry = useMemo(createWindowFrameGeometry, []);
  const windowGlassGeometry = useMemo(
    () => new THREE.ShapeGeometry(createArchShape(0.67, WINDOW_SILL_Y - WINDOW_LOCAL_Y + 0.07, WINDOW_SPRING_Y - WINDOW_LOCAL_Y) as THREE.Shape, 32),
    []
  );

  const isDay = lighting.timeOfDay === 'day';
  const wallEmissiveIntensity = lighting.mainLightOn ? (isDay ? 0.28 : 0.16) : 0.06;
  const windowHovered = hoveredId === 'window';
  const switchHovered = hoveredId === 'light-switch';
  const artHovered = hoveredId === 'wall-art';

  return (
    <group name="Room_Architecture">
      {/* ==================== 1. 地板与剖面基座 ==================== */}
      {/* 剖面深色木质底层 */}
      <RoundedBox args={[8.32, 0.5, 8.32]} radius={0.12} smoothness={4} position={[0, -0.27, 0]} receiveShadow>
        <meshStandardMaterial color="#3d2c35" roughness={0.82} metalness={0.05} />
      </RoundedBox>

      {/* 剖面浅木包边条（还原参考图地板边缘双层切面细节） */}
      <RoundedBox args={[8.16, 0.14, 0.14]} radius={0.05} smoothness={3} position={[0.06, -0.08, 4.1]} receiveShadow>
        <meshStandardMaterial color="#b38358" roughness={0.65} />
      </RoundedBox>
      <RoundedBox args={[0.14, 0.14, 8.16]} radius={0.05} smoothness={3} position={[4.1, -0.08, 0.06]} receiveShadow>
        <meshStandardMaterial color="#9e7047" roughness={0.65} />
      </RoundedBox>

      {/* 写实橡木拼接地板顶面（支持点击地板引导主角移动） */}
      <mesh
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          if (onFloorClick) {
            onFloorClick([
              THREE.MathUtils.clamp(e.point.x, -3.4, 3.5),
              0,
              THREE.MathUtils.clamp(e.point.z, -3.4, 3.5),
            ]);
          }
        }}
      >
        <boxGeometry args={[8.0, 0.04, 8.0]} />
        <meshStandardMaterial
          map={woodFloorTex}
          roughness={0.44}
          metalness={0.06}
        />
      </mesh>

      {/* ==================== 2. 左后墙体与剖面顶沿 ==================== */}
      <group name="Left_Back_Wall">
        {/* 左后墙主体 (x = -4.0) */}
        <RoundedBox args={[0.26, 4.6, 8.28]} radius={0.03} smoothness={2} position={[-4.02, 2.3, -0.02]} receiveShadow castShadow>
          <meshStandardMaterial
            map={wallTex}
            color="#bfa5b2"
            roughness={0.82}
            emissive="#8d7280"
            emissiveIntensity={wallEmissiveIntensity}
          />
        </RoundedBox>

        {/* 左后墙剖面浅色封边（顶部与前侧切面） */}
        <mesh position={[-4.02, 4.62, -0.02]}>
          <boxGeometry args={[0.28, 0.07, 8.3]} />
          <meshStandardMaterial color="#d7c0c8" roughness={0.65} />
        </mesh>
        <mesh position={[-4.02, 2.3, 4.13]}>
          <boxGeometry args={[0.28, 4.66, 0.07]} />
          <meshStandardMaterial color="#cbb2bc" roughness={0.65} />
        </mesh>

        {/* 左后墙原木踢脚线 */}
        <RoundedBox args={[0.07, 0.22, 8.0]} radius={0.025} smoothness={3} position={[-3.86, 0.11, 0]} receiveShadow>
          <meshStandardMaterial color="#7c563c" roughness={0.6} />
        </RoundedBox>
        <mesh position={[-3.86, 3.92, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 8.0, 16]} />
          <meshStandardMaterial color="#d9c6cd" roughness={0.6} />
        </mesh>
      </group>

      {/* ==================== 3. 右后墙体（拱形窗洞） ==================== */}
      <group name="Right_Back_Wall">
        {/* 整面墙体挤出成型，窗洞为拱形 */}
        <mesh geometry={backWallGeometry} position={[0, 0, -4.15]} receiveShadow castShadow>
          <meshStandardMaterial
            map={wallTex}
            color="#b298a5"
            roughness={0.82}
            emissive="#806774"
            emissiveIntensity={wallEmissiveIntensity}
          />
        </mesh>

        {/* 右后墙剖面浅色封边 */}
        <mesh position={[-0.02, 4.62, -4.02]}>
          <boxGeometry args={[8.3, 0.07, 0.28]} />
          <meshStandardMaterial color="#d7c0c8" roughness={0.65} />
        </mesh>
        <mesh position={[4.13, 2.3, -4.02]}>
          <boxGeometry args={[0.07, 4.66, 0.28]} />
          <meshStandardMaterial color="#bfa6b0" roughness={0.65} />
        </mesh>

        {/* 右后墙原木踢脚线 */}
        <RoundedBox args={[8.0, 0.22, 0.07]} radius={0.025} smoothness={3} position={[0, 0.11, -3.86]} receiveShadow>
          <meshStandardMaterial color="#734f36" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 3.92, -3.86]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 8.0, 16]} />
          <meshStandardMaterial color="#d2bec6" roughness={0.6} />
        </mesh>
      </group>

      {/* ==================== 4. 格栅采光窗与体积光束 (Interactable_Window) ==================== */}
      <group
        name="Interactable_Window"
        position={[-1.5, 2.4, -3.96]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('window');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('window');
        }}
      >
        {/* 窗外天空背景发光板 */}
        <mesh position={[0, 0, -0.14]}>
          <planeGeometry args={[1.46, 2.46]} />
          <meshBasicMaterial color={isDay ? '#fef3c7' : '#172554'} />
        </mesh>

        {/* 夜间月亮或日间暖阳 */}
        <mesh position={[0.28, 0.55, -0.12]}>
          <circleGeometry args={[0.24, 32]} />
          <meshBasicMaterial color={isDay ? '#fffbeb' : '#fde047'} />
        </mesh>

        {/* 拱形木质窗框 */}
        <mesh geometry={windowFrameGeometry} position={[0, 0, -0.07]} castShadow>
          <meshStandardMaterial
            color={windowHovered ? '#f3e5d0' : '#dfd1be'}
            roughness={0.5}
            emissive={windowHovered ? '#38bdf8' : '#000000'}
            emissiveIntensity={windowHovered ? 0.22 : 0}
          />
        </mesh>

        {/* 拱形玻璃 */}
        <mesh geometry={windowGlassGeometry} position={[0, 0, 0.0]}>
          <meshPhysicalMaterial
            color={isDay ? '#fef9c3' : '#3b82f6'}
            transparent
            opacity={isDay ? 0.5 : 0.42}
            roughness={0.08}
            emissive={isDay ? '#fde68a' : '#60a5fa'}
            emissiveIntensity={isDay ? 0.55 : 0.28}
            depthWrite={false}
          />
        </mesh>

        {/* 窗棂：竖棂、拱脚横棂与扇形放射棂 */}
        <mesh position={[0, -0.02, 0.03]} castShadow>
          <boxGeometry args={[0.05, 2.3, 0.05]} />
          <meshStandardMaterial color="#cbb89d" roughness={0.55} />
        </mesh>
        {[WINDOW_SPRING_Y - WINDOW_LOCAL_Y, -0.36].map((y) => (
          <mesh key={y} position={[0, y, 0.03]} castShadow>
            <boxGeometry args={[1.34, 0.05, 0.05]} />
            <meshStandardMaterial color="#cbb89d" roughness={0.55} />
          </mesh>
        ))}
        {[Math.PI / 4, (Math.PI * 3) / 4].map((angle) => (
          <mesh
            key={angle}
            position={[Math.cos(angle) * 0.34, WINDOW_SPRING_Y - WINDOW_LOCAL_Y + Math.sin(angle) * 0.34, 0.03]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.68, 0.04, 0.04]} />
            <meshStandardMaterial color="#cbb89d" roughness={0.55} />
          </mesh>
        ))}
        <mesh position={[0, WINDOW_SPRING_Y - WINDOW_LOCAL_Y, 0.03]}>
          <torusGeometry args={[0.2, 0.022, 10, 32, Math.PI]} />
          <meshStandardMaterial color="#cbb89d" roughness={0.55} />
        </mesh>

        {/* 突出木质内窗台 */}
        <RoundedBox
          args={[1.68, 0.09, 0.32]}
          radius={0.02}
          smoothness={3}
          position={[0, -1.26, 0.08]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#c7b299" roughness={0.5} />
        </RoundedBox>
      </group>

      {/* 斜射入室的暖阳/月光体积光束 (Volumetric God Rays) —— 还原参考图窗户斜射光雾 */}
      <group position={[-1.55, 2.25, -3.76]}>
        <mesh
          position={[-0.35, -0.82, 1.25]}
          rotation={[-0.65, 0.35, 0.28]}
          renderOrder={2}
        >
          <planeGeometry args={[1.85, 3.6]} />
          <meshBasicMaterial
            map={sunbeamTex}
            color={isDay ? '#fde68a' : '#7dd3fc'}
            transparent
            opacity={isDay ? 0.28 : 0.14}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh
          position={[-0.18, -0.88, 1.38]}
          rotation={[-0.58, -0.25, 0.18]}
          renderOrder={2}
        >
          <planeGeometry args={[1.55, 3.5]} />
          <meshBasicMaterial
            map={sunbeamTex}
            color={isDay ? '#fffbeb' : '#93c5fd'}
            transparent
            opacity={isDay ? 0.22 : 0.1}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* 墙角斜射阳光高光投影贴片 */}
      <mesh
        position={[-2.32, 2.25, -3.86]}
        rotation={[0, 0, 0.28]}
        renderOrder={1}
      >
        <planeGeometry args={[0.85, 2.1]} />
        <meshBasicMaterial
          color={isDay ? '#fef08a' : '#60a5fa'}
          transparent
          opacity={isDay ? 0.22 : 0.08}
          depthWrite={false}
        />
      </mesh>

      {/* ==================== 5. 墙面电源插座与主灯开关 (Interactable_LightSwitch) ==================== */}
      {/* 左墙前侧插座（连接串灯垂落电线，还原参考图左下角细节） */}
      <group position={[-3.87, 0.68, 3.38]}>
        <RoundedBox args={[0.04, 0.22, 0.16]} radius={0.01} smoothness={2}>
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </RoundedBox>
        {/* 黑色电源插头 */}
        <RoundedBox args={[0.07, 0.09, 0.08]} radius={0.015} smoothness={2} position={[0.03, 0.02, 0]}>
          <meshStandardMaterial color="#1e293b" roughness={0.5} />
        </RoundedBox>
      </group>

      {/* 墙壁主灯开关 (Interactable_LightSwitch) */}
      <group
        name="Interactable_LightSwitch"
        position={[-3.87, 1.56, 3.48]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('light-switch');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('light-switch');
        }}
      >
        <RoundedBox args={[0.05, 0.28, 0.24]} radius={0.015} smoothness={3} castShadow>
          <meshStandardMaterial
            color={switchHovered ? '#fef3c7' : '#f1f5f9'}
            roughness={0.35}
            emissive={switchHovered ? '#fbbf24' : '#000000'}
            emissiveIntensity={switchHovered ? 0.35 : 0}
          />
        </RoundedBox>
        {/* 翘板开关按键 */}
        <mesh
          position={[0.03, 0, 0]}
          rotation={[0, 0, lighting.mainLightOn ? 0.18 : -0.18]}
        >
          <boxGeometry args={[0.04, 0.14, 0.1]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.3} />
        </mesh>
        {/* 状态荧光指示点 */}
        <mesh position={[0.042, 0.08, 0]}>
          <sphereGeometry args={[0.016, 12, 12]} />
          <meshBasicMaterial color={lighting.mainLightOn ? '#34d399' : '#f59e0b'} />
        </mesh>
      </group>

      {/* ==================== 6. 床边椭圆编织地毯 ==================== */}
      <group position={[0.05, 0.024, 1.88]}>
        <mesh scale={[1.2, 1, 1.5]} receiveShadow>
          <cylinderGeometry args={[1, 1, 0.03, 72]} />
          <meshStandardMaterial map={rugTex} roughness={0.92} metalness={0.02} />
        </mesh>
        {/* 编织包边 */}
        <mesh scale={[1.2, 1.5, 1]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <torusGeometry args={[1, 0.022, 8, 96]} />
          <meshStandardMaterial color="#d8cde0" roughness={0.9} />
        </mesh>
      </group>

      {/* ==================== 7. 右后墙三幅装饰挂画组 (Interactable_WallArt) ==================== */}
      <group
        name="Interactable_WallArt"
        position={[2.12, 2.36, -3.86]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('wall-art');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('wall-art');
        }}
      >
        {/* 左上挂画 */}
        <group position={[-0.28, 0.32, 0]}>
          <RoundedBox args={[0.48, 0.48, 0.05]} radius={0.015} smoothness={2} castShadow>
            <meshStandardMaterial
              color="#d4a373"
              roughness={0.5}
              emissive={artHovered ? '#f472b6' : '#000000'}
              emissiveIntensity={artHovered ? 0.25 : 0}
            />
          </RoundedBox>
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[0.4, 0.4]} />
            <meshStandardMaterial map={artTex0} roughness={0.65} />
          </mesh>
        </group>

        {/* 左下挂画 */}
        <group position={[-0.28, -0.26, 0]}>
          <RoundedBox args={[0.48, 0.48, 0.05]} radius={0.015} smoothness={2} castShadow>
            <meshStandardMaterial
              color="#d4a373"
              roughness={0.5}
              emissive={artHovered ? '#f472b6' : '#000000'}
              emissiveIntensity={artHovered ? 0.25 : 0}
            />
          </RoundedBox>
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[0.4, 0.4]} />
            <meshStandardMaterial map={artTex1} roughness={0.65} />
          </mesh>
        </group>

        {/* 右侧错落挂画（还原参考图三幅画不对称排布） */}
        <group position={[0.28, 0.02, 0]}>
          <RoundedBox args={[0.5, 0.5, 0.05]} radius={0.015} smoothness={2} castShadow>
            <meshStandardMaterial
              color="#d4a373"
              roughness={0.5}
              emissive={artHovered ? '#f472b6' : '#000000'}
              emissiveIntensity={artHovered ? 0.25 : 0}
            />
          </RoundedBox>
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[0.42, 0.42]} />
            <meshStandardMaterial map={artTex2} roughness={0.65} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
