import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { WorldSceneProps } from '../../types/world';
import { useSchedule } from './ScheduleContext';
import { discardSchedulePage, postSchedulePage, schedulePageError, type SchedulePage } from './schedule';
import { BOOK_POSITION, FloorPaperBall, FlyingPaper, GLASS_POSITION, PostedPaper, type PaperFlight } from './SchedulePaper';
import './schedule.css';

export function ScheduleSurfaces(props: WorldSceneProps & { visible: boolean }) {
  const { state, commit, ready, status, error, retry } = useSchedule();
  const narrow = useThree(({ size }) => size.width < 720);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flight, setFlight] = useState<PaperFlight | null>(null);
  const [message, setMessage] = useState('');
  const [deciding, setDeciding] = useState(false);
  const article = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const bookView = props.focusedObject === 'schedule';
  const glassView = props.focusedObject === 'schedule-glass';
  const focused = props.visible && (bookView || glassView);
  const selectedIndex = Math.max(0, state.posted.findIndex(page => page.id === selectedId));
  const selected = state.posted[selectedIndex];
  const settled = ['active', 'error', 'idle'].includes(props.transition.phase);
  const switchView = () => {
    if (busy.current || !settled) return;
    props.onGesture(false);
    props.onAction({ sceneId: props.sceneId, objectId: glassView ? 'schedule' : 'schedule-glass', kind: glassView ? 'plan' : 'inspect' });
  };
  useEffect(() => {
    if (!focused) { setDeciding(false); return; }
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (event.code === 'KeyV') { event.preventDefault(); switchView(); }
      if (glassView && !busy.current && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
        event.preventDefault();
        const next = state.posted[selectedIndex + (event.code === 'ArrowLeft' ? -1 : 1)];
        if (next) setSelectedId(next.id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [focused, glassView, selectedIndex, state.posted, settled, props.onAction]);
  useEffect(() => {
    if (focused && settled && !flight) article.current?.focus({ preventScroll: true });
  }, [focused, bookView, settled, flight, deciding]);
  const update = (index: number, field: 'title' | 'time' | 'content', value: string) => {
    const entries = [...state.current.entries] as SchedulePage['entries'];
    entries[index] = { ...entries[index], [field]: value };
    commit({ ...state, current: { ...state.current, entries } });
    setMessage('');
  };
  const post = () => {
    if (busy.current || !settled) return;
    const invalid = schedulePageError(state.current);
    if (invalid) { setMessage(invalid); return; }
    const page = state.current;
    if (!commit(postSchedulePage(state))) return;
    busy.current = true;
    setDeciding(false); setMessage(''); setSelectedId(page.id);
    setFlight({ kind: 'post', page });
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
  const blocked = !ready || !!flight || !settled;
  return <>
    {state.posted.slice(Math.max(0, selectedIndex - 2), selectedIndex + 3).map(page => {
      const offset = state.posted.indexOf(page) - selectedIndex;
      if (flight && (flight.page.id === page.id || offset === 0)) return null;
      return <PostedPaper key={page.id} page={page} position={[GLASS_POSITION[0] + offset * 0.68, GLASS_POSITION[1] - Math.abs(offset) * 0.035, GLASS_POSITION[2]]} onSelect={() => {
        if (busy.current || !props.visible) return;
        setSelectedId(page.id);
        if (!glassView) props.onAction({ sceneId: props.sceneId, objectId: 'schedule-glass', kind: 'inspect' });
      }} />;
    })}
    {state.discarded.filter(ball => flight?.page.id !== ball.id).map(ball => <FloorPaperBall key={ball.id} ball={ball} />)}
    {flight && <FlyingPaper flight={flight} reducedMotion={props.reducedMotion} onComplete={() => { busy.current = false; setFlight(null); }} />}
    {focused && !flight && <Html transform={!narrow} center={narrow} position={bookView ? BOOK_POSITION : [GLASS_POSITION[0], GLASS_POSITION[1], GLASS_POSITION[2] + 0.018]}
      rotation={bookView ? [-Math.PI / 2, 0, 0.08] : [0, 0, 0]} distanceFactor={narrow ? undefined : bookView ? 0.28 : 0.62} zIndexRange={[24, 21]}>
      <article ref={article} tabIndex={-1} className={`schedule-sheet ${glassView ? 'is-posted' : ''}`} aria-label={bookView ? '日程书当前页' : '玻璃上的日程'} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
        <header className="schedule-heading"><h2>{glassView && !selected ? '玻璃上的安排' : '今天的安排'}</h2><span>{glassView ? selected?.date ?? state.current.date : state.current.date}</span></header>
        {!ready ? <div className="schedule-empty"><p>{error || '正在翻开日程……'}</p>{error && <button onClick={retry}>重新读取</button>}</div> : bookView ? <>
          <div className="schedule-tasks">{state.current.entries.map((entry, index) => <fieldset key={entry.id} disabled={blocked || deciding}>
            <legend>任务 {index + 1}</legend>
            <div className="schedule-task-heading"><label className="schedule-title"><span>标题</span><input aria-label={`第${index + 1}项标题`} maxLength={60} placeholder="一件想做的事" value={entry.title} onChange={e => update(index, 'title', e.target.value)} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} /></label>
              <label className="schedule-time"><span>时间</span><input type="time" aria-label={`第${index + 1}项时间`} value={entry.time} onChange={e => update(index, 'time', e.target.value)} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} /></label></div>
            <label className="schedule-content"><span>内容</span><textarea aria-label={`第${index + 1}项内容`} maxLength={600} rows={2} placeholder="写下细节，给自己一个小提醒……" value={entry.content ?? ''} onChange={e => update(index, 'content', e.target.value)} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} /></label>
          </fieldset>)}</div>
          {deciding ? <div className="schedule-decision"><p>把这一页贴到玻璃上吗？</p><div><button onClick={() => { setDeciding(false); setMessage('已留在当前页，随时接着写。'); }}>先不贴，留在本页</button><button className="schedule-primary" disabled={blocked} onClick={post}>贴到玻璃上</button></div></div>
            : <div className="schedule-actions"><span>第 {state.current.number} 页{state.queued.length > 0 ? ` · 还有 ${state.queued.length} 页旧安排` : ''}</span><button className="schedule-primary" disabled={blocked} onClick={() => {
              const invalid = schedulePageError(state.current);
              if (invalid) setMessage(invalid); else { setMessage(''); setDeciding(true); }
            }}>写好了</button></div>}
        </> : selected ? <>
          <div className="schedule-posted-tasks">{selected.entries.map((entry, index) => <section key={entry.id}><div><span>任务 {index + 1}</span><time>{entry.time || '留一点空白'}</time></div><h3>{entry.title || '这一项，留给之后的自己'}</h3><p>{entry.content || '没有补充内容'}</p></section>)}</div>
          <div className="schedule-actions"><nav aria-label="玻璃日程翻页"><button disabled={blocked || selectedIndex === 0} onClick={() => setSelectedId(state.posted[selectedIndex - 1].id)} aria-label="上一张安排">上一张</button><span>{selectedIndex + 1} / {state.posted.length}</span><button disabled={blocked || selectedIndex >= state.posted.length - 1} onClick={() => setSelectedId(state.posted[selectedIndex + 1].id)} aria-label="下一张安排">下一张</button></nav><button className="schedule-discard" disabled={blocked} onClick={discard}>揉掉这张</button></div>
        </> : <div className="schedule-empty"><p>这里还没有贴上安排。</p><p>回到书里写两件想做的事，<br />把它们留在抬眼就能看到的地方。</p><button onClick={switchView}>回到日程书</button></div>}
        <footer><span role="status" aria-live="polite">{message || status}</span><button disabled={!!flight || !settled} onClick={switchView}>{glassView ? '回到书本' : `看玻璃${state.posted.length ? ` · ${state.posted.length} 张` : ''}`} <kbd>V</kbd></button></footer>
        {ready && error && <p className="schedule-error" role="alert">{error}{props.adapters?.schedule && <button onClick={retry}>重试同步</button>}</p>}
      </article>
    </Html>}
  </>;
}
