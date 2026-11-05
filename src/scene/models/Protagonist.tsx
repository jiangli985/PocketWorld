import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import {
  CharacterPosture,
  InteractableId,
} from '../../types/interactable';
import { INTERACTABLE_ITEMS, ROOM_OBSTACLES } from '../interactables';

interface ProtagonistProps {
  controlsEnabled: boolean;
  posture: CharacterPosture;
  onPostureChange: (posture: CharacterPosture) => void;
  walkTarget: [number, number, number] | null;
  onClearWalkTarget: () => void;
  nearbyId: InteractableId | null;
  onNearbyChange: (id: InteractableId | null) => void;
  onInteract: (id: InteractableId) => void;
  onPositionUpdate: (pos: [number, number, number]) => void;
  statusBubble: string | null;
}

const CHARACTER_RADIUS = 0.28;
const MOVE_SPEED = 3.15;

function resolveObstacleCollision(x: number, z: number): [number, number] {
  let nx = THREE.MathUtils.clamp(x, -3.48, 3.55);
  let nz = THREE.MathUtils.clamp(z, -3.48, 3.55);

  for (const box of ROOM_OBSTACLES) {
    const minX = box.minX - CHARACTER_RADIUS;
    const maxX = box.maxX + CHARACTER_RADIUS;
    const minZ = box.minZ - CHARACTER_RADIUS;
    const maxZ = box.maxZ + CHARACTER_RADIUS;

    if (nx > minX && nx < maxX && nz > minZ && nz < maxZ) {
      const penLeft = nx - minX;
      const penRight = maxX - nx;
      const penTop = nz - minZ;
      const penBottom = maxZ - nz;
      const minPen = Math.min(penLeft, penRight, penTop, penBottom);

      if (minPen === penLeft) nx = minX;
      else if (minPen === penRight) nx = maxX;
      else if (minPen === penTop) nz = minZ;
      else nz = maxZ;
    }
  }

  return [
    THREE.MathUtils.clamp(nx, -3.48, 3.55),
    THREE.MathUtils.clamp(nz, -3.48, 3.55),
  ];
}

export const Protagonist: React.FC<ProtagonistProps> = ({
  controlsEnabled,
  posture,
  onPostureChange,
  walkTarget,
  onClearWalkTarget,
  nearbyId,
  onNearbyChange,
  onInteract,
  onPositionUpdate,
  statusBubble,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const bodyPivotRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  const posRef = useRef<[number, number, number]>([0.95, 0, 0.45]);
  const rotYRef = useRef<number>(-0.65);
  const walkCycleRef = useRef<number>(0);
  const jumpVelRef = useRef<number>(0);
  const jumpYRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastNearbyRef = useRef<InteractableId | null>(null);
  const lastPosSyncRef = useRef<number>(0);
  const camera = useThree((state) => state.camera);
  const viewDirRef = useRef(new THREE.Vector3());

  // 键盘移动、跳跃与 E 键就近交互监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!controlsEnabled) {
        keysRef.current = {};
        return;
      }
      const tag = e.target instanceof HTMLElement ? e.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const code = e.code;
      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        keysRef.current[code] = true;
      } else if (code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (posture === 'sleeping' || posture === 'sitting') {
          onPostureChange('standing');
        }
        if (jumpYRef.current <= 0.01) {
          jumpVelRef.current = 4.2;
        }
      } else if (code === 'KeyE' && !e.repeat) {
        e.preventDefault();
        if (lastNearbyRef.current) {
          onInteract(lastNearbyRef.current);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const handleBlur = () => {
      keysRef.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [controlsEnabled, onInteract, onPostureChange, posture]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();

    const keys = keysRef.current;
    // 按当前相机朝向把 WASD 映射到地面方向，旋转视角后“上”仍是屏幕上方
    let inputX = 0;
    let inputZ = 0;
    if (controlsEnabled) {
      const forward = camera.getWorldDirection(viewDirRef.current).setY(0).normalize();
      const up = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
      const right = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
      inputX = forward.x * up - forward.z * right;
      inputZ = forward.z * up + forward.x * right;
    }

    const hasKeyInput = inputX !== 0 || inputZ !== 0;
    if (hasKeyInput && walkTarget) {
      onClearWalkTarget();
    }

    // 若正在躺床或坐椅子时按下移动键，自动起身回到自由活动状态
    if (hasKeyInput && (posture === 'sleeping' || posture === 'sitting')) {
      onPostureChange('walking');
      posRef.current =
        posture === 'sleeping' ? [-0.05, 0, 1.75] : [0.45, 0, -0.82];
    }

    let isMoving = false;

    if (posture === 'sleeping') {
      // 躺在床铺上休息姿态
      if (rootRef.current && bodyPivotRef.current) {
        rootRef.current.position.set(-2.02, 0.88, 1.82);
        rootRef.current.rotation.set(0, Math.PI / 2, 0);
        bodyPivotRef.current.rotation.set(-Math.PI / 2, 0, 0);
        bodyPivotRef.current.position.set(0, -0.1, 0.42);
      }
      if (leftArmRef.current && rightArmRef.current && leftLegRef.current && rightLegRef.current) {
        leftArmRef.current.rotation.set(0.15, 0, 0.15);
        rightArmRef.current.rotation.set(0.15, 0, -0.15);
        leftLegRef.current.rotation.set(0, 0, 0);
        rightLegRef.current.rotation.set(0, 0, 0);
      }
    } else if (posture === 'sitting') {
      // 坐在电脑转椅上姿态
      if (rootRef.current && bodyPivotRef.current) {
        rootRef.current.position.set(0.42, 0.34, -1.45);
        rootRef.current.rotation.set(0, Math.PI, 0);
        bodyPivotRef.current.rotation.set(0, 0, 0);
        bodyPivotRef.current.position.set(0, 0, 0);
      }
      if (leftArmRef.current && rightArmRef.current && leftLegRef.current && rightLegRef.current) {
        leftArmRef.current.rotation.set(-0.65, 0, 0.1);
        rightArmRef.current.rotation.set(-0.65, 0, -0.1);
        leftLegRef.current.rotation.set(-1.25, 0, 0);
        rightLegRef.current.rotation.set(-1.25, 0, 0);
      }
    } else {
      // 站立或自由行走状态
      let moveVecX = 0;
      let moveVecZ = 0;

      if (hasKeyInput) {
        const len = Math.hypot(inputX, inputZ);
        moveVecX = inputX / len;
        moveVecZ = inputZ / len;
        isMoving = true;
      } else if (walkTarget) {
        const dx = walkTarget[0] - posRef.current[0];
        const dz = walkTarget[2] - posRef.current[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 0.12) {
          moveVecX = dx / dist;
          moveVecZ = dz / dist;
          isMoving = true;
        } else {
          onClearWalkTarget();
        }
      }

      if (isMoving) {
        const nextX = posRef.current[0] + moveVecX * MOVE_SPEED * dt;
        const nextZ = posRef.current[2] + moveVecZ * MOVE_SPEED * dt;
        const [resolvedX, resolvedZ] = resolveObstacleCollision(nextX, nextZ);
        posRef.current[0] = resolvedX;
        posRef.current[2] = resolvedZ;

        const targetYaw = Math.atan2(moveVecX, moveVecZ);
        let diff = targetYaw - rotYRef.current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        rotYRef.current += diff * Math.min(1, dt * 12);

        walkCycleRef.current += dt * 11.5;
      } else {
        walkCycleRef.current = 0;
      }

      // 跳跃重力积分
      if (jumpYRef.current > 0 || jumpVelRef.current > 0) {
        jumpYRef.current += jumpVelRef.current * dt;
        jumpVelRef.current -= 12.5 * dt;
        if (jumpYRef.current <= 0) {
          jumpYRef.current = 0;
          jumpVelRef.current = 0;
        }
      }

      const stepBob = isMoving ? Math.abs(Math.sin(walkCycleRef.current)) * 0.055 : 0;

      if (rootRef.current && bodyPivotRef.current) {
        rootRef.current.position.set(
          posRef.current[0],
          jumpYRef.current + stepBob,
          posRef.current[2]
        );
        rootRef.current.rotation.set(0, rotYRef.current, 0);
        bodyPivotRef.current.rotation.set(0, 0, 0);
        bodyPivotRef.current.position.set(0, 0, 0);
      }

      // 四肢行走摆动与呼吸动画
      const swing = isMoving ? Math.sin(walkCycleRef.current) * 0.62 : 0;
      const breath = Math.sin(t * 2.4) * 0.03;

      if (leftArmRef.current && rightArmRef.current) {
        if (jumpYRef.current > 0.04) {
          leftArmRef.current.rotation.set(-0.4, 0, 0.55);
          rightArmRef.current.rotation.set(-2.3, 0, -0.35);
        } else if (posture === 'petting') {
          leftArmRef.current.rotation.set(-0.2, 0, 0.08);
          rightArmRef.current.rotation.set(-0.95 + Math.sin(t * 10) * 0.25, 0, -0.15);
        } else {
          leftArmRef.current.rotation.set(swing, 0, 0.08 + breath);
          rightArmRef.current.rotation.set(-swing, 0, -0.08 - breath);
        }
      }
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.set(-swing * 0.85, 0, 0);
        rightLegRef.current.rotation.set(swing * 0.85, 0, 0);
      }
      if (headRef.current) {
        headRef.current.rotation.y = isMoving ? 0 : Math.sin(t * 1.1) * 0.12;
        headRef.current.rotation.x = posture === 'petting' ? 0.28 : Math.sin(t * 1.8) * 0.03;
      }
    }

    // 定期同步主角位置供猫咪视线与 UI 使用
    if (t - lastPosSyncRef.current > 0.12) {
      lastPosSyncRef.current = t;
      onPositionUpdate([...posRef.current]);
    }

    // 计算当前主角附近最近的可交互物品
    const checkPos: [number, number, number] =
      posture === 'sleeping'
        ? [-1.85, 0.85, 1.75]
        : posture === 'sitting'
        ? [0.42, 0.5, -1.45]
        : posRef.current;

    let closestId: InteractableId | null = null;
    let closestDist = Infinity;

    for (const item of INTERACTABLE_ITEMS) {
      if (!item.anchorPosition) continue;
      const dx = checkPos[0] - item.anchorPosition[0];
      const dz = checkPos[2] - item.anchorPosition[2];
      const dist = Math.hypot(dx, dz);
      const radius = item.interactRadius ?? 1.75;
      if (dist <= radius && dist < closestDist) {
        closestDist = dist;
        closestId = item.id;
      }
    }

    if (closestId !== lastNearbyRef.current) {
      lastNearbyRef.current = closestId;
      onNearbyChange(closestId);
    }
  });

  const nearbyItem = nearbyId
    ? INTERACTABLE_ITEMS.find((item) => item.id === nearbyId)
    : null;

  return (
    <group ref={rootRef} name="Protagonist_Character" position={[0.95, 0, 0.45]}>
      {/* 脚下柔和方位光环 */}
      {posture !== 'sleeping' && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.24, 0.31, 32]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 身体姿态旋转枢轴 */}
      <group ref={bodyPivotRef}>
        {/* ---------------- 双腿与运动鞋 ---------------- */}
        <group ref={leftLegRef} position={[-0.105, 0.54, 0]}>
          {/* 左腿牛仔裤 */}
          <RoundedBox
            args={[0.15, 0.48, 0.16]}
            radius={0.05}
            smoothness={3}
            position={[0, -0.22, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#2b3a4f" roughness={0.78} />
          </RoundedBox>
          {/* 裤脚卷边 */}
          <RoundedBox
            args={[0.16, 0.05, 0.17]}
            radius={0.015}
            smoothness={2}
            position={[0, -0.44, 0]}
          >
            <meshStandardMaterial color="#475569" roughness={0.75} />
          </RoundedBox>
          {/* 左运动鞋 */}
          <RoundedBox
            args={[0.16, 0.1, 0.24]}
            radius={0.035}
            smoothness={3}
            position={[0, -0.49, 0.035]}
            castShadow
          >
            <meshStandardMaterial color="#f8fafc" roughness={0.45} />
          </RoundedBox>
          <RoundedBox
            args={[0.165, 0.035, 0.25]}
            radius={0.01}
            smoothness={2}
            position={[0, -0.525, 0.035]}
          >
            <meshStandardMaterial color="#d97706" roughness={0.6} />
          </RoundedBox>
        </group>

        <group ref={rightLegRef} position={[0.105, 0.54, 0]}>
          {/* 右腿牛仔裤 */}
          <RoundedBox
            args={[0.15, 0.48, 0.16]}
            radius={0.05}
            smoothness={3}
            position={[0, -0.22, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#2b3a4f" roughness={0.78} />
          </RoundedBox>
          {/* 裤脚卷边 */}
          <RoundedBox
            args={[0.16, 0.05, 0.17]}
            radius={0.015}
            smoothness={2}
            position={[0, -0.44, 0]}
          >
            <meshStandardMaterial color="#475569" roughness={0.75} />
          </RoundedBox>
          {/* 右运动鞋 */}
          <RoundedBox
            args={[0.16, 0.1, 0.24]}
            radius={0.035}
            smoothness={3}
            position={[0, -0.49, 0.035]}
            castShadow
          >
            <meshStandardMaterial color="#f8fafc" roughness={0.45} />
          </RoundedBox>
          <RoundedBox
            args={[0.165, 0.035, 0.25]}
            radius={0.01}
            smoothness={2}
            position={[0, -0.525, 0.035]}
          >
            <meshStandardMaterial color="#d97706" roughness={0.6} />
          </RoundedBox>
        </group>

        {/* ---------------- 上半身连帽夹克与内搭 ---------------- */}
        <group position={[0, 0.84, 0]}>
          {/* 湖蓝灰休闲连帽衫主体 */}
          <RoundedBox
            args={[0.42, 0.54, 0.25]}
            radius={0.08}
            smoothness={4}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#3b7a8c" roughness={0.72} />
          </RoundedBox>

          {/* 胸前浅米白内搭领口与装饰条 */}
          <RoundedBox
            args={[0.16, 0.48, 0.26]}
            radius={0.03}
            smoothness={2}
            position={[0, 0.01, 0.005]}
          >
            <meshStandardMaterial color="#f8fafc" roughness={0.65} />
          </RoundedBox>

          {/* 背部连帽造型 */}
          <RoundedBox
            args={[0.32, 0.16, 0.14]}
            radius={0.06}
            smoothness={3}
            position={[0, 0.22, -0.11]}
            castShadow
          >
            <meshStandardMaterial color="#326978" roughness={0.75} />
          </RoundedBox>

          {/* 脖颈挂置的复古头戴式监听耳机 */}
          <mesh position={[0, 0.26, 0.02]} rotation={[Math.PI / 2 + 0.2, 0, 0]}>
            <torusGeometry args={[0.14, 0.022, 12, 24]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[-0.13, 0.24, 0.09]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.048, 0.048, 0.04, 14]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0.13, 0.24, 0.09]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.048, 0.048, 0.04, 14]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.3} />
          </mesh>
        </group>

        {/* ---------------- 左右摆动手臂 ---------------- */}
        <group ref={leftArmRef} position={[-0.27, 1.05, 0]}>
          <RoundedBox
            args={[0.13, 0.42, 0.14]}
            radius={0.055}
            smoothness={3}
            position={[0, -0.17, 0]}
            castShadow
          >
            <meshStandardMaterial color="#3b7a8c" roughness={0.72} />
          </RoundedBox>
          {/* 左手 */}
          <mesh position={[0, -0.41, 0]} castShadow>
            <sphereGeometry args={[0.058, 14, 14]} />
            <meshStandardMaterial color="#f4c7ab" roughness={0.55} />
          </mesh>
        </group>

        <group ref={rightArmRef} position={[0.27, 1.05, 0]}>
          <RoundedBox
            args={[0.13, 0.42, 0.14]}
            radius={0.055}
            smoothness={3}
            position={[0, -0.17, 0]}
            castShadow
          >
            <meshStandardMaterial color="#3b7a8c" roughness={0.72} />
          </RoundedBox>
          {/* 右手 */}
          <mesh position={[0, -0.41, 0]} castShadow>
            <sphereGeometry args={[0.058, 14, 14]} />
            <meshStandardMaterial color="#f4c7ab" roughness={0.55} />
          </mesh>
        </group>

        {/* ---------------- 头部、五官与层次感发型 ---------------- */}
        <group ref={headRef} position={[0, 1.32, 0]}>
          {/* 脖颈 */}
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.068, 0.075, 0.12, 14]} />
            <meshStandardMaterial color="#eab89b" roughness={0.55} />
          </mesh>

          {/* 脸部头型 */}
          <RoundedBox
            args={[0.34, 0.35, 0.33]}
            radius={0.14}
            smoothness={4}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#f4c7ab" roughness={0.52} />
          </RoundedBox>

          {/* 左右耳朵 */}
          <mesh position={[-0.175, -0.01, 0]}>
            <sphereGeometry args={[0.042, 12, 12]} />
            <meshStandardMaterial color="#eab89b" roughness={0.55} />
          </mesh>
          <mesh position={[0.175, -0.01, 0]}>
            <sphereGeometry args={[0.042, 12, 12]} />
            <meshStandardMaterial color="#eab89b" roughness={0.55} />
          </mesh>

          {/* 栗棕色立体蓬松发型 */}
          {/* 头顶主发团 */}
          <RoundedBox
            args={[0.38, 0.18, 0.37]}
            radius={0.08}
            smoothness={4}
            position={[0, 0.13, -0.01]}
            castShadow
          >
            <meshStandardMaterial color="#3b261e" roughness={0.75} />
          </RoundedBox>
          {/* 后脑勺发层 */}
          <RoundedBox
            args={[0.37, 0.28, 0.15]}
            radius={0.07}
            smoothness={3}
            position={[0, 0.02, -0.12]}
            castShadow
          >
            <meshStandardMaterial color="#3b261e" roughness={0.75} />
          </RoundedBox>
          {/* 额前斜刘海 */}
          <RoundedBox
            args={[0.22, 0.11, 0.09]}
            radius={0.04}
            smoothness={3}
            position={[-0.05, 0.11, 0.145]}
            rotation={[0.12, 0, -0.18]}
            castShadow
          >
            <meshStandardMaterial color="#462e24" roughness={0.72} />
          </RoundedBox>
          <RoundedBox
            args={[0.18, 0.1, 0.09]}
            radius={0.04}
            smoothness={3}
            position={[0.08, 0.12, 0.142]}
            rotation={[0.1, 0, 0.22]}
            castShadow
          >
            <meshStandardMaterial color="#462e24" roughness={0.72} />
          </RoundedBox>
          {/* 两侧鬓角 */}
          <RoundedBox
            args={[0.06, 0.2, 0.24]}
            radius={0.025}
            smoothness={2}
            position={[-0.165, 0.04, 0.01]}
          >
            <meshStandardMaterial color="#3b261e" roughness={0.75} />
          </RoundedBox>
          <RoundedBox
            args={[0.06, 0.2, 0.24]}
            radius={0.025}
            smoothness={2}
            position={[0.165, 0.04, 0.01]}
          >
            <meshStandardMaterial color="#3b261e" roughness={0.75} />
          </RoundedBox>

          {/* 眼睛与眉毛（躺床小憩时呈现闭合弯眉） */}
          {posture === 'sleeping' ? (
            <>
              <mesh position={[-0.075, -0.01, 0.168]}>
                <boxGeometry args={[0.055, 0.012, 0.01]} />
                <meshBasicMaterial color="#3b261e" />
              </mesh>
              <mesh position={[0.075, -0.01, 0.168]}>
                <boxGeometry args={[0.055, 0.012, 0.01]} />
                <meshBasicMaterial color="#3b261e" />
              </mesh>
            </>
          ) : (
            <>
              <mesh position={[-0.075, -0.01, 0.165]}>
                <sphereGeometry args={[0.024, 12, 12]} />
                <meshBasicMaterial color="#1e293b" />
              </mesh>
              <mesh position={[-0.068, -0.002, 0.184]}>
                <sphereGeometry args={[0.008, 8, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>

              <mesh position={[0.075, -0.01, 0.165]}>
                <sphereGeometry args={[0.024, 12, 12]} />
                <meshBasicMaterial color="#1e293b" />
              </mesh>
              <mesh position={[0.082, -0.002, 0.184]}>
                <sphereGeometry args={[0.008, 8, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </>
          )}

          {/* 眉毛 */}
          <mesh position={[-0.075, 0.042, 0.166]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.058, 0.014, 0.012]} />
            <meshBasicMaterial color="#3b261e" />
          </mesh>
          <mesh position={[0.075, 0.042, 0.166]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.058, 0.014, 0.012]} />
            <meshBasicMaterial color="#3b261e" />
          </mesh>

          {/* 鼻子与脸颊红晕 */}
          <mesh position={[0, -0.032, 0.172]}>
            <sphereGeometry args={[0.018, 10, 10]} />
            <meshStandardMaterial color="#e5af90" roughness={0.5} />
          </mesh>
          <mesh position={[-0.1, -0.04, 0.158]}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshBasicMaterial color="#fda4af" transparent opacity={0.45} />
          </mesh>
          <mesh position={[0.1, -0.04, 0.158]}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshBasicMaterial color="#fda4af" transparent opacity={0.45} />
          </mesh>
        </group>
      </group>

      {/* 头顶交互提示或状态气泡 */}
      {controlsEnabled && (statusBubble || posture === 'sleeping' || nearbyItem) && (
        <Html
          position={[0, posture === 'sleeping' ? 0.85 : 1.78, 0]}
          center
          zIndexRange={[20, 0]}
        >
          <div className="protagonist-bubble">
            {posture === 'sleeping' ? (
              <span className="protagonist-bubble-sleep">Zzz... 小憩中（按任意方向键或 [E] 起床）</span>
            ) : statusBubble ? (
              <span>{statusBubble}</span>
            ) : nearbyItem ? (
              <span>
                按 <kbd>E</kbd> 互动：{nearbyItem.label}
              </span>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
};
