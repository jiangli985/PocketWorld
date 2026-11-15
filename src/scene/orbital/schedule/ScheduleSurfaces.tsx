import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldSceneProps } from '../../../types/world';
import { useSchedule } from './ScheduleContext';
import { discardSchedulePage, MAX_POSTED_SCHEDULES, postSchedulePage, turnSchedulePage, schedulePageError, SCHEDULE_FULL_MESSAGE, type SchedulePage } from './schedule';
import { BOOK_POSITION, FloorPaperBall, FlyingPaper, GLASS_POSITION, PostedPaper, type PaperFlight } from './SchedulePaper';
import { SchedulePlanner } from './SchedulePlanner';
import './schedule.css';

export function ScheduleSurfaces(props: WorldSceneProps & { visible: boolean }) {
  const { book, state, commit, ready, error, retry } = useSchedule();
  const { camera, size } = useThree();
  const narrow = size.width < 720;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flight, setFlight] = useState<PaperFlight | null>(null);
  const [message, setMessage] = useState('');
  const [bookSettled, setBookSettled] = useState(false);
  const article = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; pageId: string; width: number; height: number } | null>(null);
  const bookView = props.focusedObject === 'schedule';
  const glassView = props.focusedObject === 'schedule-glass';
  const focused = props.visible && (bookView || glassView);
  const selectedIndex = Math.max(0, state.posted.findIndex(page => page.id === selectedId));
  const selected = state.posted[selectedIndex];
  const drafts = [state.current, ...state.queued].sort((a, b) => a.number - b.number);
  const draftIndex = drafts.findIndex(page => page.id === state.current.id);

  const settled = ['active', 'error', 'idle'].includes(props.transition.phase);
  useFrame(() => {
    const next = bookView && settled && book.current.ready;
    if (next !== bookSettled) setBookSettled(next);
  });
  const turn = (direction: -1 | 1) => {
    if (!bookView || busy.current || !settled || !ready || !book.current.ready) return;
    const next = turnSchedulePage(state, direction);
    if (next === state) return;
    (document.activeElement as HTMLElement)?.blur?.();
    if (!commit(next)) return;
    book.current.ready = false;
    setBookSettled(false);
    props.onGesture(false);
    setMessage('');
  };
  useEffect(() => {
    if (!bookView) return;
    book.current.onPaperPointer = (page, u, v, kind) => {
      if (kind !== 'down' || v < 0.88 || (u > 0.15 && u < 0.85)) return false;
      turn(page % 2 ? -1 : 1);
    };
    return () => { book.current.onPaperPointer = undefined; };
  }, [bookView, state, ready, settled]);
  const switchView = () => {
    if (busy.current || !settled) return;
    props.onGesture(false);
    props.onAction({ sceneId: props.sceneId, objectId: glassView ? 'schedule' : 'schedule-glass', kind: glassView ? 'plan' : 'inspect' });
  };
  useEffect(() => {
    if (!focused) return;
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (event.code === 'KeyV') { event.preventDefault(); switchView(); }
      if (bookView && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
        event.preventDefault(); event.stopPropagation();
        turn(event.code === 'ArrowLeft' ? -1 : 1);
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
  useEffect(() => {
    if (focused && settled && !flight && (!bookView || bookSettled)) article.current?.focus({ preventScroll: true });
  }, [focused, bookView, bookSettled, settled, flight]);
  const update = (page: SchedulePage) => {
    commit({ ...state, current: page }, { retainDraftOnError: true });
    setMessage('');
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
  const discard = () => {
    if (busy.current || !settled || !selected) return;
    if (!commit(discardSchedulePage(state, selected.id))) return;
    busy.current = true;
    setFlight({ kind: 'discard', page: selected });
    setSelectedId(state.posted[selectedIndex + 1]?.id ?? state.posted[selectedIndex - 1]?.id ?? null);
    setMessage('这张安排已揉成纸团，留在地面上。');
  };
  const resetDrag = () => {
    const held = drag.current;
    drag.current = null;
    if (article.current) {
      article.current.style.transform = '';
      article.current.classList.remove('is-dragging');
      if (held && article.current.hasPointerCapture(held.pointerId)) article.current.releasePointerCapture(held.pointerId);
    }
    if (held) props.onGesture(false);
  };
  useEffect(() => {
    if (!focused || !bookView) resetDrag();
  }, [focused, bookView]);
  useEffect(() => {
    window.addEventListener('blur', resetDrag);
    return () => { window.removeEventListener('blur', resetDrag); resetDrag(); };
  }, []);
  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!event.isPrimary) { resetDrag(); return; }
    if (!bookView || !ready || busy.current || !settled || event.button !== 0 || drag.current) return;
    if ((event.target as HTMLElement).closest('input, textarea, button, a, select, summary, [contenteditable]')) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pageId: state.current.id, width: rect.width, height: rect.height };
    (document.activeElement as HTMLElement)?.blur?.();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onGesture(true);
  };
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const held = drag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    if (Math.hypot(dx, dy) < 6) return;
    event.preventDefault();
    event.currentTarget.classList.add('is-dragging');
    event.currentTarget.style.transform = `translate(${dx * event.currentTarget.offsetWidth / held.width}px, ${dy * event.currentTarget.offsetHeight / held.height}px)`;
  };
  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const held = drag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    resetDrag();
    const threshold = Math.min(96, Math.max(56, held.height * 0.14));
    if (held.pageId !== state.current.id || -dy < threshold || -dy < Math.abs(dx) * 1.2) return;
    const from = new THREE.Vector3(...BOOK_POSITION).project(camera);
    from.x += dx * 2 / size.width;
    from.y -= dy * 2 / size.height;
    from.unproject(camera);
    post(from.toArray() as [number, number, number]);
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
    {focused && !flight && (!bookView || bookSettled) && <Html transform={!narrow} center={narrow} position={bookView ? BOOK_POSITION : [GLASS_POSITION[0], GLASS_POSITION[1], GLASS_POSITION[2] + 0.018]}
      rotation={bookView ? [-Math.PI / 2, 0, 0.08] : [0, 0, 0]} distanceFactor={narrow ? undefined : bookView ? 0.28 : 0.62} zIndexRange={[24, 21]}>
      <article ref={article} tabIndex={-1} className={`schedule-sheet ${glassView ? 'is-posted' : 'is-book'}`} aria-label={bookView ? '日程书当前页' : '玻璃上的日程'} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={resetDrag} onLostPointerCapture={resetDrag} onWheel={e => e.stopPropagation()}>
        {bookView && <div className="schedule-paper-drag" aria-hidden="true" />}
        {!ready ? <div className="schedule-empty"><p>{error || '正在翻开日程……'}</p>{error && <button onClick={retry}>重新读取</button>}</div> : bookView ? <>
          <SchedulePlanner page={state.current} disabled={blocked} onChange={update} onGesture={props.onGesture} />
          <nav className="schedule-page-number" aria-label="日程本翻页"><button aria-label="日程上一页" disabled={blocked || draftIndex === 0} onClick={() => turn(-1)}>‹</button><span>第 {state.current.number} 页</span><button aria-label="日程下一页" disabled={blocked || (draftIndex === drafts.length - 1 && drafts.length >= 32)} onClick={() => turn(1)}>›</button></nav>
        </> : selected ? <>
          <SchedulePlanner page={selected} disabled={blocked} readOnly onChange={update} onGesture={props.onGesture} />
          <div className="schedule-actions"><nav aria-label="玻璃日程翻页"><button disabled={blocked || selectedIndex === 0} onClick={() => setSelectedId(state.posted[selectedIndex - 1].id)} aria-label="上一张安排">上一张</button><span>{selectedIndex + 1} / {state.posted.length}</span><button disabled={blocked || selectedIndex >= state.posted.length - 1} onClick={() => setSelectedId(state.posted[selectedIndex + 1].id)} aria-label="下一张安排">下一张</button></nav><button className="schedule-discard" disabled={blocked} onClick={discard}>揉掉这张</button></div>
        </> : <div className="schedule-empty"><h2>Daily Planner</h2><p>这里还没有贴上安排。</p><p>回到书里写下今天的计划，<br />把它们留在抬眼就能看到的地方。</p><p>按 V 回到日程书。</p></div>}
        {message && <footer role="status" aria-live="polite">{message}</footer>}
        {ready && error && <p className="schedule-error" role="alert">{error}<button onClick={retry}>{props.adapters?.schedule ? '重试同步' : '重试保存'}</button></p>}
      </article>
    </Html>}
  </>;
}
