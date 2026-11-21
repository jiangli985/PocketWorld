import { SuppliedAsset } from './SuppliedAsset';
import React from 'react';
import { CLOSED_OBJECT, type WorldModelProps } from '../../types/world';
import { ObjectHandle } from './ObjectHandle';
import { SoftBox, Tube } from './Primitives';
import { CRT_SCALE, CRT_SIZE } from './media/computerLayout';
import { ReactiveKeyboard } from './media/ReactiveKeyboard';
import { FurnitureCylinder as Cylinder, FURNITURE as C } from './FurnitureParts';
import { ScheduleBook } from './FurnitureBooks';
import { SCHEDULE_BOOK_POSITION, SCHEDULE_BOOK_SCALE, SCHEDULE_BOOK_YAW } from './schedule/bookLayout';

function FurnitureComputer({ world }: { world: WorldModelProps }) {
  const state = world.objects.computer ?? CLOSED_OBJECT;
  return <ObjectHandle id="computer" action="inspect" hint="打开电脑 · 游戏与终端" world={world} position={[1.55, 1.12, -2.6]}>
    <SuppliedAsset name="computer.fitted" size={CRT_SIZE} fit="contact" position={[0, 0, -.07]} fallback={<group scale={[CRT_SCALE, CRT_SCALE, 1]}>
    <SoftBox dims={[0.55, 0.065, 0.42]} position={[0, 0.0325, 0.01]} color="#c2c0aa" radius={0.045} />
    <Cylinder radius={0.12} height={0.09} position={[0, 0.1, -0.04]} color="#aeae9b" />
    <SoftBox dims={[1.15, 0.91, 0.57]} position={[0, 0.55, -0.08]} radius={0.085} color="#ddd9bf" />
    <SoftBox dims={[1.03, 0.8, 0.06]} position={[0, 0.56, 0.207]} radius={0.045} color="#92998a" />
    <SoftBox dims={[0.94, 0.71, 0.02]} position={[0, 0.56, 0.235]} radius={0.025} color="#243e3d">
      <meshStandardMaterial color={state.active ? '#507f73' : '#243e3d'} emissive="#76b5a1" emissiveIntensity={state.active ? 0.25 : 0.08} roughness={0.24} />
    </SoftBox>
    <Cylinder radius={0.015} height={0.009} position={[0.46, 0.15, 0.216]} rotation={[Math.PI / 2, 0, 0]} color="#78a884" />
    {Array.from({ length: 8 }, (_, i) => <SoftBox key={i} dims={[0.003, 0.012, 0.22]} position={[0.576, 0.39 + i * 0.035, -0.11]} color="#a9aa97" radius={0.001} />)}
</group>} />
    <group position={[0, 0.045, 0.50]} rotation={[0.06, 0, 0]}>
      <SoftBox dims={[0.80, 0.06, 0.36]} position={[0, 0.004, -0.012]} color="#d1cdb5" radius={0.022} />
      <ReactiveKeyboard reducedMotion={world.reducedMotion} active={world.focusedObject === 'computer'} />
    </group>
    <Tube points={[[0.2, 0.03, 0.59], [0.36, 0.025, 0.47], [0.33, 0.025, 0.25], [0.1, 0.08, -0.24]]} radius={0.008} color={C.ink} />
  </ObjectHandle>;
}

export function FurnitureDesk({ world }: { world: WorldModelProps }) {
  return <group name="Furniture_Workbench">
    <SuppliedAsset name="desk.parts" size={[4.76, 1.12, 1.2755]} fit="contact" position={[.57, 0, -2.3873]} fallback={<>    <SoftBox dims={[4.76, 0.12, 1.35]} position={[.57, 1.06, -2.35]} color={C.wood} radius={0.045} />
    <SoftBox dims={[3.62, 0.07, 0.055]} position={[1.05, 1.155, -2.98]} color={C.edge} radius={0.012} />
    {[-1.63, 2.77].flatMap(x => [-2.84, -1.86].map(z => <SoftBox key={`${x}/${z}`} dims={[0.09, 1, 0.09]} position={[x, 0.5, z]} color={C.ink} radius={0.018} />))}
    <SoftBox dims={[3.45, 0.09, 0.08]} position={[1.05, 0.23, -2.82]} color={C.ink} />
    {[-1.63, 2.77].map(x => <SoftBox key={x} dims={[0.07, 0.06, 1.04]} position={[x, 0.23, -2.35]} color={C.ink} />)}
</>} />
    <FurnitureComputer world={world} />
    <ScheduleBook world={world} position={SCHEDULE_BOOK_POSITION} color="#6f4b3e" scale={SCHEDULE_BOOK_SCALE} rotation={[0, SCHEDULE_BOOK_YAW, 0]} />
  </group>;
}
