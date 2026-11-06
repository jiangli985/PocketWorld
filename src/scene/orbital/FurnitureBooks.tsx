import React from 'react';
import { CLOSED_OBJECT, type WorldModelProps } from '../../types/world';
import { ObjectHandle } from './ObjectHandle';
import { SoftBox, Tube } from './Primitives';
import { FurnitureMotion, FURNITURE as C, type FurnitureVector } from './FurnitureParts';

export function FurnitureBook({ world, id, position, rotation = [0, 0, 0], color = '#8b5744', kind = 'read', scale = 1 }: {
  world: WorldModelProps; id: string; position: FurnitureVector; rotation?: FurnitureVector; color?: string; kind?: 'read' | 'write' | 'plan'; scale?: number;
}) {
  const state = world.objects[id] ?? CLOSED_OBJECT;
  const opened = state.open || state.active;
  const label = kind === 'write' ? '翻开日记 · 写下今天' : kind === 'plan' ? '展开日程 · 安排计划' : opened ? '翻动书页' : '取阅书籍';
  return <group position={position} rotation={rotation} scale={scale}>
    <ObjectHandle id={id} action={opened && kind === 'read' ? 'turn-page' : kind} hint={label} world={world} drag="x" payload={kind === 'read' && opened ? { direction: 1 } : undefined}>
      <SoftBox dims={[0.36, 0.025, 0.47]} position={[0.18, 0.0125, 0]} radius={0.009} color={color} />
      <SoftBox dims={[0.325, 0.065, 0.435]} position={[0.185, 0.057, 0]} radius={0.006} color={C.paper} />
      <SoftBox dims={[0.025, 0.11, 0.47]} position={[0, 0.055, 0]} radius={0.009} color={color} />
      <FurnitureMotion axis="z" target={opened ? Math.PI * 0.94 : 0} reducedMotion={world.reducedMotion} position={[0, 0.1, 0]}>
        <SoftBox dims={[0.36, 0.025, 0.47]} position={[0.18, 0, 0]} radius={0.009} color={color} />
        <SoftBox dims={[0.24, 0.003, 0.34]} position={[0.18, 0.014, 0]} radius={0.001} color={kind === 'plan' ? '#b8c5ae' : '#be9c61'} />
        {[0, 1, 2].map(i => <SoftBox key={i} dims={[0.12 - i * 0.02, 0.002, 0.006]} position={[0.18, 0.016, -0.06 + i * 0.025]} radius={0.0005} color={C.edge} />)}
      </FurnitureMotion>
      <FurnitureMotion axis="z" target={opened ? (state.page % 2 === 0 ? 0 : 2.92) : 0} reducedMotion={world.reducedMotion} position={[0.015, 0.095, 0]}>
        <SoftBox dims={[0.32, 0.004, 0.43]} position={[0.16, 0, 0]} radius={0.001} color="#fff3d6" />
      </FurnitureMotion>
      <SoftBox dims={[0.024, 0.003, 0.13]} position={[0.27, 0.093, 0.22]} radius={0.001} color="#c5774b" />
    </ObjectHandle>
  </group>;
}

export function FurnitureBookcase({ world, observatory = false }: { world: WorldModelProps; observatory?: boolean }) {
  const cabinet = world.objects.cabinet ?? CLOSED_OBJECT;
  const item = world.objects['cabinet-item'] ?? CLOSED_OBJECT;
  return <group position={observatory ? [-3.45, 0, -0.65] : [-3.45, 0, -1.9]} name="Furniture_OpenBookcase">
    <SoftBox dims={[1.18, 0.08, 0.54]} position={[0, 0.12, 0]} color={C.edge} />
    {[-0.47, 0.47].flatMap(x => [-0.17, 0.17].map(z => <SoftBox key={`${x}/${z}`} dims={[0.09, 0.1, 0.09]} position={[x, 0.05, z]} color={C.edge} radius={0.012} />))}
    <SoftBox dims={[1.18, 0.08, 0.54]} position={[0, 2.15, 0]} color={C.wood} />
    {[-0.55, 0.55].map(x => <SoftBox key={x} dims={[0.08, 2, 0.54]} position={[x, 1.12, 0]} color={C.wood} />)}
    <SoftBox dims={[1.08, 2, 0.035]} position={[0, 1.12, -0.255]} color="#8a654b" />
    {[0.64, 1.12, 1.61].map(y => <SoftBox key={y} dims={[1.08, 0.055, 0.52]} position={[0, y, 0]} color={C.wood} />)}
    {world.books.slice(0, 6).map((book, i) => <ObjectHandle key={book.id} id="book-01" action="read" payload={{ itemId: book.id }} hint={`取阅《${book.title}》`} world={world}
      position={[-0.4 + i * 0.145, 1.15, 0]} rotation={[0, 0, i === 5 ? -0.09 : 0]}>
      <SoftBox dims={[0.11, 0.33 + (i % 3) * 0.035, 0.32]} position={[0, 0.18, 0]} color={['#6e8780', '#b58b55', '#7a5360'][i % 3]} radius={0.009} />
      <SoftBox dims={[0.065, 0.012, 0.005]} position={[0, 0.3, 0.163]} color={C.cream} radius={0.002} />
    </ObjectHandle>)}
    <FurnitureBook world={world} id="book-01" position={[-0.12, 0.671, 0.04]} color="#6c8382" scale={0.95} />
    <SoftBox dims={[0.36, 0.13, 0.32]} position={[0.22, 1.705, 0]} color="#ba895d" />
    <ObjectHandle id="cabinet" action={cabinet.open ? 'close' : 'open'} hint={cabinet.open ? '关上柜门' : '拉开柜门'} world={world} drag="x">
      <FurnitureMotion target={cabinet.open ? -1.75 : 0} reducedMotion={world.reducedMotion} position={[-0.52, 0.38, 0.286]}>
        <SoftBox dims={[1.04, 0.45, 0.045]} position={[0.52, 0, 0]} color={C.wood} />
        <Tube points={[[0.9, -0.06, 0.03], [0.9, -0.06, 0.07], [0.9, 0.06, 0.07], [0.9, 0.06, 0.03]]} radius={0.012} color={C.brass} />
        {[-0.13, 0.13].map(y => <mesh key={y} position={[0, y, -0.01]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.06, 12]} /><meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.4} /></mesh>)}
      </FurnitureMotion>
    </ObjectHandle>
    <ObjectHandle id="cabinet-item" action={item.active ? 'eject' : 'select'} hint={item.active ? '放回收纳盒' : '取出收纳盒'} world={world} drag="z" payload={{ itemId: 'storage-box' }}>
      <FurnitureMotion mode="position" axis="z" target={item.active ? 0.62 : 0} reducedMotion={world.reducedMotion}>
        <SoftBox dims={[0.34, 0.23, 0.34]} position={[-0.2, 0.275, 0]} color="#8a9b8f" />
        <SoftBox dims={[0.36, 0.035, 0.36]} position={[-0.2, 0.405, 0]} color="#acb7a3" radius={0.012} />
      </FurnitureMotion>
    </ObjectHandle>
  </group>;
}
