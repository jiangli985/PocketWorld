import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
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

const HAIR_TUFTS = [
  { x: -0.12, y: 0.1, z: 0.12, tilt: 0.55, size: 0.85 },
  { x: -0.06, y: 0.12, z: 0.145, tilt: 0.3, size: 1 },
  { x: 0.01, y: 0.125, z: 0.152, tilt: 0.05, size: 1.05 },
  { x: 0.075, y: 0.115, z: 0.14, tilt: -0.3, size: 0.95 },
  { x: 0.13, y: 0.095, z: 0.11, tilt: -0.55, size: 0.8 },
];

function createTorsoGeometry() {
  const profile = [
    [0, -0.27],
    [0.17, -0.27],
    [0.2, -0.22],
    [0.205, -0.05],
    [0.212, 0.12],
    [0.192, 0.22],
    [0.13, 0.27],
    [0.07, 0.29],
    [0, 0.29],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 40);
}
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
  const torsoGeometry = useMemo(createTorsoGeometry, []);

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
        {/* 胯部：连接双腿与上衣下摆 */}
        <mesh position={[0, 0.56, 0]} scale={[1, 0.55, 0.72]} castShadow>
          <sphereGeometry args={[0.185, 24, 16]} />
          <meshStandardMaterial color="#2b3a4f" roughness={0.78} />
        </mesh>

        {/* ---------------- 双腿与运动鞋 ---------------- */}
        {([
          [leftLegRef, -0.095],
          [rightLegRef, 0.095],
        ] as const).map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 0.54, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow receiveShadow>
              <capsuleGeometry args={[0.07, 0.3, 6, 16]} />
              <meshStandardMaterial color="#2b3a4f" roughness={0.78} />
            </mesh>
            <mesh position={[0, -0.41, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.07, 0.018, 8, 20]} />
              <meshStandardMaterial color="#475569" roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.48, 0.04]} scale={[0.95, 0.62, 1.5]} castShadow>
              <sphereGeometry args={[0.085, 20, 14]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.45} />
            </mesh>
            <mesh position={[0, -0.515, 0.04]} scale={[1, 1, 1.55]}>
              <cylinderGeometry args={[0.085, 0.085, 0.025, 24]} />
              <meshStandardMaterial color="#d97706" roughness={0.6} />
            </mesh>
          </group>
        ))}

        {/* ---------------- 上半身连帽衫 ---------------- */}
        <group position={[0, 0.84, 0]}>
          <mesh geometry={torsoGeometry} scale={[1, 1, 0.7]} castShadow receiveShadow>
            <meshStandardMaterial color="#3b7a8c" roughness={0.72} />
          </mesh>
          {/* 下摆罗纹 */}
          <mesh position={[0, -0.25, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.7, 1]}>
            <torusGeometry args={[0.185, 0.026, 10, 32]} />
            <meshStandardMaterial color="#326978" roughness={0.75} />
          </mesh>
          {/* 背后兜帽 */}
          <mesh position={[0, 0.22, -0.1]} scale={[1.15, 0.72, 0.62]} castShadow>
            <sphereGeometry args={[0.13, 20, 14]} />
            <meshStandardMaterial color="#326978" roughness={0.75} />
          </mesh>
          {/* 领口内搭 */}
          <mesh position={[0, 0.25, 0.05]} scale={[0.75, 0.4, 0.45]}>
            <sphereGeometry args={[0.1, 16, 12]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.65} />
          </mesh>
          {/* 抽绳 */}
          {[-0.045, 0.045].map((x) => (
            <group key={x} position={[x, 0.15, 0.142]}>
              <mesh>
                <cylinderGeometry args={[0.007, 0.007, 0.12, 6]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.6} />
              </mesh>
              <mesh position={[0, -0.065, 0]}>
                <sphereGeometry args={[0.013, 8, 8]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.5} />
              </mesh>
            </group>
          ))}
          {/* 袋鼠兜 */}
          <mesh position={[0, -0.12, 0.122]} scale={[1.7, 0.75, 0.38]}>
            <sphereGeometry args={[0.08, 20, 12]} />
            <meshStandardMaterial color="#336f80" roughness={0.75} />
          </mesh>

          {/* 脖颈挂置的复古头戴式监听耳机 */}
          <mesh position={[0, 0.27, 0.02]} rotation={[Math.PI / 2 + 0.2, 0, 0]}>
            <torusGeometry args={[0.13, 0.02, 12, 28]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.35} />
          </mesh>
          {[-0.125, 0.125].map((x) => (
            <mesh key={x} position={[x, 0.25, 0.08]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.046, 0.046, 0.04, 20]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.3} />
            </mesh>
          ))}
        </group>

        {/* ---------------- 左右摆动手臂 ---------------- */}
        {([
          [leftArmRef, -0.265],
          [rightArmRef, 0.265],
        ] as const).map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 1.05, 0]}>
            <mesh position={[0, -0.16, 0]} castShadow>
              <capsuleGeometry args={[0.062, 0.26, 6, 16]} />
              <meshStandardMaterial color="#3b7a8c" roughness={0.72} />
            </mesh>
            <mesh position={[0, -0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.058, 0.016, 8, 20]} />
              <meshStandardMaterial color="#326978" roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.39, 0]} scale={[0.9, 1.05, 0.85]} castShadow>
              <sphereGeometry args={[0.058, 16, 16]} />
              <meshStandardMaterial color="#f4c7ab" roughness={0.55} />
            </mesh>
          </group>
        ))}

        {/* ---------------- 头部、五官与蓬松发型 ---------------- */}
        <group ref={headRef} position={[0, 1.32, 0]}>
          <mesh position={[0, -0.17, 0]}>
            <cylinderGeometry args={[0.06, 0.07, 0.1, 16]} />
            <meshStandardMaterial color="#eab89b" roughness={0.55} />
          </mesh>

          <mesh scale={[1, 0.97, 0.95]} castShadow receiveShadow>
            <sphereGeometry args={[0.19, 40, 32]} />
            <meshStandardMaterial color="#f4c7ab" roughness={0.52} />
          </mesh>

          {[-0.188, 0.188].map((x) => (
            <mesh key={x} position={[x, -0.025, 0.01]} scale={[0.6, 1, 0.8]}>
              <sphereGeometry args={[0.045, 14, 14]} />
              <meshStandardMaterial color="#eab89b" roughness={0.55} />
            </mesh>
          ))}

          {/* 头发主体：向后上方偏移的球壳，露出脸部 */}
          <mesh position={[0, 0.045, -0.045]} scale={[1.02, 1, 1]} castShadow>
            <sphereGeometry args={[0.205, 40, 32]} />
            <meshStandardMaterial color="#3b261e" roughness={0.75} />
          </mesh>
          {/* 刘海发束 */}
          {HAIR_TUFTS.map(({ x, y, z, tilt, size }) => (
            <mesh
              key={x}
              position={[x, y, z]}
              rotation={[0.45, 0, tilt]}
              scale={[0.75 * size, 1.35 * size, 0.55 * size]}
              castShadow
            >
              <sphereGeometry args={[0.055, 16, 12]} />
              <meshStandardMaterial color="#462e24" roughness={0.72} />
            </mesh>
          ))}
          {/* 头顶呆毛 */}
          <mesh position={[0.02, 0.255, 0]} rotation={[0, Math.PI / 2, -0.4]}>
            <torusGeometry args={[0.045, 0.011, 8, 16, Math.PI * 1.2]} />
            <meshStandardMaterial color="#3b261e" roughness={0.75} />
          </mesh>

          {/* 眼睛（躺床小憩时为弯弯的闭眼） */}
          {[-0.068, 0.068].map((x) =>
            posture === 'sleeping' ? (
              <mesh key={x} position={[x, -0.015, 0.168]} rotation={[0, 0, Math.PI]}>
                <torusGeometry args={[0.022, 0.006, 6, 16, Math.PI]} />
                <meshBasicMaterial color="#3b261e" />
              </mesh>
            ) : (
              <group key={x} position={[x, -0.012, 0.16]}>
                <mesh scale={[0.8, 1.15, 0.5]}>
                  <sphereGeometry args={[0.028, 16, 16]} />
                  <meshBasicMaterial color="#1e293b" />
                </mesh>
                <mesh position={[0.007, 0.01, 0.013]}>
                  <sphereGeometry args={[0.008, 8, 8]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            )
          )}

          {/* 眉毛 */}
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.046, 0.164]} rotation={[0, 0, Math.PI / 2 + Math.sign(x) * 0.12]}>
              <capsuleGeometry args={[0.006, 0.035, 4, 8]} />
              <meshBasicMaterial color="#3b261e" />
            </mesh>
          ))}

          {/* 微笑嘴巴 */}
          <mesh position={[0, -0.07, 0.165]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.018, 0.005, 6, 16, Math.PI]} />
            <meshBasicMaterial color="#9a4a3a" />
          </mesh>

          {/* 脸颊红晕 */}
          {[-0.105, 0.105].map((x) => (
            <mesh key={x} position={[x, -0.05, 0.145]} scale={[1.2, 0.7, 0.4]}>
              <sphereGeometry args={[0.024, 12, 12]} />
              <meshBasicMaterial color="#fda4af" transparent opacity={0.5} />
            </mesh>
          ))}
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
