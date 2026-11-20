import React, { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AssetBoundary } from './ReusableAsset';
import { createCatMotion, loadCatClips } from './cat/catMotion';
import { CAT_HOME, CAT_YAW, CAT_MAT_Y, CAT_CUSHION_TOP as CUSHION_TOP } from './cabinLayout';
import { CAT_WALK_SPEED, CAT_WALK_STRIDE, chooseCatReturnDirection, planCatWalk, sampleCatWalk } from './cat/catWalk';

const MODEL = `${import.meta.env.BASE_URL}models/cat/cat.glb`;
const PET_DURATION = 2.2;
const RUN_SPEED = .6;
const RUN_STRIDE = .30;
const RUN_OUT_DISTANCE = .65;

interface CatProps {
  resident: RefObject<THREE.Group>;
  value: number;
  command?: string;
  reducedMotion: boolean;
  location: React.MutableRefObject<[number, number]>;
  canWalk?: (x: number, z: number) => boolean;
}

type PetMotion = { time: number; remaining: number; value: number; pet: boolean; goHome: boolean; x: number; z: number };

function joint(scene: THREE.Object3D, name: string) {
  const node = scene.getObjectByName(name);
  if (!(node instanceof THREE.Bone) || !node.parent) throw new Error(`Missing cat model joint: ${name}`);
  const parentSpace = node.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    node,
    rest: node.quaternion.clone(),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(parentSpace),
    forward: new THREE.Vector3(0, 0, 1).applyQuaternion(parentSpace),
  };
}

function tailWag(time: number, strength: number, phase = 0) {
  return Math.sin(time * 2.2 - phase) * 0.14 + Math.sin(time * 10 - phase) * 0.20 * strength;
}

function CatModel({ resident, motion, reducedMotion, location, canWalk }: Omit<CatProps, 'value' | 'command'> & { motion: PetMotion }) {
  const { scene } = useGLTF(MODEL);
  const pivot = useRef<THREE.Group>(null);
  const yaw = useRef(0);
  const walk = useRef({ route: null as ReturnType<typeof planCatWalk>, distance: 0, cycles: 0, weight: 0,
    returning: 0 as 0 | -1 | 1, speed: CAT_WALK_SPEED, runOut: false, runOutNext: false,
    position: new THREE.Vector3(), tangent: new THREE.Vector3() }).current;
  const idleMotion = useRef<ReturnType<typeof createCatMotion>>(null);
  const model = useMemo(() => {
    const object = clone(scene);
    object.name = 'CatModel';
    object.updateMatrixWorld(true);
    // The Blender export faces +Z. Convert the model's pose axes into each joint's parent space.
    const head = joint(object, 'Cat_Head');
    const tail = joint(object, 'Cat_TailBase');
    const tailMid = joint(object, 'Cat_TailMid');
    const bounds = new THREE.Box3().setFromObject(object, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 0.62 / Math.max(size.x, size.z);
    const offset = new THREE.Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    object.scale.setScalar(scale);
    object.position.copy(offset);
    const skeletons = new Set<THREE.Skeleton>();
    object.traverse(child => {
      if (child instanceof THREE.SkinnedMesh) {
        child.castShadow = child.receiveShadow = true;
        skeletons.add(child.skeleton);
      }
    });
    const restore = () => {
      head.node.quaternion.copy(head.rest);
      tail.node.quaternion.copy(tail.rest);
      tailMid.node.quaternion.copy(tailMid.rest);
    };
    return { object, head, tail, tailMid, skeletons, restore,
      rotation: new THREE.Quaternion(), target: new THREE.Vector3() };
  }, [scene]);
  useEffect(() => {
    if (reducedMotion) return;
    let live = true;
    void loadCatClips().then(clips => {
      if (live) idleMotion.current = createCatMotion(model.object, clips);
    }).catch(() => {
      // Keep the standing pose and pet feedback if the optional motion asset fails to load.
    });
    return () => {
      live = false;
      idleMotion.current?.dispose();
      idleMotion.current = null;
    };
  }, [model, reducedMotion]);
  useEffect(() => () => model.skeletons.forEach(skeleton => skeleton.dispose()), [model]);

  useFrame((_, delta) => {
    const group = pivot.current;
    if (!group) return;
    const { head, tail, tailMid, rotation, target } = model;
    const { time, remaining, pet, goHome } = motion;
    const dt = Math.min(delta, 0.05);
    const player = idleMotion.current;
    const walkPlayer = player?.walk;
    const route = walk.route;
    if (goHome && route && !walk.returning && canWalk) {
      walk.returning = chooseCatReturnDirection(route, walk.distance, canWalk);
    } else if (goHome && !route) {
      walk.runOutNext = true;
      player?.settleAtHome(THREE.MathUtils.randFloat(5, 9));
    }
    if (route && walkPlayer && !reducedMotion) {
      const direction = walk.returning || 1;
      const quick = walk.returning || (walk.runOut && walk.distance < RUN_OUT_DISTANCE);
      walk.speed = THREE.MathUtils.damp(walk.speed, quick ? RUN_SPEED : CAT_WALK_SPEED, 9, dt);
      const stride = THREE.MathUtils.mapLinear(walk.speed, CAT_WALK_SPEED, RUN_SPEED, CAT_WALK_STRIDE, RUN_STRIDE);
      const next = THREE.MathUtils.clamp(walk.distance + dt * walk.speed * direction, 0, route.length);
      sampleCatWalk(route, next, walk.position, walk.tangent, direction);
      const moving = remaining <= 0 && !!canWalk?.(CAT_HOME[0] + walk.position.x, CAT_HOME[1] + walk.position.z);
      if (moving) {
        walk.cycles += Math.abs(next - walk.distance) / stride;
        walk.distance = next;
      }
      walk.weight = THREE.MathUtils.damp(walk.weight, moving ? 1 : 0, 14, dt);
      const { yaw, weight } = sampleCatWalk(route, walk.distance, walk.position, walk.tangent, direction);
      walkPlayer.sample(walk.cycles, weight * walk.weight);
      group.position.copy(walk.position);
      group.position.y -= CAT_MAT_Y;
      const turn = yaw - group.rotation.y;
      group.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-dt * 12));
      location.current[0] = CAT_HOME[0] + walk.position.x;
      location.current[1] = CAT_HOME[1] + walk.position.z;
      motion.x = walk.position.x;
      motion.z = walk.position.z;
      if (walk.distance !== (direction < 0 ? 0 : route.length)) return;
    }
    if (route) {
      walk.runOutNext ||= !!walk.returning;
      player?.settleAtHome(walk.returning ? THREE.MathUtils.randFloat(5, 9) : THREE.MathUtils.randFloat(8, 18));
      walk.route = null;
      walk.distance = 0;
      walk.cycles = 0;
      walk.returning = 0;
      walk.speed = CAT_WALK_SPEED;
      walk.weight = 0;
      walkPlayer?.stop();
      group.position.set(0, CUSHION_TOP, 0);
      group.rotation.y = CAT_YAW;
      location.current[0] = CAT_HOME[0];
      location.current[1] = CAT_HOME[1];
      motion.x = 0;
      motion.z = 0;
    }
    const pose = player?.update(dt, pet, remaining > 0, reducedMotion, model.restore);
    if (pose?.walkReady && canWalk && walkPlayer) {
      walk.route = planCatWalk(canWalk);
      if (walk.route) {
        walk.runOut = walk.runOutNext;
        walk.runOutNext = false;
        model.restore();
        walkPlayer.sample(0, 0);
        return;
      }
    }
    const strength = reducedMotion || pose?.standing === false ? 0 : Math.min(remaining * 4, 1);
    group.position.y = CUSHION_TOP + Math.sin((PET_DURATION - remaining) * 9) ** 2 * 0.08 * strength;
    if (pose?.standing === false) return;
    const idle = pose?.idle ?? (reducedMotion ? 0 : 1);
    if (resident.current && !reducedMotion) {
      group.worldToLocal(resident.current.getWorldPosition(target));
      const direction = THREE.MathUtils.clamp(Math.atan2(target.x, target.z), -0.27, 0.27);
      yaw.current = THREE.MathUtils.damp(yaw.current, direction, 5, dt);
    } else yaw.current = 0;
    head.node.quaternion.copy(head.rest)
      .premultiply(rotation.setFromAxisAngle(head.up, yaw.current * idle))
      .premultiply(rotation.setFromAxisAngle(head.forward, Math.sin(time * 9) * 0.10 * strength));
    tail.node.quaternion.copy(tail.rest);
    tailMid.node.quaternion.copy(tailMid.rest);
    if (!reducedMotion) {
      tail.node.quaternion.premultiply(rotation.setFromAxisAngle(tail.up, idle * tailWag(time, strength)));
      tailMid.node.quaternion.premultiply(rotation.setFromAxisAngle(tailMid.up, 0.5 * idle * tailWag(time, strength, 0.7)));
    }
  });

  return <group ref={pivot} position-y={CUSHION_TOP} rotation-y={CAT_YAW}><primitive object={model.object} /></group>;
}

export function Cat({ resident, value, command, reducedMotion, location, canWalk }: CatProps) {
  const motion = useRef<PetMotion>({ time: 0, remaining: 0, value, pet: false, goHome: false, x: 0, z: 0 }).current;
  const sparks = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    motion.time += dt;
    const changed = value > motion.value;
    motion.goHome = changed && command === 'home';
    motion.pet = changed && !motion.goHome;
    if (motion.pet) motion.remaining = PET_DURATION;
    if (motion.goHome) motion.remaining = 0;
    motion.value = value;
    motion.remaining = Math.max(0, motion.remaining - dt);
    if (!sparks.current) return;
    sparks.current.visible = motion.remaining > 0;
    sparks.current.position.set(motion.x, 0, motion.z);
    if (!sparks.current.visible) return;
    sparks.current.children.forEach((child, i) => {
      const rise = reducedMotion ? 0.1 : ((PET_DURATION - motion.remaining + i * 0.25) % 1.1) * 0.45;
      child.position.set(Math.sin(i * 2.1) * 0.22, 0.65 + rise, Math.cos(i * 2.1) * 0.15);
      child.scale.setScalar(reducedMotion ? 0.7 : Math.min(1, motion.remaining * 3) * 0.7);
    });
  }, -1);

  return <>
    <mesh position={[0, 0.04, 0]} castShadow receiveShadow><cylinderGeometry args={[0.37, 0.41, 0.08, 28]} /><meshStandardMaterial color="#d5c3aa" roughness={0.9} /></mesh>
    <mesh position={[0, CUSHION_TOP, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.34, 0.045, 12, 28]} /><meshStandardMaterial color="#c4ad90" /></mesh>
    <AssetBoundary><Suspense fallback={null}><CatModel resident={resident} motion={motion} reducedMotion={reducedMotion} location={location} canWalk={canWalk} /></Suspense></AssetBoundary>
    <group ref={sparks} name="CatPetSparks" visible={false}>
      {[0, 1, 2].map(i => <mesh key={i}><octahedronGeometry args={[0.045, 1]} /><meshBasicMaterial color="#e5ac9e" /></mesh>)}
    </group>
  </>;
}
