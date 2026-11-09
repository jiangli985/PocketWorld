import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { BookContent, JournalEntry, ScheduleEntry, WorldSceneProps } from '../../types/world';
import { PRESET_BOOKS } from './library';
import { JOURNAL_PLACEMENT, readingPosition } from './FurnitureBooks';
import { JournalNotebook } from './JournalNotebook';
import { ReadingBook } from './ReadingBook';
export function FeatureSurfaces(props: WorldSceneProps) {
  const id = props.focusedObject;
  const [journal, setJournal] = useState<JournalEntry>({ id: 'today', date: new Date().toLocaleDateString('sv-SE'), text: '', updatedAt: '' });
  const [journalVersion, setJournalVersion] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([{ id: 'morning', time: '09:00', title: '', completed: false }, { id: 'afternoon', time: '14:00', title: '', completed: false }, { id: 'evening', time: '20:00', title: '', completed: false }]);
  const [book, setBook] = useState<BookContent>(PRESET_BOOKS[0]);
  const [bookView, setBookView] = useState<'reading' | 'catalog' | 'add'>('reading');
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookText, setBookText] = useState('');
  const bookId = props.objects['book-01']?.itemId ?? 'book-01';
  const selectedBook = props.books.find(entry => entry.id === bookId) ?? PRESET_BOOKS[0];
  const [saveState, setSaveState] = useState('');
  const [loaded, setLoaded] = useState(false);
  const changed = useRef(false);
  const onError = useRef(props.onFeatureError);
  onError.current = props.onFeatureError;
  useEffect(() => { if (id !== 'book-01') setBookView('reading'); }, [id]);
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
          if (!abort.signal.aborted && entry && typeof entry.text === 'string') {
            setJournal(entry);
            setJournalVersion(value => value + 1);
          }
        } else if (id === 'schedule') {
          const stored = props.adapters?.schedule ? null : localStorage.getItem('pocketworld:schedule');
          const entries = props.adapters?.schedule ? await props.adapters.schedule.load(abort.signal) : stored ? JSON.parse(stored) as ScheduleEntry[] : schedule;
          if (!abort.signal.aborted && Array.isArray(entries)) setSchedule(entries.filter(row => typeof row.title === 'string' && typeof row.time === 'string'));
        } else if (id === 'book-01') {
          const content = props.adapters?.library && !bookId.startsWith('visitor-') ? await props.adapters.library.loadBook(bookId, abort.signal) : selectedBook;
          if (!abort.signal.aborted) setBook(content);
        }
        if (!abort.signal.aborted) setLoaded(true);
      } catch { if (!abort.signal.aborted) { if (id === 'book-01') setBook(selectedBook); setLoaded(true); onError.current('内容暂时无法读取，原有记录仍会保留。'); } }
    };
    void load();
    return () => abort.abort();
  }, [id, props.adapters, bookId, selectedBook]);
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
    if (id !== 'book-01' || !loaded || bookId.startsWith('visitor-') || !props.adapters?.library?.saveBookmark) return;
    const abort = new AbortController();
    void props.adapters.library.saveBookmark(book.id, page, abort.signal).catch(() => { if (!abort.signal.aborted) onError.current('阅读位置暂时未能保存。'); });
    return () => abort.abort();
  }, [page, book.id, bookId, loaded, id, props.adapters]);
  const openBook = (nextId: string) => {
    setBookView('reading');
    if (nextId !== bookId) props.onAction({ sceneId: props.sceneId, objectId: 'book-01', kind: 'read', payload: { itemId: nextId } });
  };
  const updateJournal = (entry: JournalEntry) => {
    changed.current = true;
    setJournal(entry);
    if (!props.adapters?.journal) {
      try { localStorage.setItem('pocketworld:journal:today', JSON.stringify(entry)); }
      catch { onError.current('本地存储暂时不可用。'); }
    }
  };
  const updateSchedule = (entryId: string, patch: Partial<ScheduleEntry>) => {
    changed.current = true;
    const rows = schedule.map(row => row.id === entryId ? { ...row, ...patch } : row);
    setSchedule(rows);
    if (!props.adapters?.schedule) {
      try { localStorage.setItem('pocketworld:schedule', JSON.stringify(rows)); }
      catch { onError.current('本地存储暂时不可用。'); }
    }
  };
  if (!id || !['journal', 'schedule', 'book-01'].includes(id) || !loaded || !props.objects[id]?.open || (id === 'journal' && !['active', 'error'].includes(props.transition.phase))) return null;
  if (id === 'journal') return <group position={JOURNAL_PLACEMENT.position} scale={JOURNAL_PLACEMENT.scale}>
    <JournalNotebook key={journalVersion} entry={journal} saveState={saveState} onChange={updateJournal} onGesture={props.onGesture} />
  </group>;
  if (id === 'book-01') return <>
    <ReadingBook book={book} page={page} observatory={props.sceneId === 'observatory'} active={bookView === 'reading'}
      canTurn={['active', 'error'].includes(props.transition.phase)} onCatalog={() => setBookView('catalog')} onAdd={() => setBookView('add')}
      onTurn={(direction, value) => props.onAction({ sceneId: props.sceneId, objectId: 'book-01', kind: 'turn-page', payload: { direction, value } })} />
    {bookView !== 'reading' && <Html center position={readingPosition(props.sceneId === 'observatory')} zIndexRange={[20, 20]}>
    <article className="world-page" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <nav className="world-book-nav" aria-label="书柜导航">
        <button type="button" onClick={() => setBookView('reading')}>返回阅读</button>
        <button type="button" onClick={() => setBookView('catalog')}>书目</button>
        <button type="button" onClick={() => setBookView('add')}>添加书籍</button>
      </nav>
      <small>书柜 · 我的阅读角</small>
      <h2>{bookView === 'catalog' ? '书柜藏书' : '添一本自己的书'}</h2>
      {bookView === 'catalog' && <div className="world-book-list">{props.books.map(entry => <button type="button" key={entry.id} onClick={() => openBook(entry.id)}>
        <strong>{entry.title}</strong><small>{entry.author || '佚名'} · {entry.id.startsWith('visitor-') ? '我的书' : '舱室藏书'}</small>
      </button>)}</div>}
      {bookView === 'add' && <form className="world-book-form" onSubmit={event => {
        event.preventDefault();
        const added = props.onAddBook(bookTitle, bookAuthor, bookText);
        if (!added) return;
        setBookTitle(''); setBookAuthor(''); setBookText('');
        openBook(added.id);
      }}>
        <input aria-label="书名" placeholder="书名" required maxLength={80} value={bookTitle} onChange={event => setBookTitle(event.target.value)} />
        <input aria-label="作者" placeholder="作者（可不填）" maxLength={60} value={bookAuthor} onChange={event => setBookAuthor(event.target.value)} />
        <textarea aria-label="书籍正文" placeholder="在这里写下正文，空一行分隔书页……" required maxLength={10000} value={bookText} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={event => setBookText(event.target.value)} />
        <button type="submit">放进书柜</button>
      </form>}
      <footer>{bookView === 'catalog' ? `${props.books.length} 本藏书 · 点击书名阅读` : '只保存在当前浏览器，空一行分隔书页'}</footer>
    </article>
    </Html>}
  </>;
  return <Html transform position={[0.691, 1.225, -1.95]} rotation={[-Math.PI / 2 + 0.01, 0, 0]} distanceFactor={0.32} zIndexRange={[20, 10]} className="world-page-anchor">
    <article className="world-page" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <small>留一些时间给自己</small>
      <h2>今天的安排</h2>
      <div className="world-agenda">{schedule.map((entry, index) => <label key={entry.id}>
        <input aria-label={`第${index + 1}项时间`} value={entry.time} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={event => updateSchedule(entry.id, { time: event.target.value })} />
        <input aria-label={`第${index + 1}项安排`} placeholder="一件想做的事" value={entry.title} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={event => updateSchedule(entry.id, { title: event.target.value })} />
      </label>)}</div>
      <footer>{saveState || '纸上的时间，慢一点'}</footer>
    </article>
    </Html>
}
