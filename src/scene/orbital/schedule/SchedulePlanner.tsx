import React from 'react';
import type { SchedulePage } from './schedule';

interface PlannerProps {
  page: SchedulePage;
  disabled: boolean;
  readOnly?: boolean;
  onChange: (page: SchedulePage) => void;
  onGesture: (active: boolean) => void;
}

export function SchedulePlanner({ page, disabled, readOnly = false, onChange, onGesture }: PlannerProps) {
  const activeDay = (new Date(`${page.date}T12:00:00`).getDay() + 6) % 7;
  const entry = (index: number, field: 'title' | 'time' | 'content', value: string) => {
    const entries = page.entries.map((item, i) => i === index ? { ...item, [field]: value } : item);
    onChange({ ...page, entries });
  };
  return <div className="planner-page">
    <header className="planner-heading"><h2>Daily Planner</h2></header>
    <div className="planner-date-row">
      <label className="planner-date">Date:<input type="date" aria-label="日程日期" value={page.date} disabled={disabled} readOnly={readOnly} onChange={e => { if (e.target.value) onChange({ ...page, date: e.target.value }); }} /></label>
      <div className="planner-week" aria-label="星期">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <span key={i} className={i === activeDay ? 'is-today' : ''} aria-label={`星期${'一二三四五六日'[i]}`} aria-current={i === activeDay ? 'date' : undefined}>{day}</span>)}</div>
    </div>
    <div className="planner-columns" onFocusCapture={() => onGesture(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onGesture(false); }}>
      <fieldset className="planner-schedule" disabled={disabled}>
        <legend>Schedule</legend>
        <div className="planner-hours">{page.entries.map((item, i) => <div className="planner-hour" key={item.id}>
          <input className="planner-hour-time" aria-label={`第${i + 1}项时间`} value={item.time} maxLength={5} readOnly={readOnly} onChange={e => entry(i, 'time', e.target.value)} />
          <input className="planner-hour-title" aria-label={`第${i + 1}项标题`} value={item.title} maxLength={60} readOnly={readOnly} onChange={e => entry(i, 'title', e.target.value)} title={item.content || item.title} />
          {!readOnly && <details className="planner-detail"><summary aria-label={`第${i + 1}项详情`}>···</summary><textarea aria-label={`第${i + 1}项内容`} value={item.content ?? ''} maxLength={600} placeholder="补充细节…" onChange={e => entry(i, 'content', e.target.value)} /></details>}
        </div>)}</div>
      </fieldset>
      <div className="planner-right">
        <fieldset className="planner-todos" disabled={disabled}>
          <legend>To Do List</legend>
          {page.todos.map((item, i) => <div className={`planner-todo${item.completed ? ' is-complete' : ''}`} key={i}>
            <input type="checkbox" aria-label={`完成待办${i + 1}`} checked={item.completed} disabled={readOnly} onChange={e => onChange({ ...page, todos: page.todos.map((todo, index) => index === i ? { ...todo, completed: e.target.checked } : todo) })} />
            <input aria-label={`待办${i + 1}`} value={item.text} maxLength={80} readOnly={readOnly} onChange={e => onChange({ ...page, todos: page.todos.map((todo, index) => index === i ? { ...todo, text: e.target.value } : todo) })} />
          </div>)}
        </fieldset>
        <fieldset className="planner-tomorrow" disabled={disabled}>
          <legend>For Tomorrow</legend>
          {page.tomorrow.map((text, i) => <label key={i}><span aria-hidden="true" /><input aria-label={`明日计划${i + 1}`} value={text} maxLength={80} readOnly={readOnly} onChange={e => onChange({ ...page, tomorrow: page.tomorrow.map((value, index) => index === i ? e.target.value : value) })} /></label>)}
        </fieldset>
        <fieldset className="planner-notes" disabled={disabled}>
          <legend>Notes</legend>
          <textarea aria-label="日程备注" value={page.notes} maxLength={1200} readOnly={readOnly} onChange={e => onChange({ ...page, notes: e.target.value })} />
        </fieldset>
      </div>
    </div>
  </div>;
}
