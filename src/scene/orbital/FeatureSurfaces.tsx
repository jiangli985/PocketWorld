import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { JournalEntry, WorldSceneProps } from '../../types/world';
export function FeatureSurfaces(props: WorldSceneProps) {
  const id = props.focusedObject;
  const [journal, setJournal] = useState<JournalEntry>({ id: 'today', date: new Date().toLocaleDateString('sv-SE'), text: '', updatedAt: '' });
  const [saveState, setSaveState] = useState('');
  const [loaded, setLoaded] = useState(false);
  const changed = useRef(false), onError = useRef(props.onFeatureError);
  onError.current = props.onFeatureError;
  useEffect(() => {
    const abort = new AbortController(); setLoaded(false); changed.current = false; setSaveState('');
    if (id === 'journal') void (async () => {
      try {
        const stored = props.adapters?.journal ? null : localStorage.getItem('pocketworld:journal:today');
        const entry = props.adapters?.journal ? await props.adapters.journal.load(abort.signal) : stored ? JSON.parse(stored) as JournalEntry : journal;
        if (!abort.signal.aborted && entry && typeof entry.text === 'string') setJournal(entry);
      } catch { if (!abort.signal.aborted) onError.current('日记暂时无法读取，原记录仍会保留。'); }
      if (!abort.signal.aborted) setLoaded(true);
    })();
    return () => abort.abort();
  }, [id, props.adapters]);
  useEffect(() => {
    if (!loaded || !changed.current || id !== 'journal') return;
    const abort = new AbortController(); setSaveState('正在记录');
    const timer = window.setTimeout(async () => {
      try {
        const entry = { ...journal, updatedAt: new Date().toISOString() };
        if (props.adapters?.journal) await props.adapters.journal.save(entry, abort.signal);
        else localStorage.setItem('pocketworld:journal:today', JSON.stringify(entry));
        if (!abort.signal.aborted) setSaveState('已记下');
      } catch { if (!abort.signal.aborted) { setSaveState('尚未保存'); onError.current('内容没有保存成功，请暂时保留这一页。'); } }
    }, 450);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [journal, id, loaded, props.adapters]);
  if (id !== 'journal' || !loaded || !props.objects.journal?.open) return null;
  return <Html transform position={[-0.482, 1.225, -1.92]} rotation={[-Math.PI / 2 + .01, 0, 0]} distanceFactor={.32} zIndexRange={[20, 10]} className="world-page-anchor"><article className="world-page" onPointerDown={e => e.stopPropagation()}><small>{journal.date}</small><h2>今天，想记住什么？</h2><textarea aria-label="今天的日记" value={journal.text} onFocus={() => props.onGesture(true)} onBlur={() => props.onGesture(false)} onChange={e => { changed.current = true; setJournal(current => ({ ...current, text: e.target.value })); }} /><footer>{saveState || '纸上的时间，慢一点'}</footer></article></Html>;
}
