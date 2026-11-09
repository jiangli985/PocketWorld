import { useLayoutEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import type { Camera, Object3D } from 'three';
import type { BookContent } from '../../types/world';
import { readingPosition } from './FurnitureBooks';
import { useReadingBook } from './JournalBookState';
import { BOOK } from './book-study/model';
import { journalTextLayout } from './journal-text-layout';

// A longer title uses successive sets of physical leaves, with continuous page numbers.
const PAGES_PER_SECTION = BOOK.leaves * 2 - 1;

function toolbarPosition(object: Object3D, camera: Camera, size: { width: number; height: number }): number[] {
  const point = object.getWorldPosition(new Vector3()).project(camera);
  const y = (1 - point.y) * size.height / 2;
  if (size.width < 600) return [size.width / 2, Math.max(42, Math.min(size.height - 42, y))];
  return [(point.x + 1) * size.width / 2, y];
}

function paintPage(texture: CanvasTexture, book: BookContent, page: number, left: boolean, scroll: number) {
  const ctx = (texture.image as HTMLCanvasElement).getContext('2d')!;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = '#f5f0e1'; ctx.fillRect(0, 0, 318, 428);
  const gutter = ctx.createLinearGradient(left ? 318 : 0, 0, left ? 294 : 24, 0);
  gutter.addColorStop(0, '#d7cfbc'); gutter.addColorStop(1, '#f5f0e1');
  ctx.fillStyle = gutter; ctx.fillRect(left ? 294 : 0, 0, 24, 428);
  const inset = left ? 23 : 33;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#746c56'; ctx.font = '11px Georgia, SimSun, serif';
  ctx.fillText(book.author || 'PocketWorld', inset, 36, 262);
  ctx.fillStyle = '#3e493f'; ctx.font = '21px SimSun, serif';
  ctx.fillText(book.title, inset, 64, 262);
  ctx.strokeStyle = '#c6bba3'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(inset, 76); ctx.lineTo(inset + 262, 76); ctx.stroke();
  ctx.font = '16px SimSun, serif';
  const layout = journalTextLayout(book.pages[page] ?? '这一页暂时空着。', text => ctx.measureText(text).width, inset);
  const maxScroll = Math.max(0, layout.carets[layout.carets.length - 1].y - 382);
  const offset = Math.min(maxScroll, Math.max(0, scroll));
  ctx.save(); ctx.beginPath(); ctx.rect(inset, 81, 262, 306); ctx.clip();
  for (const glyph of layout.glyphs) {
    const y = glyph.y - offset;
    if (y >= 81 && y < 408) ctx.fillText(glyph.text, glyph.x, y);
  }
  ctx.restore();
  ctx.fillStyle = '#746c56'; ctx.font = '11px Georgia, serif';
  ctx.textAlign = left ? 'left' : 'right';
  ctx.fillText(`${page + 1} / ${book.pages.length}`, left ? inset : inset + 262, 407);
  texture.needsUpdate = true;
  return { offset, maxScroll };
}

export function ReadingBook({ book, page, observatory, active, canTurn, onTurn, onCatalog, onAdd }: {
  book: BookContent; page: number; observatory: boolean; active: boolean; canTurn: boolean;
  onTurn: (direction: number, destination: number) => void; onCatalog: () => void; onAdd: () => void;
}) {
  const reader = useReadingBook();
  const [ready, setReady] = useState(false), [overflow, setOverflow] = useState(false);
  const offsets = useRef(new Map<number, number>());
  const start = Math.floor(page / PAGES_PER_SECTION) * PAGES_PER_SECTION;
  const spread = Math.ceil((page - start) / 2);
  const visible = [spread * 2 - 1, spread * 2].filter(index => index >= 0 && index < PAGES_PER_SECTION && start + index < book.pages.length);
  const previous = spread === 0 ? start - 1 : start + Math.max(0, spread * 2 - 3);
  const next = start + spread * 2 + 1;
  const paint = (index: number, delta = 0) => {
    const pageIndex = start + index, control = reader.current;
    let texture = control.textures.get(index) as CanvasTexture | undefined;
    if (!texture) {
      const canvas = document.createElement('canvas'); canvas.width = 636; canvas.height = 856;
      texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
      control.textures.set(index, texture); control.revision++;
    }
    const { offset, maxScroll } = paintPage(texture, book, pageIndex, index % 2 === 1, (offsets.current.get(pageIndex) ?? 0) + delta);
    offsets.current.set(pageIndex, offset);
    return maxScroll;
  };
  useLayoutEffect(() => {
    const control = reader.current, edition = `${book.id}:${start}`;
    if (edition !== control.edition) {
      control.textures.forEach(texture => texture.dispose()); control.textures.clear(); control.revision++;
      offsets.current.clear(); control.edition = edition; control.ready = false;
    }
    control.spread = spread;
    setReady(control.ready && control.opening === 1 && control.cursor === spread);
    control.onSettled = () => setReady(control.opening === 1);
    let hasOverflow = false;
    // Only the facing pages and the leaves that can be exposed during the next turn need ink.
    for (let index = Math.max(0, spread * 2 - 3); index <= spread * 2 + 2 && index < PAGES_PER_SECTION && start + index < book.pages.length; index++) {
      const maxScroll = paint(index);
      if (visible.includes(index) && maxScroll > 0) hasOverflow = true;
    }
    setOverflow(hasOverflow);
    return () => { control.onSettled = undefined; };
  }, [book, reader, spread, start]);

  const turn = (direction: number) => {
    const destination = direction < 0 ? previous : next;
    if (active && canTurn && ready && reader.current.ready && destination >= 0 && destination < book.pages.length) onTurn(direction, destination);
  };
  useLayoutEffect(() => {
    const control = reader.current;
    control.turn = turn;
    control.onPaperPointer = (index, _u, _v, kind, _shift, delta) => {
      if (!active || kind !== 'wheel' || !visible.includes(index)) return false;
      paint(index, (delta ?? 0) * 0.5);
    };
    const key = (event: KeyboardEvent) => {
      if (!active || (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)))) return;
      if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return;
      event.preventDefault(); turn(event.code === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', key);
    return () => {
      control.turn = undefined; control.onPaperPointer = undefined;
      window.removeEventListener('keydown', key);
    };
  });

  if (!active) return null;
  const [x, y, z] = readingPosition(observatory);
  const label = visible.map(index => start + index + 1).join('–');
  return <Html center position={[x, y, z + 0.36]} calculatePosition={toolbarPosition} zIndexRange={[20, 20]}>
    <nav className="world-reader-tools" aria-label="书柜导航" aria-busy={!ready || !canTurn}>
      <button type="button" onClick={onCatalog}>书目</button>
      <button type="button" onClick={onAdd}>添加书籍</button>
      <button type="button" aria-label="上一页" onClick={() => turn(-1)} disabled={!ready || !canTurn || previous < 0}>‹</button>
      <output aria-label="阅读页码">{label} / {book.pages.length}</output>
      <button type="button" aria-label="下一页" onClick={() => turn(1)} disabled={!ready || !canTurn || next >= book.pages.length}>›</button>
      {overflow && <>
        <button type="button" aria-label="向上滚动正文" onClick={() => visible.forEach(index => paint(index, -140))}>↑</button>
        <button type="button" aria-label="向下滚动正文" onClick={() => visible.forEach(index => paint(index, 140))}>↓</button>
      </>}
      <article className="sr-only" aria-label={book.title}>
        {visible.map(index => <p key={index}>{book.pages[start + index]}</p>)}
      </article>
    </nav>
  </Html>;
}
