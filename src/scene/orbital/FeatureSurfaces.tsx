import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { BookContent, JournalEntry, ScheduleEntry, WorldSceneProps } from '../../types/world';

const INITIAL_BOOK: BookContent = { id: 'book-01', title: '轨道上的日常', author: 'PocketWorld', pages: [
  '晨光越过窗沿，落在没有合上的书页上。\n\n在这座缓缓旋转的居住舱里，遥远的地球也成为了日常的一部分。',
  '窗外的星星没有闪烁。\n\n我们看到的光，已经走过了漫长的旅程。此刻，刚好抵达。',
  '给植物浇水，听完一张唱片，然后写下今天想记住的事情。\n\n再远的地方，也可以有自己的生活。',
] };
export function FeatureSurfaces(props: WorldSceneProps) {
  const id = props.focusedObject;
  const [journal, setJournal] = useState<JournalEntry>({ id: 'today', date: new Date().toLocaleDateString('sv-SE'), text: '', updatedAt: '' });
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([{ id: 'morning', time: '09:00', title: '', completed: false }, { id: 'afternoon', time: '14:00', title: '', completed: false }, { id: 'evening', time: '20:00', title: '', completed: false }]);
  const [book, setBook] = useState(INITIAL_BOOK);
  const [saveState, setSaveState] = useState('');
  const [loaded, setLoaded] = useState(false);
  const changed = useRef(false);
  const swipeStart = useRef<{ id: number; x: number; y: number; multi: boolean } | null>(null);
  const onError = useRef(props.onFeatureError);
  onError.current = props.onFeatureError;
  useEffect(() => {
    const abort = new AbortController();
    setLoaded(false);
    changed.current = false;
    setSaveState('');
    const load = async () => {
      try {
        if (id === 'journal') {
          const stored = props.adapters?.journal ? null : localStorage.getItem('pocketworld:journal:today');
          const entry = props.adapters?.journal ? await props.adapters.journal.load(abort.signal) : stored ? JSON.parse(stored) as JournalEntry : journal;
          if (!abort.signal.aborted && entry && typeof entry.text === 'string') setJournal(entry);
        } else if (id === 'schedule') {
          const stored = props.adapters?.schedule ? null : localStorage.getItem('pocketworld:schedule');
          const entries = props.adapters?.schedule ? await props.adapters.schedule.load(abort.signal) : stored ? JSON.parse(stored) as ScheduleEntry[] : schedule;
          if (!abort.signal.aborted && Array.isArray(entries)) setSchedule(entries.filter(row => typeof row.title === 'string' && typeof row.time === 'string'));
        } else if (id === 'book-01') {
          const content = props.adapters?.library ? await props.adapters.library.loadBook('book-01', abort.signal) : INITIAL_BOOK;
          if (!abort.signal.aborted) setBook(content);
        }
        if (!abort.signal.aborted) setLoaded(true);
      } catch { if (!abort.signal.aborted) { setLoaded(true); onError.current('内容暂时无法读取，原有记录仍会保留。'); } }
    };
    void load();
    return () => abort.abort();
  }, [id, props.adapters]);
  useEffect(() => {
    if (!loaded || !changed.current || (id !== 'journal' && id !== 'schedule')) return;
    const abort = new AbortController();
    setSaveState('正在记录');
    const timer = window.setTimeout(async () => {
      try {
        if (id === 'journal') {
          const entry = { ...journal, updatedAt: new Date().toISOString() };
          if (props.adapters?.journal) await props.adapters.journal.save(entry, abort.signal);
          else localStorage.setItem('pocketworld:journal:today', JSON.stringify(entry));
        } else {
          if (props.adapters?.schedule) await props.adapters.schedule.save(schedule, abort.signal);
          else localStorage.setItem('pocketworld:schedule', JSON.stringify(schedule));
        }
        if (!abort.signal.aborted) setSaveState('已记下');
      } catch { if (!abort.signal.aborted) { setSaveState('尚未保存'); onError.current('内容没有保存成功，请暂时保留这一页。'); } }
    }, 450);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [journal, schedule, id, loaded, props.adapters]);
  const page = Math.min(Math.max(0, props.objects['book-01']?.page ?? 0), Math.max(0, book.pages.length - 1));
  useEffect(() => {
    if (id !== 'book-01' || !props.adapters?.library?.saveBookmark) return;
    const abort = new AbortController();
    void props.adapters.library.saveBookmark(book.id, page, abort.signal).catch(() => { if (!abort.signal.aborted) onError.current('阅读位置暂时未能保存。'); });
    return () => abort.abort();
  }, [page, book.id, id, props.adapters]);
  useEffect(() => {
    if (id !== 'book-01') return;
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return;
      event.preventDefault();
      const direction = event.code === 'ArrowRight' ? 1 : -1;
      if (page + direction < 0 || page + direction >= book.pages.length) return;
      props.onAction({ sceneId: props.sceneId, objectId: 'book-01', kind: 'turn-page', payload: { direction, value: page + direction } });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [id, page, book.pages.length, props.sceneId, props.onAction]);
  const updateSchedule = (entryId: string, patch: Partial<ScheduleEntry>) => {
    changed.current = true;
    const rows = schedule.map(row => row.id === entryId ? { ...row, ...patch } : row);
    setSchedule(rows);
    if (!props.adapters?.schedule) {
      try { localStorage.setItem('pocketworld:schedule', JSON.stringify(rows)); }
      catch { onError.current('本地存储暂时不可用。'); }
    }
  };
  if (!id || !['journal', 'schedule', 'book-01'].includes(id) || !loaded || !props.objects[id]?.open) return null;
  const placement: Record<string, [number, number, number]> = { journal: [-0.482, 1.225, -1.92], schedule: [0.691, 1.225, -1.95], 'book-01': [-3.40, 0.79, props.sceneId === 'observatory' ? -0.61 : -1.86] };
  return <Html transform position={placement[id]} rotation={[-Math.PI / 2 + 0.01, 0, 0]} distanceFactor={0.32} zIndexRange={[20, 10]} className="world-page-anchor">
    <article className="world-page" style={{ touchAction: id === 'book-01' ? 'pan-y' : 'auto' }} onPointerDown={event => {
      event.stopPropagation();
      if (swipeStart.current) { swipeStart.current.multi = true; return; }
      swipeStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY, multi: !event.isPrimary };
    }} onPointerUp={event => {
      event.stopPropagation();
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || start.multi || start.id !== event.pointerId || id !== 'book-01' || Math.abs(event.clientX - start.x) < 25 || Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x)) return;
      const direction = event.clientX < start.x ? 1 : -1;
      if (page + direction >= 0 && page + direction < book.pages.length) props.onAction({ sceneId: props.sceneId, objectId: id, kind: 'turn-page', payload: { direction, value: page + direction } });
    }} onPointerCancel={() => { swipeStart.current = null; }} onWheel={event => event.stopPropagation()}>
      <small>{id === 'journal' ? journal.date : id === 'schedule' ? '留一些时间给自己' : book.author}</small>
      <h2>{id === 'journal' ? '今天，记住什么' : id === 'schedule' ? '今天的安排' : book.title}</h2>
      {id === 'journal' && <textarea aria-label="日记正文" placeholder="写下此刻的想法……" value={journal.text} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={event => {
        changed.current = true;
        const entry = { ...journal, text: event.target.value, updatedAt: new Date().toISOString() };
        setJournal(entry);
        if (!props.adapters?.journal) { try { localStorage.setItem('pocketworld:journal:today', JSON.stringify(entry)); } catch { onError.current('本地存储暂时不可用。'); } }
      }} />}
      {id === 'schedule' && <div className="world-agenda">{schedule.map((entry, index) => <label key={entry.id}>
        <input aria-label={`第${index + 1}项时间`} value={entry.time} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={event => updateSchedule(entry.id, { time: event.target.value })} />
        <input aria-label={`第${index + 1}项安排`} placeholder="一件想做的事" value={entry.title} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={event => updateSchedule(entry.id, { title: event.target.value })} />
      </label>)}</div>}
      {id === 'book-01' && <p className="world-book-text">{book.pages[page] ?? '这一页暂时空着。'}</p>}
      <footer>{id === 'book-01' ? `${page + 1} / ${book.pages.length} · 滑动书页` : saveState || '纸上的时间，慢一点'}</footer>
    </article>
  </Html>;
}
