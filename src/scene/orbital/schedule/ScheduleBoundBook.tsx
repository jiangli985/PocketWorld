import { useEffect, useMemo, useRef } from 'react';
import type { WorldModelProps } from '../../../types/world';
import type { FurnitureVector } from '../FurnitureParts';
import { ObjectHandle } from '../ObjectHandle';
import { BoundJournal } from '../journal/BoundJournal';
import { createBookControl } from '../journal/bookControl';
import { BOOK } from '../journal/bookModel';
import { useSchedule } from './ScheduleContext';
import { pageTexture } from './SchedulePaper';

export function ScheduleBoundBook({ world, position, rotation = [0, 0, 0], color, scale = 1 }: {
  world: WorldModelProps; position: FurnitureVector; rotation?: FurnitureVector; color: string; scale?: number;
}) {
  const notebook = useSchedule();
  const inactiveBook = useRef(createBookControl());
  const control = world.sceneId === 'habitat' ? notebook.book : inactiveBook;
  const pages = useMemo(() => [notebook.state.current, ...notebook.state.queued].sort((a, b) => a.number - b.number), [notebook.state.current, notebook.state.queued]);
  const index = pages.findIndex(page => page.id === notebook.state.current.id);
  const opened = world.focusedObject === 'schedule' && !!world.objects.schedule?.open;
  useEffect(() => { control.current.spread = index; control.current.ready = false; }, [control, index]);
  useEffect(() => {
    if (world.sceneId !== 'habitat') return;
    const book = control.current;
    const textures = pages.slice(Math.max(0, index - 1), index + 2).map(page => {
      const texture = pageTexture(page), leaf = pages.indexOf(page);
      book.textures.set(leaf * 2, texture); book.textures.set(leaf * 2 + 1, texture);
      return texture;
    });
    book.revision++;
    return () => { textures.forEach(texture => texture.dispose()); book.textures.clear(); book.revision++; };
  }, [control, index, pages, world.sceneId]);
  return <group name={`Schedule_BoundBook_${world.sceneId}`} position={position} rotation={rotation} scale={[scale * 0.237, scale * 0.237, scale * 0.27]}>
    <ObjectHandle id="schedule" action="plan" hint="翻开日程 · 安排今天" world={opened ? { ...world, onApproach: () => false } : world}>
      <BoundJournal opened={opened} control={control} reducedMotion={world.reducedMotion} leafCount={Math.max(BOOK.leaves, pages.length + 1)} coverTitle="日  程" coverSubtitle="D A I L Y  P L A N N E R" coverColor={color} />
    </ObjectHandle>
  </group>;
}
