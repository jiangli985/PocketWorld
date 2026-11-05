import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { RoomLightingState } from '../../types/interactable';
import { createDrapeGeometry } from '../geometry';

interface RoomDecorProps {
  lighting: RoomLightingState;
}

const UP = new THREE.Vector3(0, 1, 0);

const WallClock: React.FC<{ isNight: boolean }> = ({ isNight }) => {
  const hourRef = useRef<THREE.Group>(null);
  const minuteRef = useRef<THREE.Group>(null);
  const secondRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    if (secondRef.current) secondRef.current.rotation.z = -(seconds / 60) * Math.PI * 2;
    if (minuteRef.current) minuteRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (hourRef.current) hourRef.current.rotation.z = -(hours / 12) * Math.PI * 2;
  });

  return (
    <group position={[-3.86, 3.15, -1.85]} rotation={[0, Math.PI / 2, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 48]} />
        <meshStandardMaterial
          color="#fbf4e6"
          roughness={0.6}
          emissive="#fde68a"
          emissiveIntensity={isNight ? 0.18 : 0}
        />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <torusGeometry args={[0.3, 0.035, 14, 48]} />
        <meshStandardMaterial color="#a46c56" roughness={0.45} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const major = i % 3 === 0;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.23, Math.cos(angle) * 0.23, 0.028]}
            rotation={[0, 0, -angle]}
          >
            <boxGeometry args={[major ? 0.022 : 0.012, major ? 0.05 : 0.03, 0.005]} />
            <meshBasicMaterial color="#5c3a2d" />
          </mesh>
        );
      })}
      <group ref={hourRef} position={[0, 0, 0.032]}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.024, 0.13, 0.006]} />
          <meshBasicMaterial color="#3d2c35" />
        </mesh>
      </group>
      <group ref={minuteRef} position={[0, 0, 0.038]}>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.016, 0.19, 0.006]} />
          <meshBasicMaterial color="#3d2c35" />
        </mesh>
      </group>
      <group ref={secondRef} position={[0, 0, 0.044]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.006, 0.22, 0.004]} />
          <meshBasicMaterial color="#e11d48" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.048]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshStandardMaterial color="#e11d48" roughness={0.4} />
      </mesh>
    </group>
  );
};

const WindowCurtains: React.FC<{ isDay: boolean }> = ({ isDay }) => {
  const drapeGeometry = useMemo(() => createDrapeGeometry(0.48, 1.74, 3, 0.04), []);
  const curtainColor = '#efe2cf';

  return (
    <group position={[-1.5, 3.95, -3.74]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, 2.2, 12]} />
        <meshStandardMaterial color="#8d5945" roughness={0.45} metalness={0.2} />
      </mesh>
      {[-1.12, 1.12].map((x) => (
        <mesh key={x} position={[x, 0, 0]} castShadow>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#8d5945" roughness={0.4} metalness={0.2} />
        </mesh>
      ))}
      {[-0.88, 0.88].map((x) => (
        <group key={x} position={[x, 0, -0.04]}>
          <mesh geometry={drapeGeometry} position={[0, -0.9, 0]} castShadow receiveShadow>
            <meshStandardMaterial
              color={curtainColor}
              roughness={0.92}
              side={THREE.DoubleSide}
              emissive={isDay ? '#fcd34d' : '#1e3a8a'}
              emissiveIntensity={isDay ? 0.12 : 0.05}
            />
          </mesh>
          {[-0.18, -0.06, 0.06, 0.18].map((rx) => (
            <mesh key={rx} position={[rx, 0, 0.04]}>
              <torusGeometry args={[0.03, 0.007, 8, 16]} />
              <meshStandardMaterial color="#6b4434" roughness={0.4} metalness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

const FloorPouf: React.FC = () => (
  <group position={[1.6, 0, 2.95]}>
    <mesh position={[0, 0.2, 0]} scale={[1, 0.62, 1]} castShadow receiveShadow>
      <sphereGeometry args={[0.36, 40, 24]} />
      <meshStandardMaterial color="#d9a48f" roughness={0.95} />
    </mesh>
    <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.355, 0.018, 10, 48]} />
      <meshStandardMaterial color="#c08872" roughness={0.9} />
    </mesh>
    <mesh position={[0, 0.42, 0]} scale={[1, 0.5, 1]}>
      <sphereGeometry args={[0.035, 12, 12]} />
      <meshStandardMaterial color="#a8705c" roughness={0.8} />
    </mesh>
    {/* 搭在坐墩上的毛线团与棒针 */}
    <mesh position={[0.12, 0.47, 0.08]} castShadow>
      <sphereGeometry args={[0.085, 20, 16]} />
      <meshStandardMaterial color="#8fb3a0" roughness={1} />
    </mesh>
    <mesh position={[0.1, 0.5, 0.08]} rotation={[0.4, 0, 1.1]}>
      <cylinderGeometry args={[0.006, 0.006, 0.32, 8]} />
      <meshStandardMaterial color="#e2c79a" roughness={0.5} />
    </mesh>
  </group>
);

interface LeafSpec {
  key: number;
  stemPosition: THREE.Vector3;
  stemQuaternion: THREE.Quaternion;
  stemLength: number;
  tip: THREE.Vector3;
  yaw: number;
  droop: number;
  scale: number;
}

const FloorPlant: React.FC = () => {
  const potGeometry = useMemo(() => {
    const profile = [
      [0, 0],
      [0.2, 0],
      [0.24, 0.05],
      [0.27, 0.42],
      [0.31, 0.46],
      [0.31, 0.52],
      [0.26, 0.52],
      [0.24, 0.48],
      [0, 0.48],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(profile, 40);
  }, []);

  const leafGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.2, 0.08, 0.2, 0.42, 0, 0.55);
    shape.bezierCurveTo(-0.2, 0.42, -0.2, 0.08, 0, 0);
    return new THREE.ShapeGeometry(shape, 16);
  }, []);

  const leaves = useMemo<LeafSpec[]>(() => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const base = new THREE.Vector3(0, 0.46, 0);
    return Array.from({ length: 11 }).map((_, i) => {
      const yaw = i * golden;
      const height = 0.85 + (i % 4) * 0.22 + i * 0.03;
      const reach = 0.14 + (i % 3) * 0.06;
      const tip = new THREE.Vector3(Math.cos(yaw) * reach, height, Math.sin(yaw) * reach);
      const dir = tip.clone().sub(base);
      return {
        key: i,
        stemPosition: base.clone().add(tip).multiplyScalar(0.5),
        stemQuaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
        stemLength: dir.length(),
        tip,
        yaw,
        droop: 0.25 + (i % 3) * 0.18,
        scale: 0.85 + (i % 4) * 0.1,
      };
    });
  }, []);

  return (
    <group position={[3.25, 0, -3.25]}>
      <mesh geometry={potGeometry} castShadow receiveShadow>
        <meshStandardMaterial color="#c47a5a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.47, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 32]} />
        <meshStandardMaterial color="#3e2723" roughness={1} />
      </mesh>
      {leaves.map((leaf) => (
        <React.Fragment key={leaf.key}>
          <mesh position={leaf.stemPosition} quaternion={leaf.stemQuaternion}>
            <cylinderGeometry args={[0.008, 0.012, leaf.stemLength, 6]} />
            <meshStandardMaterial color="#4d7c3a" roughness={0.8} />
          </mesh>
          <group position={leaf.tip} rotation={[0, -leaf.yaw, 0]} scale={leaf.scale}>
            <group rotation={[0, 0, -leaf.droop]}>
              <mesh geometry={leafGeometry} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} castShadow>
                <meshStandardMaterial
                  color={leaf.key % 2 ? '#3f7d4e' : '#4f9460'}
                  roughness={0.6}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          </group>
        </React.Fragment>
      ))}
    </group>
  );
};

/**
 * 纯装饰陈设：窗帘、实时挂钟、坐墩、落地绿植与阳光中漂浮的尘埃
 */
export const RoomDecor: React.FC<RoomDecorProps> = ({ lighting }) => {
  const isDay = lighting.timeOfDay === 'day';

  return (
    <group name="Room_Decor">
      <WindowCurtains isDay={isDay} />
      <WallClock isNight={!isDay || !lighting.mainLightOn} />
      <FloorPouf />
      <FloorPlant />

      {/* 窗下木质小搁板与香薰蜡烛 */}
      <group position={[-3.86, 2.35, -2.6]}>
        <RoundedBox args={[0.22, 0.05, 0.62]} radius={0.015} smoothness={2} position={[0.1, 0, 0]} castShadow>
          <meshStandardMaterial color="#a46c56" roughness={0.55} />
        </RoundedBox>
        <mesh position={[0.1, 0.09, -0.15]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.13, 20]} />
          <meshStandardMaterial color="#f5ebe0" roughness={0.7} />
        </mesh>
        <mesh position={[0.1, 0.17, -0.15]}>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        <mesh position={[0.1, 0.1, 0.12]} castShadow>
          <sphereGeometry args={[0.075, 20, 16]} />
          <meshStandardMaterial color="#9fb7c9" roughness={0.3} metalness={0.1} />
        </mesh>
      </group>

      <Sparkles
        position={[-1.4, 1.6, -2.4]}
        scale={[1.6, 2.4, 2.2]}
        count={46}
        size={2.4}
        speed={0.25}
        opacity={isDay ? 0.75 : 0.4}
        color={isDay ? '#fff1c1' : '#bfdbfe'}
      />
    </group>
  );
};
