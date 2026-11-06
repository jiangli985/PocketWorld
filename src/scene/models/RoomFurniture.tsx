import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import {
  InteractableId,
  MusicDisc,
  RoomLightingState,
} from '../../types/interactable';
import { createMonitorScreenTexture } from '../textures';
import { createPillowGeometry, createQuiltGeometry } from '../geometry';

interface RoomFurnitureProps {
  lighting: RoomLightingState;
  hoveredId: InteractableId | null;
  onHoverChange: (id: InteractableId | null) => void;
  onInteract: (id: InteractableId) => void;
  isMusicPlaying: boolean;
  activeDisc: MusicDisc;
  chairAngle: number;
  plantWateredAt: number;
  trashTossedAt: number;
}

export const RoomFurniture: React.FC<RoomFurnitureProps> = ({
  lighting,
  hoveredId,
  onHoverChange,
  onInteract,
  isMusicPlaying,
  activeDisc,
  chairAngle,
  plantWateredAt,
  trashTossedAt,
}) => {
  const monitorScreenTex = useMemo(() => createMonitorScreenTexture(), []);

  const discSpinRef = useRef<THREE.Group>(null);
  const tonearmRef = useRef<THREE.Group>(null);
  const notesGroupRef = useRef<THREE.Group>(null);
  const chairSwivelRef = useRef<THREE.Group>(null);
  const plantLeavesRef = useRef<THREE.Group>(null);
  const steamGroupRef = useRef<THREE.Group>(null);
  const tossedPaperRef = useRef<THREE.Mesh>(null);

  // 串灯灯泡空间坐标（沿吊柜下方自然悬垂并延伸至左下角插座）
  const bulbPositions = useMemo<[number, number, number][]>(
    () => [
      [-3.16, 2.34, 0.42],
      [-3.16, 2.22, 0.68],
      [-3.16, 2.16, 0.94],
      [-3.16, 2.24, 1.2],
      [-3.16, 2.34, 1.46],
      [-3.16, 2.22, 1.72],
      [-3.16, 2.15, 1.98],
      [-3.16, 2.23, 2.24],
      [-3.16, 2.33, 2.52],
      [-3.38, 2.12, 2.78],
      [-3.62, 1.84, 3.0],
      [-3.76, 1.54, 3.16],
      [-3.82, 1.18, 3.28],
    ],
    []
  );

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    // 1. 唱片/光盘旋转与唱臂角度插值
    if (discSpinRef.current && isMusicPlaying) {
      discSpinRef.current.rotation.y -= delta * 2.6;
    }
    if (tonearmRef.current) {
      const targetArmRot = isMusicPlaying ? 0.36 : 0.02;
      tonearmRef.current.rotation.y = THREE.MathUtils.lerp(
        tonearmRef.current.rotation.y,
        targetArmRot,
        delta * 6
      );
    }

    // 2. 音乐播放时浮动音符动画
    if (notesGroupRef.current) {
      notesGroupRef.current.visible = isMusicPlaying;
      if (isMusicPlaying) {
        notesGroupRef.current.children.forEach((child, idx) => {
          const phase = (t * 0.9 + idx * 0.33) % 1;
          child.position.y = 0.25 + phase * 0.95;
          child.position.x = Math.sin(t * 2.4 + idx * 2) * 0.16;
          child.position.z = Math.cos(t * 2.0 + idx) * 0.12;
          const s = Math.sin(phase * Math.PI) * 0.9;
          child.scale.setScalar(Math.max(0.001, s));
        });
      }
    }

    // 3. 转椅平滑旋转
    if (chairSwivelRef.current) {
      chairSwivelRef.current.rotation.y = THREE.MathUtils.lerp(
        chairSwivelRef.current.rotation.y,
        chairAngle,
        delta * 7
      );
    }

    // 4. 绿植叶片微风摆动 + 浇水反馈弹性摆动
    if (plantLeavesRef.current) {
      const sinceWater = (performance.now() - plantWateredAt) / 1000;
      const waterBoost = sinceWater < 1.8 ? Math.exp(-sinceWater * 2) * 6 : 1;
      plantLeavesRef.current.rotation.z = Math.sin(t * 1.8 * waterBoost) * 0.035 * waterBoost;
      plantLeavesRef.current.rotation.x = Math.cos(t * 1.4 * waterBoost) * 0.025 * waterBoost;
    }

    // 5. 咖啡杯热气袅袅上升
    if (steamGroupRef.current) {
      steamGroupRef.current.children.forEach((wisp, idx) => {
        const p = (t * 0.65 + idx * 0.5) % 1;
        wisp.position.y = 0.08 + p * 0.26;
        wisp.position.x = Math.sin(t * 2 + idx) * 0.025;
        const scale = Math.sin(p * Math.PI) * 0.85;
        wisp.scale.setScalar(Math.max(0.01, scale));
      });
    }

    // 6. 废纸篓投掷纸团抛物线动画
    if (tossedPaperRef.current) {
      const elapsed = (performance.now() - trashTossedAt) / 1000;
      if (trashTossedAt > 0 && elapsed < 0.75) {
        const p = elapsed / 0.75;
        tossedPaperRef.current.visible = true;
        tossedPaperRef.current.position.set(
          -0.65 * (1 - p),
          0.55 + Math.sin(p * Math.PI) * 0.65 - p * 0.25,
          -0.25 * (1 - p)
        );
        tossedPaperRef.current.rotation.x += delta * 9;
        tossedPaperRef.current.rotation.z += delta * 7;
      } else {
        tossedPaperRef.current.visible = false;
      }
    }
  });

  const bedHovered = hoveredId === 'bed';
  const quiltGeometry = useMemo(() => createQuiltGeometry(2.18, 2.02, 0.22, 0.06), []);
  const pillowGeometry = useMemo(() => createPillowGeometry(0.7, 0.28, 1.22), []);
  const cushionGeometry = useMemo(() => createPillowGeometry(0.42, 0.16, 0.5), []);
  const stringHovered = hoveredId === 'string-lights';
  const lampHovered = hoveredId === 'bedside-lamp';
  const bookcaseHovered = hoveredId === 'bookcase';
  const computerHovered = hoveredId === 'computer';
  const musicHovered = hoveredId === 'music-player';
  const chairHovered = hoveredId === 'chair';
  const trashHovered = hoveredId === 'trash-bin';
  const plantHovered = hoveredId === 'plant';

  return (
    <group name="Room_Furniture">
      {/* ==================== 1. 原木单人床铺 (Interactable_Bed) ==================== */}
      <group
        name="Interactable_Bed"
        position={[-2.12, 0, 1.82]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('bed');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('bed');
        }}
      >
        {/* 实木床头板（靠左后墙 x = -3.72） */}
        <RoundedBox
          args={[0.22, 1.62, 2.26]}
          radius={0.04}
          smoothness={3}
          position={[-1.62, 0.81, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#a46c56"
            roughness={0.55}
            emissive={bedHovered ? '#f472b6' : '#000000'}
            emissiveIntensity={bedHovered ? 0.16 : 0}
          />
        </RoundedBox>
        {/* 床头内嵌装饰木框线 */}
        <RoundedBox
          args={[0.06, 0.92, 1.88]}
          radius={0.02}
          smoothness={2}
          position={[-1.51, 0.96, 0]}
          castShadow
        >
          <meshStandardMaterial color="#8d5945" roughness={0.6} />
        </RoundedBox>

        {/* 实木床架底座 */}
        <RoundedBox
          args={[3.32, 0.36, 2.22]}
          radius={0.03}
          smoothness={3}
          position={[0.04, 0.28, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#9c6550" roughness={0.58} />
        </RoundedBox>

        {/* 床尾双立柱与横梁（还原参考图床尾立柱造型） */}
        <RoundedBox
          args={[0.24, 0.82, 0.24]}
          radius={0.03}
          smoothness={3}
          position={[1.64, 0.41, 1.02]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#ab725c" roughness={0.52} />
        </RoundedBox>
        <RoundedBox
          args={[0.24, 0.82, 0.24]}
          radius={0.03}
          smoothness={3}
          position={[1.64, 0.41, -1.02]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#ab725c" roughness={0.52} />
        </RoundedBox>
        <RoundedBox
          args={[0.18, 0.42, 2.12]}
          radius={0.025}
          smoothness={3}
          position={[1.64, 0.34, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#98614c" roughness={0.56} />
        </RoundedBox>
        {/* 床头两侧立柱 */}
        <RoundedBox
          args={[0.24, 1.66, 0.24]}
          radius={0.03}
          smoothness={3}
          position={[-1.62, 0.83, 1.04]}
          castShadow
        >
          <meshStandardMaterial color="#ab725c" roughness={0.52} />
        </RoundedBox>
        <RoundedBox
          args={[0.24, 1.66, 0.24]}
          radius={0.03}
          smoothness={3}
          position={[-1.62, 0.83, -1.04]}
          castShadow
        >
          <meshStandardMaterial color="#ab725c" roughness={0.52} />
        </RoundedBox>

        {/* 暖米色床垫 */}
        <RoundedBox
          args={[3.08, 0.34, 1.98]}
          radius={0.09}
          smoothness={4}
          position={[0.02, 0.56, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#efe3c8" roughness={0.82} />
        </RoundedBox>

        {/* 饱满羽绒枕头与靠垫 */}
        <mesh
          geometry={pillowGeometry}
          position={[-1.08, 0.86, 0]}
          rotation={[0, 0, -0.16]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#fbf4df" roughness={0.78} />
        </mesh>
        <mesh
          geometry={cushionGeometry}
          position={[-0.8, 0.88, 0.3]}
          rotation={[0.2, 0.35, -0.42]}
          castShadow
        >
          <meshStandardMaterial color="#c4b5d8" roughness={0.85} />
        </mesh>

        {/* 紫灰绒面羽绒被：两侧自然垂坠 */}
        <mesh geometry={quiltGeometry} position={[0.47, 0.75, 0]} castShadow receiveShadow>
          <meshStandardMaterial
            color="#75657d"
            roughness={0.88}
            side={THREE.DoubleSide}
            emissive={bedHovered ? '#c084fc' : '#000000'}
            emissiveIntensity={bedHovered ? 0.14 : 0}
          />
        </mesh>

        {/* 被头翻折卷边 */}
        <mesh position={[-0.6, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.075, 1.92, 6, 16]} />
          <meshStandardMaterial color="#8b7a94" roughness={0.86} />
        </mesh>
      </group>

      {/* ==================== 2. 墙面蓝灰储物吊柜与暖光串灯 (Interactable_StringLights) ==================== */}
      <group position={[-3.52, 2.86, 1.54]}>
        {/* 吊柜外框主体 */}
        <RoundedBox
          args={[0.64, 0.96, 2.38]}
          radius={0.03}
          smoothness={3}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#516878" roughness={0.52} metalness={0.08} />
        </RoundedBox>

        {/* 左侧双柜门 (z > 0) */}
        <RoundedBox
          args={[0.06, 0.82, 0.72]}
          radius={0.015}
          smoothness={2}
          position={[0.32, 0, 0.76]}
          castShadow
        >
          <meshStandardMaterial color="#60798a" roughness={0.48} />
        </RoundedBox>
        <RoundedBox
          args={[0.06, 0.82, 0.72]}
          radius={0.015}
          smoothness={2}
          position={[0.32, 0, 0.0]}
          castShadow
        >
          <meshStandardMaterial color="#60798a" roughness={0.48} />
        </RoundedBox>
        {/* 柜门黄铜把手 */}
        <mesh position={[0.37, 0.02, 0.52]} castShadow>
          <sphereGeometry args={[0.032, 12, 12]} />
          <meshStandardMaterial color="#e2b86b" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0.37, 0.02, -0.22]} castShadow>
          <sphereGeometry args={[0.032, 12, 12]} />
          <meshStandardMaterial color="#e2b86b" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* 右侧开放储物格 (z < -0.4) */}
        <mesh position={[0.06, 0, -0.78]}>
          <boxGeometry args={[0.54, 0.82, 0.68]} />
          <meshStandardMaterial color="#374854" roughness={0.7} />
        </mesh>
        {/* 隔板 */}
        <mesh position={[0.06, -0.02, -0.78]}>
          <boxGeometry args={[0.56, 0.05, 0.68]} />
          <meshStandardMaterial color="#516878" roughness={0.5} />
        </mesh>
        {/* 储物格内的玻璃储物罐与软木塞（还原参考图吊柜右上角小罐子） */}
        <group position={[0.14, 0.16, -0.76]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.24, 16]} />
            <meshPhysicalMaterial
              color="#fef3c7"
              roughness={0.18}
              transmission={0.35}
              transparent
              opacity={0.9}
            />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.07, 0.065, 0.05, 16]} />
            <meshStandardMaterial color="#b45309" roughness={0.7} />
          </mesh>
        </group>
        {/* 下格小书本与陶罐 */}
        <mesh position={[0.12, -0.24, -0.86]} castShadow>
          <boxGeometry args={[0.24, 0.26, 0.08]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
        <mesh position={[0.14, -0.26, -0.66]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.2, 14]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.45} />
        </mesh>
      </group>

      {/* 吊柜下方暖黄串灯与垂落电线 (Interactable_StringLights) */}
      <group
        name="Interactable_StringLights"
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('string-lights');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('string-lights');
        }}
      >
        {/* 串灯黑色导线分段 */}
        {bulbPositions.map((pos, idx) => {
          if (idx === bulbPositions.length - 1) return null;
          const next = bulbPositions[idx + 1];
          const startVec = new THREE.Vector3(...pos);
          const endVec = new THREE.Vector3(...next);
          const mid = startVec.clone().add(endVec).multiplyScalar(0.5);
          const dist = startVec.distanceTo(endVec);
          const dir = endVec.clone().sub(startVec).normalize();
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir
          );

          return (
            <mesh key={`wire-${idx}`} position={mid} quaternion={quat}>
              <cylinderGeometry args={[0.014, 0.014, dist, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
          );
        })}

        {/* 垂向墙角插座的电源线尾段 */}
        <mesh position={[-3.84, 0.92, 3.34]}>
          <cylinderGeometry args={[0.014, 0.014, 0.56, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>

        {/* 发光暖黄串灯灯泡 */}
        {bulbPositions.map((pos, idx) => (
          <group key={`bulb-${idx}`} position={pos}>
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.052, 14, 14]} />
              <meshStandardMaterial
                color={lighting.stringLightsOn ? '#fef08a' : '#94a3b8'}
                emissive={
                  lighting.stringLightsOn
                    ? stringHovered
                      ? '#fde047'
                      : '#facc15'
                    : '#000000'
                }
                emissiveIntensity={lighting.stringLightsOn ? 2.2 : 0}
                roughness={0.2}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* ==================== 3. 床头柜与暖光阅读台灯 (Interactable_BedsideLamp) ==================== */}
      <group position={[-3.32, 0, -0.12]}>
        {/* 床头柜柜体 */}
        <RoundedBox
          args={[0.88, 0.68, 0.88]}
          radius={0.03}
          smoothness={3}
          position={[0, 0.42, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#9e6752" roughness={0.56} />
        </RoundedBox>
        {/* 抽屉面板与拉手 */}
        <RoundedBox
          args={[0.04, 0.24, 0.72]}
          radius={0.01}
          smoothness={2}
          position={[0.44, 0.52, 0]}
        >
          <meshStandardMaterial color="#875542" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0.48, 0.52, 0]}>
          <sphereGeometry args={[0.028, 10, 10]} />
          <meshStandardMaterial color="#e2b86b" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* 床头阅读暖灯 (Interactable_BedsideLamp) */}
        <group
          name="Interactable_BedsideLamp"
          position={[0.02, 0.76, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHoverChange('bedside-lamp');
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onHoverChange(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onInteract('bedside-lamp');
          }}
        >
          {/* 陶瓷灯座 */}
          <mesh position={[0, 0.08, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.13, 0.16, 20]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.35} />
          </mesh>
          {/* 亚麻布艺灯罩 */}
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.21, 0.26, 24]} />
            <meshStandardMaterial
              color={lighting.bedsideLampOn ? '#fef3c7' : '#cbd5e1'}
              emissive={
                lighting.bedsideLampOn
                  ? lampHovered
                    ? '#fde047'
                    : '#fbbf24'
                  : lampHovered
                  ? '#fde047'
                  : '#000000'
              }
              emissiveIntensity={lighting.bedsideLampOn ? 1.4 : lampHovered ? 0.25 : 0}
              roughness={0.6}
            />
          </mesh>
        </group>
      </group>

      {/* ==================== 4. 原木矮书柜与精装藏书 (Interactable_Bookcase) ==================== */}
      <group
        name="Interactable_Bookcase"
        position={[-3.14, 0, -2.14]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('bookcase');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('bookcase');
        }}
      >
        {/* 书柜/抽屉柜主体（还原参考图窗户左下方储物柜） */}
        <RoundedBox
          args={[1.18, 1.06, 2.18]}
          radius={0.035}
          smoothness={3}
          position={[0, 0.53, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#a36b55"
            roughness={0.55}
            emissive={bookcaseHovered ? '#34d399' : '#000000'}
            emissiveIntensity={bookcaseHovered ? 0.15 : 0}
          />
        </RoundedBox>

        {/* 柜体正前方三层抽屉与左侧开放书格 */}
        {[0.24, 0.54, 0.82].map((dy, i) => (
          <group key={`drawer-${i}`} position={[0.59, dy, -0.46]}>
            <RoundedBox args={[0.04, 0.24, 0.96]} radius={0.01} smoothness={2}>
              <meshStandardMaterial color="#8e5a46" roughness={0.58} />
            </RoundedBox>
            <RoundedBox
              args={[0.06, 0.04, 0.22]}
              radius={0.01}
              smoothness={2}
              position={[0.03, 0, 0]}
            >
              <meshStandardMaterial color="#d4a373" roughness={0.4} />
            </RoundedBox>
          </group>
        ))}

        {/* 左侧下层内嵌开放书架层与藏书 */}
        <mesh position={[0.14, 0.53, 0.54]}>
          <boxGeometry args={[0.92, 0.84, 0.88]} />
          <meshStandardMaterial color="#5c3a2d" roughness={0.75} />
        </mesh>
        <mesh position={[0.14, 0.52, 0.54]}>
          <boxGeometry args={[0.94, 0.05, 0.88]} />
          <meshStandardMaterial color="#9c6550" roughness={0.55} />
        </mesh>
        {/* 下层书格内的成排精装书 */}
        {[
          { z: 0.22, h: 0.32, c: '#38bdf8' },
          { z: 0.31, h: 0.35, c: '#f43f5e' },
          { z: 0.4, h: 0.3, c: '#eab308' },
          { z: 0.49, h: 0.34, c: '#10b981' },
          { z: 0.58, h: 0.33, c: '#a855f7' },
          { z: 0.67, h: 0.31, c: '#f97316' },
          { z: 0.78, h: 0.35, c: '#e2e8f0' },
        ].map((b, idx) => (
          <RoundedBox
            key={`shelf-book-${idx}`}
            args={[0.34, b.h, 0.075]}
            radius={0.01}
            smoothness={2}
            position={[0.32, 0.72, b.z]}
            castShadow
          >
            <meshStandardMaterial color={b.c} roughness={0.55} />
          </RoundedBox>
        ))}

        {/* 柜顶陈列：左侧立式彩色厚书群（还原参考图绿/黄/橙立书） */}
        <group position={[0.05, 1.06, 0.56]}>
          <RoundedBox
            args={[0.42, 0.52, 0.16]}
            radius={0.018}
            smoothness={2}
            position={[0, 0.26, 0.24]}
            castShadow
          >
            <meshStandardMaterial color="#84a93c" roughness={0.5} />
          </RoundedBox>
          <RoundedBox
            args={[0.4, 0.48, 0.15]}
            radius={0.018}
            smoothness={2}
            position={[0.02, 0.24, 0.06]}
            castShadow
          >
            <meshStandardMaterial color="#eab308" roughness={0.5} />
          </RoundedBox>
          <RoundedBox
            args={[0.38, 0.44, 0.14]}
            radius={0.018}
            smoothness={2}
            position={[-0.02, 0.22, -0.1]}
            castShadow
          >
            <meshStandardMaterial color="#d97706" roughness={0.5} />
          </RoundedBox>
          <RoundedBox
            args={[0.38, 0.46, 0.12]}
            radius={0.018}
            smoothness={2}
            position={[0.02, 0.23, -0.25]}
            rotation={[0.14, 0, 0]}
            castShadow
          >
            <meshStandardMaterial color="#fef08a" roughness={0.55} />
          </RoundedBox>
        </group>

        {/* 柜顶中部：原木笔筒与画笔铅笔 */}
        <group position={[0.12, 1.06, -0.02]}>
          <mesh position={[0, 0.14, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.085, 0.28, 16]} />
            <meshStandardMaterial color="#78350f" roughness={0.6} />
          </mesh>
          <mesh position={[0.02, 0.31, 0.02]} rotation={[0.15, 0, -0.18]}>
            <cylinderGeometry args={[0.014, 0.014, 0.26, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
          <mesh position={[-0.02, 0.33, -0.02]} rotation={[-0.12, 0, 0.16]}>
            <cylinderGeometry args={[0.014, 0.014, 0.28, 8]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
          <mesh position={[0, 0.34, 0.03]} rotation={[0.08, 0, 0.05]}>
            <cylinderGeometry args={[0.016, 0.016, 0.3, 8]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
        </group>

        {/* 柜顶右侧：横叠画册与手账本（还原参考图窗户下横放书堆） */}
        <group position={[0.08, 1.06, -0.58]}>
          <RoundedBox
            args={[0.52, 0.11, 0.62]}
            radius={0.015}
            smoothness={2}
            position={[0, 0.055, 0]}
            rotation={[0, 0.08, 0]}
            castShadow
          >
            <meshStandardMaterial color="#f59e0b" roughness={0.55} />
          </RoundedBox>
          <RoundedBox
            args={[0.46, 0.1, 0.56]}
            radius={0.015}
            smoothness={2}
            position={[0.02, 0.16, 0.02]}
            rotation={[0, -0.12, 0]}
            castShadow
          >
            <meshStandardMaterial color="#fb7185" roughness={0.55} />
          </RoundedBox>
          <RoundedBox
            args={[0.4, 0.09, 0.48]}
            radius={0.015}
            smoothness={2}
            position={[-0.01, 0.255, 0]}
            rotation={[0, 0.05, 0]}
            castShadow
          >
            <meshStandardMaterial color="#fef08a" roughness={0.55} />
          </RoundedBox>
        </group>
      </group>

      {/* ==================== 5. 宽幅实木电脑桌、复古工作站与音乐唱机 ==================== */}
      <group position={[0.38, 0, -2.85]}>
        {/* 桌面厚实木板 */}
        <RoundedBox
          args={[3.18, 0.11, 1.26]}
          radius={0.028}
          smoothness={3}
          position={[0, 0.98, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#b3785f" roughness={0.48} />
        </RoundedBox>

        {/* 书桌左侧储物侧板与抽屉柜 */}
        <RoundedBox
          args={[0.72, 0.94, 1.18]}
          radius={0.025}
          smoothness={3}
          position={[-1.18, 0.47, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#9c644e" roughness={0.56} />
        </RoundedBox>

        {/* 书桌右侧实木立板腿与前侧抽屉横梁 */}
        <RoundedBox
          args={[0.16, 0.94, 1.18]}
          radius={0.02}
          smoothness={2}
          position={[1.46, 0.47, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#9c644e" roughness={0.56} />
        </RoundedBox>
        <RoundedBox
          args={[1.92, 0.18, 1.12]}
          radius={0.02}
          smoothness={2}
          position={[0.42, 0.84, 0]}
          castShadow
        >
          <meshStandardMaterial color="#8d5843" roughness={0.58} />
        </RoundedBox>

        {/* ---------------- 5A. 复古工作站电脑 (Interactable_Computer) ---------------- */}
        <group
          name="Interactable_Computer"
          position={[0.48, 1.04, -0.02]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHoverChange('computer');
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onHoverChange(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onInteract('computer');
          }}
        >
          {/* 深灰毛毡桌垫 */}
          <RoundedBox
            args={[1.55, 0.012, 0.78]}
            radius={0.005}
            smoothness={2}
            position={[0.06, 0.006, 0.18]}
            receiveShadow
          >
            <meshStandardMaterial color="#334155" roughness={0.9} />
          </RoundedBox>

          {/* 金属显示器底座与支架 */}
          <RoundedBox
            args={[0.46, 0.03, 0.34]}
            radius={0.01}
            smoothness={2}
            position={[0, 0.015, -0.22]}
            castShadow
          >
            <meshStandardMaterial color="#cbd5e1" metalness={0.55} roughness={0.3} />
          </RoundedBox>
          <mesh position={[0, 0.24, -0.26]} rotation={[-0.12, 0, 0]} castShadow>
            <boxGeometry args={[0.12, 0.44, 0.06]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
          </mesh>

          {/* 宽屏显示器外壳（还原参考图浅色边框 + 深色内屏） */}
          <group position={[0, 0.54, -0.18]} rotation={[0, -0.08, 0]}>
            <RoundedBox
              args={[1.44, 0.88, 0.09]}
              radius={0.03}
              smoothness={3}
              castShadow
            >
              <meshStandardMaterial
                color={computerHovered ? '#fef3c7' : '#e5dec9'}
                roughness={0.38}
                emissive={computerHovered ? '#60a5fa' : '#000000'}
                emissiveIntensity={computerHovered ? 0.28 : 0}
              />
            </RoundedBox>

            {/* 显示器深色背壳 */}
            <RoundedBox
              args={[1.32, 0.76, 0.06]}
              radius={0.02}
              smoothness={2}
              position={[0, 0, -0.05]}
            >
              <meshStandardMaterial color="#334155" roughness={0.5} />
            </RoundedBox>

            {/* 发光液晶显示面板 (PocketOS 桌面预览) */}
            <mesh position={[0, 0.02, 0.048]}>
              <planeGeometry args={[1.32, 0.74]} />
              <meshStandardMaterial
                map={monitorScreenTex}
                emissiveMap={monitorScreenTex}
                emissive="#ffffff"
                emissiveIntensity={computerHovered ? 0.95 : 0.72}
                roughness={0.18}
              />
            </mesh>

            {/* 电源呼吸灯 */}
            <mesh position={[0.58, -0.39, 0.049]}>
              <sphereGeometry args={[0.015, 10, 10]} />
              <meshBasicMaterial color="#34d399" />
            </mesh>
          </group>

          {/* 复古机械键盘 */}
          <group position={[-0.08, 0.03, 0.24]} rotation={[0.06, -0.05, 0]}>
            <RoundedBox args={[0.66, 0.04, 0.24]} radius={0.012} smoothness={2} castShadow>
              <meshStandardMaterial color="#e7dec8" roughness={0.45} />
            </RoundedBox>
            {/* 键帽阵列 */}
            <RoundedBox
              args={[0.58, 0.025, 0.17]}
              radius={0.006}
              smoothness={2}
              position={[0, 0.026, 0]}
            >
              <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
            </RoundedBox>
            <mesh position={[-0.24, 0.035, -0.05]}>
              <boxGeometry args={[0.05, 0.015, 0.04]} />
              <meshStandardMaterial color="#f97316" />
            </mesh>
          </group>

          {/* 鼠标与弯曲鼠标线（还原参考图桌面右侧鼠标与连线细节） */}
          <group position={[0.48, 0.03, 0.26]} rotation={[0, -0.15, 0]}>
            <RoundedBox args={[0.11, 0.045, 0.16]} radius={0.022} smoothness={3} castShadow>
              <meshStandardMaterial color="#e7dec8" roughness={0.35} />
            </RoundedBox>
          </group>
          {/* 鼠标连接线 */}
          <mesh position={[0.42, 0.018, 0.04]} rotation={[0, 0.42, 0]}>
            <boxGeometry args={[0.016, 0.012, 0.34]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} />
          </mesh>

          {/* 桌面冒热气的手冲咖啡杯 */}
          <group position={[0.74, 0.015, -0.08]}>
            <mesh position={[0, 0.09, 0]} castShadow>
              <cylinderGeometry args={[0.075, 0.065, 0.18, 18]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.25} />
            </mesh>
            {/* 咖啡液面 */}
            <mesh position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.066, 16]} />
              <meshStandardMaterial color="#451a03" roughness={0.2} />
            </mesh>
            {/* 袅袅热气 */}
            <group ref={steamGroupRef} position={[0, 0.18, 0]}>
              {[0, 1, 2].map((idx) => (
                <mesh key={idx} position={[0, idx * 0.08, 0]}>
                  <sphereGeometry args={[0.028, 10, 10]} />
                  <meshBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0.28}
                    depthWrite={false}
                  />
                </mesh>
              ))}
            </group>
          </group>
        </group>

        {/* ---------------- 5B. Hi-Fi 黑胶与光盘音乐播放器 (Interactable_MusicPlayer) ---------------- */}
        <group
          name="Interactable_MusicPlayer"
          position={[-1.06, 1.04, 0.02]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHoverChange('music-player');
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onHoverChange(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onInteract('music-player');
          }}
        >
          {/* 胡桃木唱机底座 */}
          <RoundedBox
            args={[0.84, 0.14, 0.68]}
            radius={0.025}
            smoothness={3}
            position={[0, 0.07, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color="#5c3a28"
              roughness={0.42}
              emissive={musicHovered ? '#f59e0b' : '#000000'}
              emissiveIntensity={musicHovered ? 0.25 : 0}
            />
          </RoundedBox>

          {/* 金属拉丝顶板 */}
          <RoundedBox
            args={[0.78, 0.02, 0.62]}
            radius={0.01}
            smoothness={2}
            position={[0, 0.145, 0]}
          >
            <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.28} />
          </RoundedBox>

          {/* 前面板暖黄 VU 电平表灯窗 */}
          <mesh position={[0, 0.07, 0.342]}>
            <planeGeometry args={[0.36, 0.055]} />
            <meshBasicMaterial color={isMusicPlaying ? '#fbbf24' : '#fde68a'} />
          </mesh>

          {/* 旋转黑胶/光盘转盘 */}
          <group ref={discSpinRef} position={[-0.08, 0.165, 0]}>
            {/* 外圈黑胶/金属光盘盘面 */}
            <mesh castShadow>
              <cylinderGeometry args={[0.24, 0.24, 0.018, 32]} />
              <meshStandardMaterial
                color="#1e293b"
                metalness={0.75}
                roughness={0.2}
              />
            </mesh>
            {/* 彩色专辑中心盘贴（实时同步当前选中光盘配色） */}
            <mesh position={[0, 0.011, 0]}>
              <cylinderGeometry args={[0.105, 0.105, 0.006, 24]} />
              <meshStandardMaterial
                color={activeDisc.discThemeColor[0]}
                emissive={activeDisc.discThemeColor[1]}
                emissiveIntensity={isMusicPlaying ? 0.55 : 0.2}
                roughness={0.3}
              />
            </mesh>
            {/* 中心轴针 */}
            <mesh position={[0, 0.022, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.03, 12]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>

          {/* 金属唱臂机构 */}
          <group ref={tonearmRef} position={[0.24, 0.18, -0.16]}>
            <mesh>
              <cylinderGeometry args={[0.045, 0.045, 0.05, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[-0.06, 0.02, 0.15]} rotation={[Math.PI / 2, 0, 0.32]}>
              <cylinderGeometry args={[0.01, 0.01, 0.34, 10]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.85} roughness={0.15} />
            </mesh>
          </group>

          {/* 半透明亚克力防尘盖（微开角度） */}
          <group position={[0, 0.15, -0.32]} rotation={[-0.42, 0, 0]}>
            <RoundedBox
              args={[0.8, 0.08, 0.64]}
              radius={0.015}
              smoothness={2}
              position={[0, 0.04, 0.32]}
            >
              <meshPhysicalMaterial
                color="#e0f2fe"
                transparent
                opacity={0.28}
                roughness={0.1}
                transmission={0.5}
              />
            </RoundedBox>
          </group>

          {/* 独立复古木质监听音箱 */}
          <group position={[-0.58, 0.18, -0.06]}>
            <RoundedBox args={[0.26, 0.36, 0.28]} radius={0.02} smoothness={2} castShadow>
              <meshStandardMaterial color="#4a2e1f" roughness={0.5} />
            </RoundedBox>
            <mesh position={[0, 0.06, 0.142]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 0.01, 16]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
            <mesh position={[0, -0.07, 0.142]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.082, 0.082, 0.01, 18]} />
              <meshStandardMaterial color="#d97706" metalness={0.4} roughness={0.35} />
            </mesh>
          </group>

          {/* 播放时飘出的立体发光音符粒子 */}
          <group ref={notesGroupRef} position={[0, 0.25, 0]}>
            {['#f59e0b', '#38bdf8', '#f472b6', '#34d399'].map((noteColor, idx) => (
              <group key={`note-${idx}`}>
                <mesh position={[0, 0, 0]}>
                  <sphereGeometry args={[0.042, 12, 12]} />
                  <meshBasicMaterial color={noteColor} />
                </mesh>
                <mesh position={[0.032, 0.07, 0]}>
                  <boxGeometry args={[0.014, 0.14, 0.014]} />
                  <meshBasicMaterial color={noteColor} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      </group>

      {/* ==================== 6. 人体工学旋转电脑椅 (Interactable_Chair) ==================== */}
      <group
        name="Interactable_Chair"
        position={[0.42, 0, -1.45]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('chair');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('chair');
        }}
      >
        {/* 五星脚轮底盘 */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 14]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.35} />
        </mesh>
        {[0, 1, 2, 3, 4].map((spoke) => {
          const angle = (spoke * Math.PI * 2) / 5;
          return (
            <group key={spoke} rotation={[0, angle, 0]}>
              <mesh position={[0.2, 0.09, 0]} rotation={[0, 0, -0.15]} castShadow>
                <boxGeometry args={[0.42, 0.045, 0.055]} />
                <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
              </mesh>
              <mesh position={[0.38, 0.04, 0]}>
                <sphereGeometry args={[0.042, 10, 10]} />
                <meshStandardMaterial color="#0f172a" roughness={0.6} />
              </mesh>
            </group>
          );
        })}

        {/* 可旋转座椅上半部 */}
        <group ref={chairSwivelRef} position={[0, 0.52, 0]}>
          {/* 坐垫 */}
          <RoundedBox
            args={[0.68, 0.12, 0.66]}
            radius={0.045}
            smoothness={3}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color="#4f566b"
              roughness={0.75}
              emissive={chairHovered ? '#a78bfa' : '#000000'}
              emissiveIntensity={chairHovered ? 0.22 : 0}
            />
          </RoundedBox>

          {/* 曲面靠背 */}
          <RoundedBox
            args={[0.62, 0.72, 0.11]}
            radius={0.05}
            smoothness={3}
            position={[0, 0.44, 0.28]}
            rotation={[0.08, 0, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color="#586077"
              roughness={0.75}
              emissive={chairHovered ? '#a78bfa' : '#000000'}
              emissiveIntensity={chairHovered ? 0.22 : 0}
            />
          </RoundedBox>
          {/* 靠背连接立柱 */}
          <mesh position={[0, 0.18, 0.31]}>
            <boxGeometry args={[0.12, 0.36, 0.05]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
          </mesh>

          {/* 左右扶手 */}
          <RoundedBox
            args={[0.08, 0.05, 0.38]}
            radius={0.02}
            smoothness={2}
            position={[-0.36, 0.24, 0.04]}
            castShadow
          >
            <meshStandardMaterial color="#334155" roughness={0.5} />
          </RoundedBox>
          <mesh position={[-0.36, 0.12, 0.04]}>
            <boxGeometry args={[0.05, 0.24, 0.06]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <RoundedBox
            args={[0.08, 0.05, 0.38]}
            radius={0.02}
            smoothness={2}
            position={[0.36, 0.24, 0.04]}
            castShadow
          >
            <meshStandardMaterial color="#334155" roughness={0.5} />
          </RoundedBox>
          <mesh position={[0.36, 0.12, 0.04]}>
            <boxGeometry args={[0.05, 0.24, 0.06]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </group>
      </group>

      {/* ==================== 7. 书桌侧废纸篓与皱纸团 (Interactable_TrashBin) ==================== */}
      <group
        name="Interactable_TrashBin"
        position={[2.32, 0, -2.35]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('trash-bin');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('trash-bin');
        }}
      >
        {/* 蓝灰锥形桶身（还原参考图桌旁纸篓） */}
        <mesh position={[0, 0.31, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.31, 0.23, 0.62, 22]} />
          <meshStandardMaterial
            color="#5a7285"
            roughness={0.52}
            emissive={trashHovered ? '#94a3b8' : '#000000'}
            emissiveIntensity={trashHovered ? 0.25 : 0}
          />
        </mesh>
        {/* 桶口加固圈 */}
        <mesh position={[0, 0.61, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.31, 0.022, 12, 24]} />
          <meshStandardMaterial color="#475b6b" roughness={0.45} />
        </mesh>

        {/* 桶口满溢的多面体皱纸团 */}
        {[
          [0, 0.6, 0, 0.11],
          [-0.13, 0.58, 0.09, 0.095],
          [0.14, 0.59, 0.08, 0.09],
          [-0.08, 0.62, -0.12, 0.1],
          [0.11, 0.61, -0.1, 0.095],
          [0.02, 0.68, 0.04, 0.09],
          [-0.16, 0.64, -0.02, 0.085],
        ].map(([px, py, pz, r], idx) => (
          <mesh
            key={`paper-${idx}`}
            position={[px, py, pz]}
            rotation={[idx * 0.7, idx * 1.1, idx * 0.5]}
            castShadow
          >
            <dodecahedronGeometry args={[r, 0]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.85} />
          </mesh>
        ))}

        {/* 动态飞入的纸团 */}
        <mesh ref={tossedPaperRef} visible={false} castShadow>
          <dodecahedronGeometry args={[0.095, 0]} />
          <meshStandardMaterial color="#fef9c3" roughness={0.8} />
        </mesh>
      </group>

      {/* ==================== 8. 前侧绿植花箱 (Interactable_Plant) ==================== */}
      <group
        name="Interactable_Plant"
        position={[2.58, 0, -0.75]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange('plant');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onInteract('plant');
        }}
      >
        {/* 深蓝灰矩形花箱（还原参考图右下角绿植箱） */}
        <RoundedBox
          args={[1.28, 0.42, 0.88]}
          radius={0.03}
          smoothness={3}
          position={[0, 0.21, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#3b4d5e"
            roughness={0.6}
            emissive={plantHovered ? '#4ade80' : '#000000'}
            emissiveIntensity={plantHovered ? 0.2 : 0}
          />
        </RoundedBox>
        {/* 營養土壤层 */}
        <mesh position={[0, 0.41, 0]}>
          <boxGeometry args={[1.16, 0.04, 0.76]} />
          <meshStandardMaterial color="#3e2723" roughness={0.95} />
        </mesh>

        {/* 饱满多层次绿植叶片群 */}
        <group ref={plantLeavesRef} position={[0, 0.44, 0]}>
          {[
            { pos: [-0.36, 0.18, 0.12], r: 0.26, c: '#65a30d' },
            { pos: [-0.12, 0.26, -0.14], r: 0.3, c: '#84cc16' },
            { pos: [0.22, 0.22, 0.14], r: 0.28, c: '#4d7c0f' },
            { pos: [0.38, 0.16, -0.12], r: 0.24, c: '#65a30d' },
            { pos: [-0.32, 0.12, -0.18], r: 0.22, c: '#4d7c0f' },
            { pos: [0.04, 0.32, 0.04], r: 0.26, c: '#a3e635' },
            { pos: [0.28, 0.28, -0.02], r: 0.22, c: '#84cc16' },
            { pos: [-0.18, 0.24, 0.22], r: 0.21, c: '#84cc16' },
          ].map((leaf, idx) => (
            <mesh
              key={`leaf-${idx}`}
              position={leaf.pos as [number, number, number]}
              scale={[1.15, 0.88, 1.05]}
              castShadow
              receiveShadow
            >
              <dodecahedronGeometry args={[leaf.r, 1]} />
              <meshStandardMaterial color={leaf.c} roughness={0.68} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};
