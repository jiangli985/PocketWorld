import { useState, type MutableRefObject, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import type { BoundBookControl } from '../journal/bookControl';
import { BOOK, leafPose, paperHalfThickness } from '../journal/bookModel';
import type { SchedulePage } from './schedule';

function PaperField({ x, y, width, height, book, leafCount, children }: {
  x: number; y: number; width: number; height: number; book: MutableRefObject<BoundBookControl>; leafCount: number; children: ReactNode;
}) {
  const u = (x + width / 2) / 560;
  const pose = leafPose(book.current.spread, 0, 1, book.current.spread, leafCount);
  const column = Math.min(BOOK.segments - 1, Math.floor(u * BOOK.segments)), t = u * BOOK.segments - column;
  const a = pose.points[column], b = pose.points[column + 1], angle = pose.angles[column];
  const thickness = paperHalfThickness(u, leafCount) + 0.0015;
  return <group position={[a.x + (b.x - a.x) * t - Math.sin(angle) * thickness, a.y + (b.y - a.y) * t + Math.cos(angle) * thickness, ((y + height / 2) / 872 - 0.5) * BOOK.height]} rotation-z={angle}>
    <Html transform rotation-x={-Math.PI / 2} scale={[1, (BOOK.height / 872) / (BOOK.width / 560), 1]} distanceFactor={BOOK.width / 560 * 400} zIndexRange={[24, 23]}>
      <div className="planner-native-field" style={{ width, height }} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>{children}</div>
    </Html>
  </group>;
}

export function SchedulePageEditor({ page, book, leafCount, onChange, onGesture, previousDisabled, nextDisabled }: {
  page: SchedulePage; book: MutableRefObject<BoundBookControl>; leafCount: number; onChange: (page: SchedulePage) => void; onGesture: (active: boolean) => void; previousDisabled: boolean; nextDisabled: boolean;
}) {
  const [detail, setDetail] = useState<number | null>(null);
  const focus = { onFocus: () => onGesture(true), onBlur: () => onGesture(false) };
  const entry = (index: number, patch: Partial<SchedulePage['entries'][number]>) => onChange({ ...page, entries: page.entries.map((value, i) => i === index ? { ...value, ...patch } : value) });
  const flip = (direction: -1 | 1) => { (document.activeElement as HTMLElement)?.blur?.(); book.current.onTurn?.(direction); };
  const field = (x: number, y: number, width: number, height: number, children: ReactNode, key: string) => <PaperField key={key} x={x} y={y} width={width} height={height} book={book} leafCount={leafCount}>{children}</PaperField>;
  return <group name="Schedule_PageEditor">
    {field(92, 112, 181, 34, <input type="date" aria-label="日程日期" value={page.date} {...focus} onChange={event => { if (event.target.value) onChange({ ...page, date: event.target.value }); }} />, 'date')}
    {page.entries.map((value, i) => field(48, 212 + i * 73, 210, 40, <div className="planner-native-row">
      <input className="planner-native-time" aria-label={`第${i + 1}项时间`} value={value.time} maxLength={5} {...focus} onChange={event => entry(i, { time: event.target.value })} />
      <input aria-label={`第${i + 1}项标题`} value={value.title} title={value.content || value.title} maxLength={60} {...focus} onChange={event => entry(i, { title: event.target.value })} />
      <button aria-label={`第${i + 1}项详情`} onClick={() => setDetail(i)}>详情</button>
    </div>, value.id))}
    {page.todos.map((value, i) => field(295, 211 + i * 45, 212, 38, <div className="planner-native-todo">
      <input type="checkbox" aria-label={`完成待办${i + 1}`} checked={value.completed} {...focus} onChange={event => onChange({ ...page, todos: page.todos.map((todo, index) => index === i ? { ...todo, completed: event.target.checked } : todo) })} />
      <input aria-label={`待办${i + 1}`} value={value.text} maxLength={80} {...focus} onChange={event => onChange({ ...page, todos: page.todos.map((todo, index) => index === i ? { ...todo, text: event.target.value } : todo) })} />
    </div>, `todo-${i}`))}
    {page.tomorrow.map((value, i) => field(320, 419 + i * 53, 186, 40, <input aria-label={`明日计划${i + 1}`} value={value} maxLength={80} {...focus} onChange={event => onChange({ ...page, tomorrow: page.tomorrow.map((text, index) => index === i ? event.target.value : text) })} />, `tomorrow-${i}`))}
    {field(297, 591, 210, 193, <textarea aria-label="日程备注" value={page.notes} maxLength={1200} {...focus} onChange={event => onChange({ ...page, notes: event.target.value })} />, 'notes')}
    {field(35, 807, 490, 45, <nav className="planner-native-nav" aria-label="日程本翻页"><button disabled={previousDisabled} aria-label="日程上一页" onClick={() => flip(-1)}>上一页</button><span className="sr-only" role="status" aria-label="日程书当前页">第 {page.number} 页 · 在书页上直接编辑</span><button disabled={nextDisabled} aria-label="日程下一页" onClick={() => flip(1)}>下一页</button></nav>, 'navigation')}
    {detail !== null && field(50, Math.min(678, 250 + detail * 73), 210, 100, <textarea className="planner-native-detail" aria-label={`第${detail + 1}项内容`} value={page.entries[detail].content ?? ''} maxLength={600} autoFocus onFocus={() => onGesture(true)} onBlur={() => { onGesture(false); setDetail(null); }} onChange={event => entry(detail, { content: event.target.value })} />, 'detail')}
  </group>;
}
