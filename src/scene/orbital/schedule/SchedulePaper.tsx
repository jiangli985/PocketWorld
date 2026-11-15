import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaperBall, SchedulePage } from './schedule';

export const GLASS_POSITION: [number, number, number] = [0.69, 2.3, -3.39];
export const BOOK_POSITION: [number, number, number] = [0.69, 1.201, -2.154];
const ease = (t: number) => 1 - (1 - t) ** 3;
export function paperBallPosition(seed: number): [number, number, number] {
  return [0.25 + Math.sin(seed * 2.4) * 0.65, 0.105, -0.68 + Math.cos(seed * 1.8) * 0.45];
}
export function paperGeometry(crumpled = false) {
  const geometry = new THREE.PlaneGeometry(0.56, 0.872, 20, 26).toNonIndexed();
  const attribute = geometry.attributes.position;
  const flat = attribute.array.slice() as Float32Array;
  const folded = new Float32Array(flat.length);
  for (let i = 0; i < attribute.count; i++) {
    const x = flat[i * 3], y = flat[i * 3 + 1];
    const u = (x + 0.28) / 0.56, v = (y + 0.436) / 0.872;
    const longitude = u * Math.PI * 2, latitude = v * Math.PI;
    const radius = 0.083 + Math.sin(u * 23 + v * 17) * Math.cos(v * 29) * 0.009;
    folded.set([Math.cos(longitude) * Math.sin(latitude) * radius, Math.cos(latitude) * radius, Math.sin(longitude) * Math.sin(latitude) * radius], i * 3);
    flat[i * 3 + 2] = 0.012 * (u ** 6) + Math.sin(v * Math.PI) * 0.003;
  }
  attribute.array.set(crumpled ? folded : flat);
  geometry.computeVertexNormals();
  return { geometry, flat, folded };
}
function pageTexture(page: SchedulePage) {
  const canvas = document.createElement('canvas');
  canvas.width = 560; canvas.height = 872;
  const ctx = canvas.getContext('2d')!;
  const peach = '#f4c7b6', mint = '#d0e1d9', paper = '#faf9f0', ink = '#35473f';
  const box = (x: number, y: number, w: number, h: number, color: string, radius = 4) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  };
  const frame = ctx.createLinearGradient(0, 0, 560, 0);
  frame.addColorStop(0, peach); frame.addColorStop(1, '#c8dfe1');
  ctx.fillStyle = frame; ctx.fillRect(0, 0, 560, 872);
  box(16, 16, 528, 840, paper, 26);
  ctx.fillStyle = '#a37c71'; ctx.font = 'bold italic 48px "Segoe Script", cursive'; ctx.textAlign = 'center'; ctx.fillText('Daily Planner', 280, 92);
  ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.font = 'bold 17px "Segoe Print", serif'; ctx.fillText('Date:', 40, 137);
  box(92, 116, 181, 27, peach, 14); ctx.font = '16px Georgia, serif'; ctx.fillText(page.date, 109, 135);
  const weekday = (new Date(`${page.date}T12:00:00`).getDay() + 6) % 7;
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((day, i) => {
    if (i === weekday) box(298 + i * 30, 115, 24, 27, mint, 14);
    ctx.fillStyle = ink; ctx.font = 'bold 14px "Segoe Print", serif'; ctx.fillText(day, 304 + i * 30, 135);
  });
  box(40, 165, 230, 634, mint);
  box(284, 165, 236, 284, peach);
  box(284, 469, 236, 35, peach);
  box(284, 652, 236, 35, peach);
  ctx.strokeStyle = peach; ctx.lineWidth = 2; ctx.strokeRect(285, 686, 234, 113);
  ctx.fillStyle = ink; ctx.font = 'bold 18px "Segoe Print", serif';
  ctx.fillText('Schedule', 50, 190); ctx.fillText('To Do List', 295, 190); ctx.fillText('For Tomorrow', 295, 493); ctx.fillText('Notes', 295, 676);
  const text = (value: string, x: number, y: number, width: number) => {
    let shown = value;
    while (shown && ctx.measureText(shown).width > width) shown = shown.slice(0, -1);
    if (shown !== value) shown = `${shown.slice(0, -1)}…`;
    ctx.fillStyle = ink; ctx.fillText(shown, x, y);
  };
  page.entries.forEach((entry, index) => {
    const y = 220 + index * 34;
    ctx.font = '14px Georgia, serif'; text(entry.time, 50, y, 46);
    ctx.font = '17px "KaiTi", serif'; text(entry.title, 104, y, 151);
    ctx.strokeStyle = '#faf9f0aa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(50, y + 10); ctx.lineTo(258, y + 10); ctx.stroke();
  });
  page.todos.forEach((item, i) => {
    const y = 215 + i * 28;
    ctx.strokeStyle = paper; ctx.lineWidth = 2; ctx.strokeRect(296, y - 12, 14, 14);
    if (item.completed) box(299, y - 9, 8, 8, '#6a8d7d', 0);
    ctx.font = '17px "KaiTi", serif'; text(item.text, 318, y, 188);
    ctx.strokeStyle = '#a9806c99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(318, y + 5); ctx.lineTo(506, y + 5); ctx.stroke();
  });
  page.tomorrow.forEach((item, i) => {
    const y = 526 + i * 28;
    box(298, y - 10, 11, 11, mint, 6);
    ctx.font = '17px "KaiTi", serif'; text(item, 320, y, 186);
  });
  ctx.font = '17px "KaiTi", serif';
  let line = '', row = 0;
  for (const char of page.notes) {
    if (char === '\n' || ctx.measureText(line + char).width > 210) {
      text(line, 297, 710 + row * 23, 210); line = ''; row++;
    }
    if (row >= 4) break;
    if (char !== '\n') line += char;
  }
  if (row < 4) text(line, 297, 710 + row * 23, 210);
  ctx.font = '14px serif'; ctx.fillStyle = '#8c8e7c'; ctx.textAlign = 'center'; ctx.fillText(`第 ${page.number} 页`, 280, 830);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function PostedPaper({ page, position, onSelect }: { page: SchedulePage; position: [number, number, number]; onSelect: () => void }) {
  const { geometry } = useMemo(() => paperGeometry(), []);
  const texture = useMemo(() => pageTexture(page), [page]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position}>
    <mesh geometry={geometry} onClick={event => { event.stopPropagation(); onSelect(); }} castShadow receiveShadow>
      <meshStandardMaterial map={texture} roughness={0.96} side={THREE.DoubleSide} />
    </mesh>
    {[-0.16, 0.16].map(x => <mesh key={x} position={[x, 0.431, 0.008]} rotation={[0, 0, x > 0 ? -0.1 : 0.08]}>
      <planeGeometry args={[0.16, 0.052]} /><meshStandardMaterial color="#d3c299" roughness={1} transparent opacity={0.78} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>)}
  </group>;
}
export function FloorPaperBall({ ball }: { ball: PaperBall }) {
  const { geometry } = useMemo(() => paperGeometry(true), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={`discarded-schedule-${ball.id}`} geometry={geometry} position={paperBallPosition(ball.seed)} rotation={[0.4, ball.seed, 0.3]} castShadow receiveShadow>
    <meshStandardMaterial color="#e7ddc3" roughness={1} side={THREE.DoubleSide} flatShading />
  </mesh>;
}
export interface PaperFlight { kind: 'post' | 'discard'; page: SchedulePage; from?: [number, number, number] }
export function FlyingPaper({ flight, reducedMotion, onComplete }: { flight: PaperFlight; reducedMotion: boolean; onComplete: () => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const data = useMemo(() => paperGeometry(), []);
  const texture = useMemo(() => pageTexture(flight.page), [flight.page]);
  const start = useMemo(() => new THREE.Vector3(...(flight.kind === 'post' ? flight.from ?? BOOK_POSITION : GLASS_POSITION)), [flight]);
  const end = useMemo(() => new THREE.Vector3(...(flight.kind === 'post' ? GLASS_POSITION : paperBallPosition(flight.page.number))), [flight]);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const duration = reducedMotion ? 0.12 : flight.kind === 'post' ? 1.25 : 1.65;
    elapsed.current += Math.min(delta, 0.05);
    const progress = Math.min(1, elapsed.current / duration);
    if (flight.kind === 'post') {
      const t = ease(progress);
      mesh.current.position.lerpVectors(start, end, t);
      if (!reducedMotion) { mesh.current.position.y += Math.sin(progress * Math.PI) * 0.25; mesh.current.position.z += Math.sin(progress * Math.PI) * 0.16; }
      mesh.current.rotation.set(-Math.PI / 2 * (1 - t), 0, 0.08 * (1 - t));
      mesh.current.scale.setScalar(0.45 + 0.55 * t);
    } else {
      const fold = reducedMotion ? 1 : ease(Math.min(1, progress / 0.32));
      const positions = data.geometry.attributes.position;
      for (let i = 0; i < data.flat.length; i++) positions.array[i] = THREE.MathUtils.lerp(data.flat[i], data.folded[i], fold);
      positions.needsUpdate = true; data.geometry.computeVertexNormals();
      const fall = reducedMotion ? progress : Math.max(0, (progress - 0.32) / 0.68);
      mesh.current.position.lerpVectors(start, end, fall);
      mesh.current.position.y = THREE.MathUtils.lerp(start.y, end.y, fall * fall);
      if (fall > 0.85) mesh.current.position.y += Math.sin((fall - 0.85) / 0.15 * Math.PI) * 0.08;
      mesh.current.rotation.set(fall * 5, fall * 4, fall * 2);
    }
    if (progress >= 1) onComplete();
  });
  return <mesh ref={mesh} geometry={data.geometry} castShadow receiveShadow>
    <meshStandardMaterial map={texture} color="#f6eddb" roughness={1} side={THREE.DoubleSide} flatShading={flight.kind === 'discard'} />
  </mesh>;
}
