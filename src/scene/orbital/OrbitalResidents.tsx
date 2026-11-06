import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldActionKind, WorldModelProps } from '../../types/world';
import { ObjectHandle } from './ObjectHandle';

type Point = [number, number];
type Box = [number, number, number, number];
type Posture = 'standing' | 'chair' | 'bed';
type ResidentsProps = WorldModelProps & { walkTarget: [number, number, number] | null; onArrive: () => void; enabled: boolean };
const RADIUS = 0.23;
const CAT: Point = [-0.95, 1.95];
const HIP = 0.61;
const clamp = THREE.MathUtils.clamp;
const ease = (t: number) => t * t * (3 - 2 * t);
const angle = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

function layout(observatory: boolean) {
  const chair: Point = observatory ? [-1.65, 0.75] : [1.45, -0.85];
  const yaw = Math.PI + (observatory ? 0.22 : -0.05);
  const boxes: Box[] = [
    [-0.85, 2.95, -3.025, -1.675], // Desk, including the desktop overhang.
    [-4.04, -2.86, observatory ? -0.92 : -2.17, observatory ? -0.38 : -1.63],
    [chair[0] - (observatory ? 0.65 : 0.5), chair[0] + (observatory ? 0.65 : 0.5), chair[1] - 0.52, chair[1] + 0.58],
    ...(observatory ? [[-0.65, 0.15, 0.45, 1.25], [2.4, 3.1, 1.5, 2.2]] as Box[] : [[-3.46, -1.74, -0.32, 2.31], [-3.85, -3.25, 2.25, 2.85]] as Box[]),
  ];
  return { chair, yaw, seat: observatory ? 0.755 : 0.72, boxes: boxes.map(([a, b, c, d]) => [a - RADIUS, b + RADIUS, c - RADIUS, d + RADIUS] as Box) };
}
function free(point: Point, boxes: Box[]) {
  return point[0] >= -3.76 && point[0] <= 3.76 && point[1] >= -2.96 && point[1] <= 2.96 && !boxes.some(([a, b, c, d]) => point[0] > a && point[0] < b && point[1] > c && point[1] < d);
}
function reachable(point: Point, boxes: Box[]): Point {
  let result: Point = [clamp(point[0], -3.76, 3.76), clamp(point[1], -2.96, 2.96)];
  for (let pass = 0; pass < 8; pass++) {
    const box = boxes.find(([a, b, c, d]) => result[0] > a && result[0] < b && result[1] > c && result[1] < d);
    if (!box) break;
    const [a, b, c, d] = box;
    const candidates: Point[] = [[a - 0.015, result[1]], [b + 0.015, result[1]], [result[0], c - 0.015], [result[0], d + 0.015]];
    candidates.sort((p, q) => Math.hypot(p[0] - result[0], p[1] - result[1]) - Math.hypot(q[0] - result[0], q[1] - result[1]));
    result = candidates.find(p => free(p, boxes)) ?? candidates.find(p => p[0] >= -3.76 && p[0] <= 3.76 && p[1] >= -2.96 && p[1] <= 2.96) ?? [0.25, 0.5];
  }
  return result;
}
function clearSegment(p: Point, q: Point, boxes: Box[]) {
  const steps = Math.max(1, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 0.045));
  for (let i = 1; i <= steps; i++) if (!free([THREE.MathUtils.lerp(p[0], q[0], i / steps), THREE.MathUtils.lerp(p[1], q[1], i / steps)], boxes)) return false;
  return true;
}
/** A tiny visibility graph prevents a floor click behind the bed from stalling at its side. */
function route(start: Point, end: Point, boxes: Box[]): Point[] {
  const target = reachable(end, boxes);
  const nodes: Point[] = [start, target];
  boxes.forEach(([a, b, c, d]) => {
    for (const x of [a - 0.025, b + 0.025]) for (const z of [c - 0.025, d + 0.025]) if (free([x, z], boxes)) nodes.push([x, z]);
  });
  const distances = nodes.map((_, i) => i === 0 ? 0 : Infinity);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) {
      const path: Point[] = [];
      for (let i = 1; i !== 0; i = previous[i]) path.unshift(nodes[i]);
      return path;
    }
    visited.add(current);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      const distance = distances[current] + Math.hypot(nodes[i][0] - nodes[current][0], nodes[i][1] - nodes[current][1]);
      if (distance < distances[i] && clearSegment(nodes[current], nodes[i], boxes)) { distances[i] = distance; previous[i] = current; }
    }
  }
  return [];
}
function Ball({ position, scale = [1, 1, 1], radius, color }: { position: [number, number, number]; scale?: [number, number, number]; radius: number; color: string }) {
  return <mesh position={position} scale={scale} castShadow receiveShadow><sphereGeometry args={[radius, 20, 14]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>;
}

/** Local coordinates belong to the mounted scene; the rendered root is the simulation position. */
export function OrbitalResidents(props: ResidentsProps) {
  const current = useRef(props);
  current.current = props;
  const { camera } = useThree();
  const room = useMemo(() => layout(props.sceneId === 'observatory'), [props.sceneId]);
  const spawn = useMemo(() => { const point = reachable([0.25, 0.5], room.boxes); return [point[0], 0, point[1]] as [number, number, number]; }, [room]);
  const resident = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const keys = useRef(new Set<string>());
  const jump = useRef(false);
  const strideAmount = useRef(0);
  const touch = useRef<{ id: number; x: number; y: number; target: EventTarget | null } | null>(null);
  const petGesture = useRef(false);
  const state = useRef({ posture: 'standing' as Posture, wanted: 'standing' as Posture, path: [] as Point[], external: false, exiting: false, blend: 0, sit: 0, lie: 0, lift: 0, velocity: 0, gait: 0, nearby: '', dismissedBed: false, dismissedChair: false });
  const exit = useRef({ from: new THREE.Vector3(), yaw: 0, sit: 0, lie: 0, progress: 0 });
  const petBody = useRef<THREE.Group>(null);
  const petHead = useRef<THREE.Group>(null);
  const petTail = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Group>(null);
  const pet = useRef({ value: props.objects.pet?.value ?? 0, happy: 0, time: 0 });
  const movement = useMemo(() => ({ forward: new THREE.Vector3(), right: new THREE.Vector3(), step: new THREE.Vector3() }), []);

  const act = (objectId: string, kind: WorldActionKind) => {
    const p = current.current;
    p.onAction({ sceneId: p.sceneId, objectId, kind });
  };
  const beginExit = () => {
    const s = state.current;
    if (s.exiting || s.posture === 'standing' || !resident.current) return;
    exit.current.from.copy(resident.current.position);
    exit.current.yaw = resident.current.rotation.y;
    exit.current.sit = s.sit; exit.current.lie = s.lie; exit.current.progress = 0;
    s.exiting = true;
  };
  const stand = () => {
    const s = state.current;
    if (current.current.objects.bed?.active && !s.dismissedBed) { s.dismissedBed = true; act('bed', 'wake'); }
    if (current.current.objects.chair?.active && !s.dismissedChair) { s.dismissedChair = true; act('chair', 'stand'); }
    s.wanted = 'standing';
    s.path = [];
    beginExit();
  };
  const releaseTouch = () => {
    const held = touch.current;
    if (!held) return;
    touch.current = null;
    try { (held.target as Element)?.releasePointerCapture?.(held.id); } catch { /* Browser may already have released it. */ }
    current.current.onGesture(false);
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const p = current.current;
      const target = event.target as HTMLElement | null;
      if (!p.enabled || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return;
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.code === 'KeyE') {
        if (state.current.posture !== 'standing' || p.objects.bed?.active || p.objects.chair?.active) stand();
        else {
          const id = state.current.nearby;
          if (id) act(id, id === 'pet' ? 'pet' : id === 'bed' ? 'sleep' : 'sit');
        }
      } else if (event.code === 'Space') {
        const wasResting = state.current.wanted !== 'standing' || state.current.posture !== 'standing';
        if (wasResting) stand();
        jump.current = true;
      }
      else {
        stand();
        if (state.current.external) { state.current.external = false; p.onArrive(); }
        keys.current.add(event.code);
      }
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code); };
    const clear = () => {
      keys.current.clear(); jump.current = false; releaseTouch();
      if (petGesture.current) { petGesture.current = false; current.current.onGesture(false); }
    };
    const hide = () => { if (document.hidden) clear(); };
    const touchUp = (event: PointerEvent) => {
      const held = touch.current;
      if (!held || event.pointerId !== held.id) return;
      const swipe = held.y - event.clientY > 32 && Math.abs(held.x - event.clientX) < 95;
      releaseTouch();
      // onGesture temporarily disables residents while this component owns the pointer.
      if (swipe && (!current.current.focusedObject || current.current.focusedObject === 'bed')) {
        if (state.current.wanted !== 'standing' || state.current.posture !== 'standing') stand();
        if (state.current.lift === 0) jump.current = true;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.addEventListener('pointerup', touchUp);
    window.addEventListener('pointercancel', clear);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clear();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear);
      window.removeEventListener('pointerup', touchUp); window.removeEventListener('pointercancel', clear); document.removeEventListener('visibilitychange', hide);
      if (state.current.nearby) current.current.onHover(null);
    };
  }, []);

  useEffect(() => {
    if (!props.enabled) { keys.current.clear(); if (!touch.current) jump.current = false; }
    if (props.focusedObject && props.focusedObject !== 'bed') releaseTouch();
  }, [props.enabled, props.focusedObject]);
  useEffect(() => {
    if (!props.walkTarget || !props.enabled) return;
    stand();
    const s = state.current;
    s.external = true;
    if (!s.exiting && resident.current) s.path = route([resident.current.position.x, resident.current.position.z], [props.walkTarget[0], props.walkTarget[2]], room.boxes);
  }, [props.walkTarget]);

  useFrame((_, rawDelta) => {
    const root = resident.current;
    const pivot = hips.current;
    if (!root || !pivot) return;
    const dt = Math.min(Math.max(rawDelta, 0), 0.04);
    const p = current.current;
    const s = state.current;
    if (!p.objects.bed?.active) s.dismissedBed = false;
    if (!p.objects.chair?.active) s.dismissedChair = false;
    const wanted: Posture = p.sceneId === 'habitat' && p.objects.bed?.active && !s.dismissedBed ? 'bed' : p.objects.chair?.active && !s.dismissedChair ? 'chair' : 'standing';
    const chairEntry: Point = p.sceneId === 'observatory' ? [-1.65, -0.16] : [2.27, -0.5];
    const entry: Point = (s.posture !== 'standing' ? s.posture === 'bed' : wanted === 'bed') ? [-1.48, 0.95] : chairEntry;
    if (wanted !== s.wanted) {
      s.wanted = wanted;
      s.path = [];
      if (s.external) { s.external = false; p.onArrive(); }
      if (s.posture !== 'standing') beginExit();
      else if (wanted !== 'standing') s.path = route([root.position.x, root.position.z], entry, room.boxes);
    }
    let walking = false;
    if (s.exiting) {
      // Move off the support before lowering the pelvis; preserve the actual in-flight pose.
      const transition = exit.current;
      transition.progress = Math.min(1, transition.progress + dt / 0.85);
      const t = transition.progress;
      const move = ease(clamp(t / 0.8, 0, 1));
      const lower = ease(clamp((t - 0.45) / 0.55, 0, 1));
      root.position.x = THREE.MathUtils.lerp(transition.from.x, entry[0], move);
      root.position.z = THREE.MathUtils.lerp(transition.from.z, entry[1], move);
      root.position.y = THREE.MathUtils.lerp(transition.from.y, 0, lower);
      s.lie = transition.lie * (1 - ease(clamp(t / 0.55, 0, 1)));
      s.sit = transition.sit * (1 - lower) + transition.lie * Math.sin(t * Math.PI);
      root.rotation.y = angle(transition.yaw, s.posture === 'bed' ? Math.PI / 2 : room.yaw, move);
      if (t === 1) {
        root.position.set(entry[0], 0, entry[1]);
        s.posture = 'standing'; s.exiting = false; s.blend = 0; s.sit = 0; s.lie = 0;
        if (s.external && p.walkTarget) s.path = route(entry, [p.walkTarget[0], p.walkTarget[2]], room.boxes);
        else if (wanted !== 'standing') s.path = route(entry, wanted === 'bed' ? [-1.48, 0.95] : chairEntry, room.boxes);
      }
    } else if (s.posture !== 'standing') {
      s.blend = Math.min(1, s.blend + dt / (p.reducedMotion ? 0.4 : 0.9));
      const t = ease(s.blend);
      const bed = s.posture === 'bed';
      const destination: Point = bed ? [-2.6, 0.94] : [room.chair[0] + Math.sin(room.yaw) * 0.1, room.chair[1] + Math.cos(room.yaw) * 0.1];
      const slide = bed ? ease(clamp((t - 0.2) / 0.8, 0, 1)) : t;
      root.position.x = THREE.MathUtils.lerp(entry[0], destination[0], slide);
      root.position.z = THREE.MathUtils.lerp(entry[1], destination[1], slide);
      root.rotation.y = angle(root.rotation.y, bed ? 0 : room.yaw, 1 - Math.exp(-dt * 12));
      // Hip center sits one hip radius above the actual cushion; supine back rests on the duvet.
      root.position.y = bed ? ease(clamp(t / 0.35, 0, 1)) * (0.929 - HIP) : t * (room.seat + 0.095 - HIP);
      s.sit = bed ? Math.sin(t * Math.PI) * 0.65 : t;
      s.lie = bed ? ease(clamp((t - 0.25) / 0.75, 0, 1)) : 0;
    } else {
      let dx = 0, dz = 0;
      if (p.enabled) {
        const k = keys.current;
        const horizontal = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
        const vertical = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
        camera.getWorldDirection(movement.forward); movement.forward.y = 0; movement.forward.normalize();
        movement.right.crossVectors(movement.forward, camera.up).normalize();
        movement.step.copy(movement.forward).multiplyScalar(vertical).addScaledVector(movement.right, horizontal).normalize();
        dx = movement.step.x; dz = movement.step.z;
      }
      const autonomous = wanted !== 'standing';
      if (!dx && !dz && (p.enabled || autonomous) && s.path.length) {
        const waypoint = s.path[0];
        const distance = Math.hypot(waypoint[0] - root.position.x, waypoint[1] - root.position.z);
        if (distance <= 2.15 * dt) { root.position.x = waypoint[0]; root.position.z = waypoint[1]; s.path.shift(); }
        else { dx = (waypoint[0] - root.position.x) / distance; dz = (waypoint[1] - root.position.z) / distance; }
      }
      if (dx || dz) {
        const beforeX = root.position.x, beforeZ = root.position.z;
        const x = root.position.x + dx * dt * 2.15, z = root.position.z + dz * dt * 2.15;
        if (free([x, root.position.z], room.boxes)) root.position.x = x;
        if (free([root.position.x, z], room.boxes)) root.position.z = z;
        walking = Math.hypot(root.position.x - beforeX, root.position.z - beforeZ) > 0.001;
        root.rotation.y = angle(root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 14));
      }
      if (!s.path.length && s.external && p.enabled) { s.external = false; p.onArrive(); }
      if (!s.path.length && autonomous && Math.hypot(root.position.x - entry[0], root.position.z - entry[1]) < 0.06 && s.lift <= 0) {
        s.posture = wanted; s.blend = 0;
      }
      if (jump.current && p.enabled) { if (s.lift === 0) s.velocity = 4.0; jump.current = false; }
      if (s.lift > 0 || s.velocity > 0) { s.velocity -= 10.5 * dt; s.lift = Math.max(0, s.lift + s.velocity * dt); if (!s.lift) s.velocity = 0; }
      root.position.y = s.lift;
      s.sit = 0; s.lie = 0;
    }
    s.gait += walking ? dt * 10 : 0;
    strideAmount.current = THREE.MathUtils.damp(strideAmount.current, walking && !p.reducedMotion ? Math.sin(s.gait) * 0.44 : 0, 16, dt);
    const stride = strideAmount.current;
    pivot.position.y = HIP;
    pivot.rotation.x = -s.lie * Math.PI / 2;
    if (head.current) head.current.position.z = s.lie * 0.2;
    if (leftLeg.current && rightLeg.current && leftKnee.current && rightKnee.current) {
      leftLeg.current.rotation.x = -s.sit * Math.PI / 2 + stride;
      rightLeg.current.rotation.x = -s.sit * Math.PI / 2 - stride;
      leftKnee.current.rotation.x = s.sit * Math.PI / 2 + Math.max(0, -stride) * 0.5;
      rightKnee.current.rotation.x = s.sit * Math.PI / 2 + Math.max(0, stride) * 0.5;
    }
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x = s.sit * -0.6 - stride * 0.7;
      rightArm.current.rotation.x = s.sit * -0.6 + stride * 0.7;
    }
    root.userData.posture = s.exiting ? 'standing-up' : s.posture;
    root.userData.grounded = s.lift === 0;
    const candidates: { id: string; point: Point; distance: number }[] = [{ id: 'pet', point: CAT, distance: 1.1 }, { id: 'chair', point: chairEntry, distance: 0.9 }];
    if (p.sceneId === 'habitat') candidates.push({ id: 'bed', point: [-1.48, 0.95], distance: 1.0 });
    const nearby = p.enabled ? candidates.filter(item => Math.hypot(root.position.x - item.point[0], root.position.z - item.point[1]) < item.distance).sort((a, b) => Math.hypot(root.position.x - a.point[0], root.position.z - a.point[1]) - Math.hypot(root.position.x - b.point[0], root.position.z - b.point[1]))[0]?.id ?? '' : '';
    if (nearby !== s.nearby) { s.nearby = nearby; p.onHover(nearby || null, nearby ? `E · ${nearby === 'pet' ? '摸摸团子' : nearby === 'bed' ? '躺下休息' : '坐下'}` : undefined); }

    const cat = pet.current;
    cat.time += dt;
    const value = p.objects.pet?.value ?? 0;
    if (value > cat.value) cat.happy = 2.2;
    cat.value = value; cat.happy = Math.max(0, cat.happy - dt);
    const happy = cat.happy > 0;
    if (petBody.current) petBody.current.position.y = 0.09 + (happy && !p.reducedMotion ? Math.sin((2.2 - cat.happy) * 9) ** 2 * 0.08 : 0);
    if (petHead.current) {
      petHead.current.rotation.z = happy && !p.reducedMotion ? Math.sin(cat.time * 9) * 0.12 : 0;
      const direction = Math.atan2(root.position.x - CAT[0], root.position.z - CAT[1]) - 0.5;
      petHead.current.rotation.y = THREE.MathUtils.damp(petHead.current.rotation.y, clamp(Math.atan2(Math.sin(direction), Math.cos(direction)), -0.7, 0.7), 5, dt);
    }
    if (petTail.current) petTail.current.rotation.z = p.reducedMotion ? 0.15 : Math.sin(cat.time * (happy ? 10 : 2.2)) * (happy ? 0.5 : 0.2);
    if (sparks.current) {
      sparks.current.visible = happy;
      sparks.current.children.forEach((child, i) => { child.position.set(Math.sin(i * 2.1) * 0.22, 0.7 + (p.reducedMotion ? 0.1 : ((2.2 - cat.happy + i * 0.25) % 1.1) * 0.45), Math.cos(i * 2.1) * 0.15); child.scale.setScalar(Math.min(1, cat.happy * 3) * 0.7); });
    }
  });

  const characterDown = (event: ThreeEvent<PointerEvent>) => {
    if (!props.enabled || event.pointerType !== 'touch' || touch.current) return;
    event.stopPropagation();
    touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY, target: event.target };
    try { (event.target as Element).setPointerCapture?.(event.pointerId); } catch { /* Optional on touch-only browsers. */ }
    props.onGesture(true);
  };
  const petWorld: WorldModelProps = { ...props,
    onAction: action => { if (current.current.enabled || petGesture.current) current.current.onAction(action); petGesture.current = false; },
    onGesture: active => {
      if (active) petGesture.current = current.current.enabled;
      if (petGesture.current) current.current.onGesture(active);
    },
    onHover: (id, hint) => { if (current.current.enabled || !id) current.current.onHover(id, hint); },
  };
  return <group name={`OrbitalResidents_${props.sceneId}`}>
    <group ref={resident} name="OrbitalResident" position={spawn} onPointerDown={characterDown}
      onPointerOver={e => { if (props.enabled) { e.stopPropagation(); props.onHover('resident', 'WASD 移动 · 空格跳跃 · 上划人物跳跃'); } }}
      onPointerOut={() => { if (props.enabled) props.onHover(null); }}>
      <group ref={hips} position={[0, HIP, 0]}>
        <Ball position={[0, 0, 0]} radius={0.17} scale={[1, 0.56, 0.72]} color="#2b3a4f" />
        {([[leftLeg, leftKnee, -0.095], [rightLeg, rightKnee, 0.095]] as const).map(([leg, knee, x]) => <group key={x} ref={leg} position={[x, -0.02, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow><capsuleGeometry args={[0.067, 0.15, 6, 16]} /><meshStandardMaterial color="#2b3a4f" /></mesh>
          <group ref={knee} position={[0, -0.28, 0]}>
            <mesh position={[0, -0.115, 0]} castShadow><capsuleGeometry args={[0.06, 0.15, 6, 16]} /><meshStandardMaterial color="#33465b" /></mesh>
            <Ball position={[0, -0.25, 0.035]} radius={0.08} scale={[1, 0.62, 1.55]} color="#f7f1df" />
            <mesh position={[0, -0.298, 0.035]} scale={[1, 1, 1.5]}><cylinderGeometry args={[0.08, 0.08, 0.024, 20]} /><meshStandardMaterial color="#bd753e" /></mesh>
          </group>
        </group>)}
        <Ball position={[0, 0.245, 0]} radius={0.235} scale={[0.88, 1.18, 0.68]} color="#3b7a8c" />
        <Ball position={[0, 0.43, -0.09]} radius={0.13} scale={[1.1, 0.7, 0.7]} color="#326978" />
        <Ball position={[0, 0.13, 0.14]} radius={0.08} scale={[1.7, 0.75, 0.35]} color="#326978" />
        {[-0.044, 0.044].map(x => <mesh key={x} position={[x, 0.36, 0.14]}><capsuleGeometry args={[0.007, 0.11, 4, 8]} /><meshStandardMaterial color="#f8efd9" /></mesh>)}
        {([[leftArm, -0.24], [rightArm, 0.24]] as const).map(([ref, x]) => <group ref={ref} key={x} position={[x, 0.43, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.06, 0.22, 6, 16]} /><meshStandardMaterial color="#3b7a8c" /></mesh>
          <Ball position={[0, -0.33, 0]} radius={0.055} color="#f4c7ab" />
        </group>)}
        <group ref={head} position={[0, 0.61, 0]}>
          <Ball position={[0, 0, 0]} radius={0.175} scale={[1, 0.98, 0.95]} color="#f4c7ab" />
          <Ball position={[0, 0.05, -0.048]} radius={0.188} color="#3b261e" />
          {[-1, 1].map(side => <React.Fragment key={side}>
            <Ball position={[side * 0.174, -0.02, 0]} radius={0.038} scale={[0.6, 1, 0.8]} color="#eab89b" />
            <Ball position={[side * 0.063, -0.01, 0.153]} radius={0.023} scale={[0.8, props.objects.bed?.active ? 0.22 : 1.1, 0.5]} color="#1e293b" />
            <Ball position={[side * 0.063 + 0.005, -0.003, 0.166]} radius={0.006} color="#ffffff" />
            <Ball position={[side * 0.105, -0.05, 0.135]} radius={0.021} scale={[1.1, 0.65, 0.4]} color="#e6a296" />
          </React.Fragment>)}
          {[-0.12, -0.06, 0, 0.06, 0.12].map((x, i) => <mesh key={x} position={[x, 0.105 - Math.abs(x) * 0.2, 0.12]} rotation={[0.4, 0, (2 - i) * 0.25]} scale={[0.75, 1.35, 0.55]} castShadow><sphereGeometry args={[0.052, 16, 12]} /><meshStandardMaterial color="#462e24" /></mesh>)}
          <mesh position={[0, -0.065, 0.16]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.018, 0.004, 6, 16, Math.PI]} /><meshBasicMaterial color="#9a4a3a" /></mesh>
          <mesh position={[0.02, 0.225, 0]} rotation={[0, Math.PI / 2, -0.4]}><torusGeometry args={[0.035, 0.009, 8, 16, Math.PI * 1.2]} /><meshStandardMaterial color="#3b261e" /></mesh>
        </group>
      </group>
    </group>
    <ObjectHandle id="pet" action="pet" hint="团子 · 轻抚 / 靠近按 E" world={petWorld} position={[CAT[0], 0, CAT[1]]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow><cylinderGeometry args={[0.37, 0.41, 0.08, 28]} /><meshStandardMaterial color="#d5c3aa" roughness={0.9} /></mesh>
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.34, 0.045, 12, 28]} /><meshStandardMaterial color="#c4ad90" /></mesh>
      <group ref={petBody} position={[0, 0.09, 0]}>
        <Ball position={[0, 0.16, -0.02]} radius={0.21} scale={[0.8, 0.67, 1.15]} color="#e79748" />
        {[-0.12, 0, 0.1].map(z => <Ball key={z} position={[0, 0.29, z]} radius={0.08} scale={[1.6, 0.13, 0.25]} color="#b9662c" />)}
        {[-0.1, 0.1].flatMap(x => [-0.14, 0.17].map(z => <Ball key={`${x}/${z}`} position={[x, 0.035, z]} radius={0.058} scale={[1, 0.65, 1.25]} color="#fff3dc" />))}
        <Ball position={[0, 0.16, 0.17]} radius={0.13} scale={[0.88, 0.92, 0.55]} color="#fff3dc" />
        <group ref={petHead} position={[0, 0.32, 0.18]}>
          <Ball position={[0, 0, 0]} radius={0.165} scale={[1.06, 0.95, 0.98]} color="#e79748" />
          {[-1, 1].map(side => <React.Fragment key={side}>
            <Ball position={[side * 0.055, -0.035, 0.13]} radius={0.057} scale={[1.1, 0.85, 0.8]} color="#fff3dc" />
            <Ball position={[side * 0.068, 0.028, 0.145]} radius={0.028} color="#679c74" />
            <Ball position={[side * 0.068, 0.028, 0.163]} radius={0.018} scale={[0.45, 0.9, 0.5]} color="#172c29" />
            <group position={[side * 0.1, 0.14, 0.01]} rotation={[0.15, 0, -side * 0.35]}>
              <mesh castShadow><coneGeometry args={[0.068, 0.14, 4]} /><meshStandardMaterial color="#d17a36" /></mesh>
              <mesh position={[0, -0.01, 0.025]} scale={[0.65, 0.72, 0.5]}><coneGeometry args={[0.055, 0.11, 4]} /><meshStandardMaterial color="#e8aaa1" /></mesh>
            </group>
          </React.Fragment>)}
          <Ball position={[0, -0.012, 0.172]} radius={0.02} color="#dd8d8d" />
        </group>
        <group ref={petTail} position={[0, 0.16, -0.22]}>
          <mesh position={[0, 0.11, -0.08]} rotation={[-0.55, 0, 0]} castShadow><capsuleGeometry args={[0.032, 0.24, 5, 12]} /><meshStandardMaterial color="#e79748" /></mesh>
          <Ball position={[0, 0.24, -0.16]} radius={0.035} color="#fff3dc" />
        </group>
      </group>
      <group ref={sparks} visible={false}>{[0, 1, 2].map(i => <mesh key={i}><octahedronGeometry args={[0.045, 1]} /><meshBasicMaterial color="#e5ac9e" /></mesh>)}</group>
    </ObjectHandle>
  </group>;
}
