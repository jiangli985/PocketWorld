import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { WorldModelProps } from '../../../types/world';
import type { FurnitureVector } from '../FurnitureParts';
import { ObjectHandle } from '../ObjectHandle';
import { BoundJournal } from '../journal/BoundJournal';
import { createBookControl } from '../journal/bookControl';
import { BOOK } from '../journal/bookModel';
import { useSchedule } from './ScheduleContext';
import { pageTexture } from './SchedulePaper';
import { SchedulePageEditor } from './SchedulePageEditor';
import { openSchedulePage } from './schedule';

export function ScheduleBoundBook({ world, position, rotation = [0, 0, 0], color, scale = 1 }: {
  world: WorldModelProps; position: FurnitureVector; rotation?: FurnitureVector; color: string; scale?: number;
}) {
  const notebook = useSchedule();
  const inactiveBook = useRef(createBookControl());
  const control = world.sceneId === 'habitat' ? notebook.book : inactiveBook;
  const pages = useMemo(() => [notebook.state.current, ...notebook.state.queued].sort((a, b) => a.number - b.number), [notebook.state.current, notebook.state.queued]);
  const index = pages.findIndex(page => page.id === notebook.state.current.id);
  const opened = world.focusedObject === 'schedule' && !!world.objects.schedule?.open;
  const wasOpened = useRef(false);
  const [editing, setEditing] = useState(false);
  const leafCount = Math.max(BOOK.leaves, pages.length + 1);
  useFrame(() => {
    const next = opened && notebook.ready && control.current.ready && world.sceneId === 'habitat';
    if (next !== editing) setEditing(next);
  });
  useEffect(() => { control.current.spread = index; control.current.ready = false; }, [control, index]);
  useEffect(() => {
    if (!opened) { wasOpened.current = false; return; }
    if (world.sceneId !== 'habitat' || !notebook.ready || wasOpened.current) return;
    wasOpened.current = true;
    control.current.spread = 0; control.current.ready = false; control.current.resetToStart = true;
    const next = openSchedulePage(notebook.state);
    if (next !== notebook.state) notebook.commit(next, { retainDraftOnError: true });
  }, [control, notebook.ready, notebook.state, notebook.commit, opened, world.sceneId]);
  useEffect(() => {
    if (world.sceneId !== 'habitat') return;
    const book = control.current;
    const textures = pages.slice(Math.max(0, index - 1), index + 2).map(page => {
      const texture = pageTexture(page, true), leaf = pages.indexOf(page);
      book.textures.set(leaf * 2, texture); book.textures.set(leaf * 2 + 1, texture);
      return texture;
    });
    book.revision++;
    return () => { textures.forEach(texture => texture.dispose()); book.textures.clear(); book.revision++; };
  }, [control, index, pages, world.sceneId]);
  return <group name={`Schedule_BoundBook_${world.sceneId}`} position={position} rotation={rotation} scale={[scale * 0.237, scale * 0.237, scale * 0.27]}>
    <ObjectHandle id="schedule" action="plan" hint="翻开日程 · 安排今天" world={opened ? { ...world, onApproach: () => false } : world}>
      <BoundJournal opened={opened} control={control} reducedMotion={world.reducedMotion} leafCount={leafCount} coverTitle="Daily Planner" coverSubtitle="D A I L Y  P L A N N E R" coverColor={color} coverStyle="daily" />
    </ObjectHandle>
    {opened && editing && <SchedulePageEditor key={notebook.state.current.id} page={notebook.state.current} book={control} leafCount={leafCount} onChange={page => notebook.commit({ ...notebook.state, current: page }, { retainDraftOnError: true })} onGesture={world.onGesture} previousDisabled={index === 0} nextDisabled={index === pages.length - 1 && pages.length >= 32} />}
  </group>;
}
