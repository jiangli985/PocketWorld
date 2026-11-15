import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldSceneProps } from '../../../types/world';
import { useSchedule } from './ScheduleContext';
import { discardSchedulePage, MAX_POSTED_SCHEDULES, postSchedulePage, turnSchedulePage, schedulePageError, SCHEDULE_FULL_MESSAGE } from './schedule';
import { BOOK_POSITION, FloorPaperBall, FlyingPaper, GLASS_POSITION, PostedPaper, type PaperFlight } from './SchedulePaper';
import './schedule.css';

export function ScheduleSurfaces(props: WorldSceneProps & { visible: boolean }) {
  const { book, state, commit, ready, error, retry } = useSchedule();
  const { camera, size } = useThree();
  const narrow = size.width < 720;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flight, setFlight] = useState<PaperFlight | null>(null);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; pageId: string; target: Element | null } | null>(null);
  const bookView = props.focusedObject === 'schedule';
  const glassView = props.focusedObject === 'schedule-glass';
  const focused = props.visible && (bookView || glassView);
  const selectedIndex = Math.max(0, state.posted.findIndex(page => page.id === selectedId));
  const selected = state.posted[selectedIndex];
  const drafts = [state.current, ...state.queued].sort((a, b) => a.number - b.number);
  const draftIndex = drafts.findIndex(page => page.id === state.current.id);
  const settled = ['active', 'error', 'idle'].includes(props.transition.phase);
  useEffect(() => setMessage(''), [state.current, props.focusedObject]);

  const turn = (direction: -1 | 1) => {
    if (!bookView || busy.current || !settled || !ready || !book.current.ready) return;
    const next = turnSchedulePage(state, direction);
    if (next === state) return;
    (document.activeElement as HTMLElement)?.blur?.();
    if (!commit(next)) return;
    book.current.ready = false;
    props.onGesture(false);
    setMessage('');
  };
  const switchView = () => {
    if (busy.current || !settled) return;
    props.onGesture(false);
    props.onAction({ sceneId: props.sceneId, objectId: glassView ? 'schedule' : 'schedule-glass', kind: glassView ? 'plan' : 'inspect' });
  };
  const post = (from: [number, number, number]) => {
    if (busy.current || !settled || !ready || !book.current.ready) return;
    if (state.posted.length >= MAX_POSTED_SCHEDULES) {
      setMessage('玻璃贴满了，先移除一张吧。');
      props.onFeatureError(SCHEDULE_FULL_MESSAGE);
      return;
    }
    const invalid = schedulePageError(state.current);
    if (invalid) { setMessage(invalid); return; }
    const page = state.current;
    if (!commit(postSchedulePage(state))) return;
    busy.current = true;
    setMessage(''); setSelectedId(page.id);
    setFlight({ kind: 'post', page, from });
    props.onGesture(false);
    props.onAction({ sceneId: props.sceneId, objectId: 'schedule-glass', kind: 'inspect' });
  };
  const resetDrag = () => {
    const held = drag.current;
    drag.current = null;
    if (!held) return;
    if (held.target?.hasPointerCapture(held.pointerId)) held.target.releasePointerCapture(held.pointerId);
    props.onGesture(false);
  };
  useEffect(() => {
    if (!bookView) return;
    book.current.onTurn = turn;
    book.current.onPaperPointer = (page, u, v, kind, _shift, _delta, pointer) => {
      if (kind !== 'down') return false;
      if (v > 0.9 && (u < 0.15 || u > 0.85)) { turn(page % 2 ? -1 : 1); return; }
      if (page !== draftIndex * 2 || !pointer || !pointer.isPrimary || pointer.button !== 0 || !ready || !settled || busy.current || !book.current.ready) return false;
      resetDrag();
      (document.activeElement as HTMLElement)?.blur?.();
      const target = pointer.target instanceof Element ? pointer.target : null;
      drag.current = { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, pageId: state.current.id, target };
      target?.setPointerCapture(pointer.pointerId);
      props.onGesture(true);
    };
    const finish = (event: PointerEvent) => {
      const held = drag.current;
      if (!held || held.pointerId !== event.pointerId) return;
      const dx = event.clientX - held.x, dy = event.clientY - held.y;
      resetDrag();
      if (held.pageId !== state.current.id || -dy < Math.max(32, Math.min(80, size.height * 0.08)) || -dy < Math.abs(dx) * 1.2) return;
      const from = new THREE.Vector3(...BOOK_POSITION).project(camera);
      from.x += dx * 2 / size.width; from.y -= dy * 2 / size.height; from.unproject(camera);
      post(from.toArray() as [number, number, number]);
    };
    const secondaryPointer = (event: PointerEvent) => { if (!event.isPrimary) resetDrag(); };
    window.addEventListener('pointerdown', secondaryPointer, true);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', resetDrag);
    window.addEventListener('blur', resetDrag);
    return () => {
      book.current.onTurn = undefined; book.current.onPaperPointer = undefined;
      window.removeEventListener('pointerdown', secondaryPointer, true);
      window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', resetDrag); window.removeEventListener('blur', resetDrag);
      resetDrag();
    };
  }, [bookView, state, ready, settled, camera, size.width, size.height]);
  useEffect(() => {
    if (!focused) return;
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (event.code === 'KeyV') { event.preventDefault(); switchView(); }
      if (bookView && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
        event.preventDefault(); event.stopPropagation(); turn(event.code === 'ArrowLeft' ? -1 : 1);
      }
      if (glassView && !busy.current && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
        event.preventDefault();
        const next = state.posted[selectedIndex + (event.code === 'ArrowLeft' ? -1 : 1)];
        if (next) setSelectedId(next.id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [focused, bookView, glassView, selectedIndex, state, ready, settled, props.onAction]);
  const discard = () => {
    if (busy.current || !settled || !selected) return;
    if (!commit(discardSchedulePage(state, selected.id))) return;
    busy.current = true;
    setFlight({ kind: 'discard', page: selected });
    setSelectedId(state.posted[selectedIndex + 1]?.id ?? state.posted[selectedIndex - 1]?.id ?? null);
    setMessage('这张安排已揉成纸团，留在地面上。');
  };
  const blocked = !ready || !!flight || !settled;
  return <>
    {state.posted.slice(Math.max(0, selectedIndex - 2), selectedIndex + 3).map(page => {
      const offset = state.posted.indexOf(page) - selectedIndex;
      if (flight && (flight.page.id === page.id || offset === 0)) return null;
      return <PostedPaper key={page.id} page={page} position={[GLASS_POSITION[0] + offset * 0.68, GLASS_POSITION[1] - Math.abs(offset) * 0.035, GLASS_POSITION[2]]} onSelect={() => {
        if (busy.current || !props.visible || !focused || !settled) return;
        setSelectedId(page.id);
        if (!glassView) props.onAction({ sceneId: props.sceneId, objectId: 'schedule-glass', kind: 'inspect' });
      }} />;
    })}
    {state.discarded.filter(ball => flight?.page.id !== ball.id).map(ball => <FloorPaperBall key={ball.id} ball={ball} />)}
    {flight && <FlyingPaper flight={flight} reducedMotion={props.reducedMotion} onComplete={() => { busy.current = false; setFlight(null); }} />}
    {focused && !flight && (glassView || message || error) && <Html center transform={!narrow} position={glassView ? [GLASS_POSITION[0], GLASS_POSITION[1] - 0.52, GLASS_POSITION[2] + 0.018] : BOOK_POSITION} distanceFactor={narrow ? undefined : 0.62} zIndexRange={[24, 21]}>
      <div className="schedule-paper-tools" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        {glassView && (selected ? <nav aria-label="玻璃日程翻页"><button disabled={blocked || selectedIndex === 0} onClick={() => setSelectedId(state.posted[selectedIndex - 1].id)} aria-label="上一张安排">‹</button><span>{selectedIndex + 1} / {state.posted.length}</span><button disabled={blocked || selectedIndex >= state.posted.length - 1} onClick={() => setSelectedId(state.posted[selectedIndex + 1].id)} aria-label="下一张安排">›</button><button disabled={blocked} onClick={discard}>揉掉这张</button></nav> : <p>玻璃上还没有安排 · V 返回书本</p>)}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}<button onClick={retry}>{props.adapters?.schedule ? '重试同步' : '重试保存'}</button></p>}
      </div>
    </Html>}
  </>;
}
