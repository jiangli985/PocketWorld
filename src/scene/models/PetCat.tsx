import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { InteractableId } from '../../types/interactable';

interface PetCatProps {
  hoveredId: InteractableId | null;
  onHoverChange: (id: InteractableId | null) => void;
  onInteract: (id: InteractableId) => void;
  pettedAt: number;
  characterPos: [number, number, number];
}

export const PetCat: React.FC<PetCatProps> = ({
  hoveredId,
  onHoverChange,
  onInteract,
  pettedAt,
  characterPos,
}) => {
  const catGroupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const heartsRef = useRef<THREE.Group>(null);

  const isHovered = hoveredId === 'pet';

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const sincePet = (performance.now() - pettedAt) / 1000;
    const isHappy = pettedAt > 0 && sincePet < 2.2;

    if (catGroupRef.current) {
      // 呼吸起伏 + 抚摸时开心轻跳
      const breath = 1 + Math.sin(t * 2.6) * 0.025;
      catGroupRef.current.scale.set(1, breath, 1);

      if (isHappy && sincePet < 0.65) {
        catGroupRef.current.position.y =
          0.08 + Math.abs(Math.sin((sincePet / 0.65) * Math.PI * 2)) * 0.24;
      } else {
        catGroupRef.current.position.y = 0.08;
      }
    }

    // 头部轻微呼吸偏转并朝向靠近的主角
    if (headRef.current) {
      const dx = characterPos[0] - 0.58;
      const dz = characterPos[2] - 1.78;
      const dist = Math.hypot(dx, dz);

      if (dist < 2.3) {
        const targetYaw = THREE.MathUtils.clamp(Math.atan2(dx, dz) - 0.45, -0.55, 0.55);
        headRef.current.rotation.y = THREE.MathUtils.lerp(
          headRef.current.rotation.y,
          targetYaw,
          0.08
        );
      } else {
        headRef.current.rotation.y = Math.sin(t * 1.1) * 0.16;
      }
      headRef.current.rotation.z = isHappy
        ? Math.sin(t * 10) * 0.14
        : Math.sin(t * 1.7) * 0.05;
    }

    // 尾巴摆动（互动时欢快加速）
    if (tailRef.current) {
      const speed = isHappy ? 9.5 : 2.4;
      const amp = isHappy ? 0.45 : 0.24;
      tailRef.current.rotation.z = Math.sin(t * speed) * amp;
      tailRef.current.rotation.x = -0.45 + Math.cos(t * 1.8) * 0.08;
    }

    // 抚摸时的爱心粒子上浮
    if (heartsRef.current) {
      heartsRef.current.visible = isHappy;
      if (isHappy) {
        heartsRef.current.children.forEach((heart, idx) => {
          const p = ((sincePet * 1.1 + idx * 0.28) % 1);
          heart.position.y = 0.48 + p * 0.58;
          heart.position.x = Math.sin(sincePet * 5 + idx * 2) * 0.14;
          const s = Math.sin(p * Math.PI);
          heart.scale.setScalar(Math.max(0.01, s));
        });
      }
    }
  });

  return (
    <group
      name="Interactable_Pet"
      position={[0.58, 0.04, 1.78]}
      rotation={[0, 0.45, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverChange('pet');
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverChange(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onInteract('pet');
      }}
    >
      {/* 针织圆形猫窝软垫 */}
      <mesh position={[0, 0.04, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.38, 0.42, 0.08, 28]} />
        <meshStandardMaterial color="#e7d8c9" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.35, 0.055, 14, 28]} />
        <meshStandardMaterial color="#d6c2ae" roughness={0.85} />
      </mesh>

      {/* 猫咪食盆 */}
      <group position={[-0.48, 0.035, -0.18]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.11, 0.13, 0.07, 18]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.09, 16]} />
          <meshStandardMaterial color="#b45309" roughness={0.8} />
        </mesh>
      </group>

      {/* 橘猫「团子」主体 */}
      <group ref={catGroupRef} position={[0, 0.08, 0]}>
        {/* 身体躯干 */}
        <RoundedBox
          args={[0.32, 0.24, 0.44]}
          radius={0.11}
          smoothness={4}
          position={[0, 0.14, -0.02]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#ea8a35"
            roughness={0.68}
            emissive={isHovered ? '#fb923c' : '#000000'}
            emissiveIntensity={isHovered ? 0.26 : 0}
          />
        </RoundedBox>

        {/* 背部深橘色虎斑条纹 */}
        {[-0.12, 0, 0.1].map((tz, i) => (
          <RoundedBox
            key={i}
            args={[0.26, 0.03, 0.055]}
            radius={0.012}
            smoothness={2}
            position={[0, 0.255, tz]}
          >
            <meshStandardMaterial color="#b45309" roughness={0.72} />
          </RoundedBox>
        ))}

        {/* 胸前奶白绒毛围脖 */}
        <mesh position={[0, 0.15, 0.18]} scale={[0.88, 0.92, 0.55]} castShadow>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#fffbeb" roughness={0.75} />
        </mesh>

        {/* 四只雪白猫爪 */}
        {[
          [-0.09, 0.04, 0.18],
          [0.09, 0.04, 0.18],
          [-0.11, 0.04, -0.15],
          [0.11, 0.04, -0.15],
        ].map(([px, py, pz], idx) => (
          <mesh key={`paw-${idx}`} position={[px, py, pz]} scale={[1, 0.65, 1.25]} castShadow>
            <sphereGeometry args={[0.058, 12, 12]} />
            <meshStandardMaterial color="#fffbeb" roughness={0.7} />
          </mesh>
        ))}

        {/* 猫头与五官 */}
        <group ref={headRef} position={[0, 0.31, 0.18]}>
          {/* 圆润头部 */}
          <mesh scale={[1.06, 0.95, 0.98]} castShadow>
            <sphereGeometry args={[0.165, 22, 22]} />
            <meshStandardMaterial
              color="#ea8a35"
              roughness={0.65}
              emissive={isHovered ? '#fb923c' : '#000000'}
              emissiveIntensity={isHovered ? 0.22 : 0}
            />
          </mesh>

          {/* 脸颊奶白毛团 */}
          <mesh position={[-0.055, -0.035, 0.13]} scale={[1.1, 0.85, 0.8]}>
            <sphereGeometry args={[0.058, 14, 14]} />
            <meshStandardMaterial color="#fffbeb" roughness={0.7} />
          </mesh>
          <mesh position={[0.055, -0.035, 0.13]} scale={[1.1, 0.85, 0.8]}>
            <sphereGeometry args={[0.058, 14, 14]} />
            <meshStandardMaterial color="#fffbeb" roughness={0.7} />
          </mesh>

          {/* 粉嫩鼻头 */}
          <mesh position={[0, -0.012, 0.172]}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshStandardMaterial color="#fb7185" roughness={0.4} />
          </mesh>

          {/* 翠绿猫眼与高光 */}
          <group position={[-0.068, 0.028, 0.145]}>
            <mesh>
              <sphereGeometry args={[0.028, 12, 12]} />
              <meshStandardMaterial color="#10b981" roughness={0.15} />
            </mesh>
            <mesh position={[0, 0, 0.018]} scale={[0.45, 0.9, 0.5]}>
              <sphereGeometry args={[0.018, 10, 10]} />
              <meshBasicMaterial color="#0f172a" />
            </mesh>
          </group>
          <group position={[0.068, 0.028, 0.145]}>
            <mesh>
              <sphereGeometry args={[0.028, 12, 12]} />
              <meshStandardMaterial color="#10b981" roughness={0.15} />
            </mesh>
            <mesh position={[0, 0, 0.018]} scale={[0.45, 0.9, 0.5]}>
              <sphereGeometry args={[0.018, 10, 10]} />
              <meshBasicMaterial color="#0f172a" />
            </mesh>
          </group>

          {/* 左右立耳与粉色耳廓 */}
          <group position={[-0.1, 0.14, 0.01]} rotation={[0.15, 0, 0.35]}>
            <mesh castShadow>
              <coneGeometry args={[0.068, 0.14, 4]} />
              <meshStandardMaterial color="#d97706" roughness={0.65} />
            </mesh>
            <mesh position={[0, -0.01, 0.022]} scale={[0.65, 0.72, 0.5]}>
              <coneGeometry args={[0.055, 0.11, 4]} />
              <meshStandardMaterial color="#fda4af" roughness={0.6} />
            </mesh>
          </group>
          <group position={[0.1, 0.14, 0.01]} rotation={[0.15, 0, -0.35]}>
            <mesh castShadow>
              <coneGeometry args={[0.068, 0.14, 4]} />
              <meshStandardMaterial color="#d97706" roughness={0.65} />
            </mesh>
            <mesh position={[0, -0.01, 0.022]} scale={[0.65, 0.72, 0.5]}>
              <coneGeometry args={[0.055, 0.11, 4]} />
              <meshStandardMaterial color="#fda4af" roughness={0.6} />
            </mesh>
          </group>
        </group>

        {/* 条纹长尾巴 */}
        <group ref={tailRef} position={[0, 0.16, -0.22]}>
          <mesh position={[0, 0.11, -0.08]} rotation={[-0.55, 0, 0]} castShadow>
            <cylinderGeometry args={[0.032, 0.038, 0.28, 12]} />
            <meshStandardMaterial color="#ea8a35" roughness={0.68} />
          </mesh>
          <mesh position={[0, 0.24, -0.16]}>
            <sphereGeometry args={[0.036, 12, 12]} />
            <meshStandardMaterial color="#fffbeb" roughness={0.7} />
          </mesh>
        </group>
      </group>

      {/* 互动时的浮动爱心粒子 */}
      <group ref={heartsRef} visible={false}>
        {[0, 1, 2].map((idx) => (
          <mesh key={idx} position={[0, 0.55, 0]}>
            <octahedronGeometry args={[0.055, 1]} />
            <meshBasicMaterial color="#fb7185" />
          </mesh>
        ))}
      </group>
    </group>
  );
};
