import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./schedule.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, crypto: webcrypto };
vm.runInNewContext(output, context);
const { migrateSchedule, openSchedulePage, turnSchedulePage, postSchedulePage, discardSchedulePage, schedulePageError, isScheduleNotebook, flattenSchedule, readScheduleNotebook, SCHEDULE_KEY, MAX_POSTED_SCHEDULES } = context.exports;
const entry = (id, time = '09:00') => ({ id, title: `任务 ${id}`, time, completed: false, content: `正文 ${id}` });

test('reopening selects the first available sheet and retains later drafts without recreating posted pages', () => {
  let state = migrateSchedule([entry('first')]);
  const firstId = state.current.id;
  state = turnSchedulePage(state, 1);
  state.current.notes = '第二页的正文';
  const secondId = state.current.id;
  state = turnSchedulePage(state, 1);
  state.current.todos[2].text = '第三页待办';
  const lastId = state.current.id;
  const opened = openSchedulePage(state);
  assert.equal(opened.current.id, firstId);
  assert.equal(opened.queued.find(page => page.id === secondId).notes, '第二页的正文');
  assert.equal(opened.queued.find(page => page.id === lastId).todos[2].text, '第三页待办');
  assert.equal(openSchedulePage(opened), opened);
  const posted = postSchedulePage(opened);
  const after = openSchedulePage(turnSchedulePage(posted, 1));
  assert.equal(after.current.id, secondId);
  assert.equal(after.posted[0].id, firstId);
  assert.equal([after.current, ...after.queued].some(page => page.id === firstId), false);
});

test('turning forward and back preserves drafts and revisits the same next page', () => {
  const first = migrateSchedule([entry('first')]);
  first.current.todos[0].text = '今天的待办';
  first.current.notes = '第一页备注';
  assert.equal(turnSchedulePage(first, -1), first);
  const next = turnSchedulePage(first, 1);
  assert.equal(next.current.number, 2);
  assert.equal(next.current.notes, '');
  next.current.notes = '第二页备注';
  const previous = turnSchedulePage(next, -1);
  assert.equal(previous.current.id, first.current.id);
  assert.equal(previous.current.notes, '第一页备注');
  assert.equal(previous.current.todos[0].text, '今天的待办');
  assert.equal(turnSchedulePage(previous, 1).current.id, next.current.id);
  assert.equal(turnSchedulePage(previous, 1).current.notes, '第二页备注');
  const posted = postSchedulePage(previous);
  assert.equal(posted.posted[0].id, first.current.id);
  assert.equal(posted.current.id, next.current.id);
});

test('legacy schedules retain every task and completion when a planner fills up', () => {
  const legacy = Array.from({ length: 9 }, (_, i) => ({ ...entry(String(i)), completed: i === 1 }));
  let state = migrateSchedule(legacy);
  assert.equal(state.current.entries.length, 8);
  assert.equal(state.queued[0].entries[0].id, '8');
  state = postSchedulePage(state);
  assert.equal(state.posted[0].entries[1].completed, true);
  assert.equal(state.current.entries[0].content, '正文 8');
  assert.equal(state.current.number, 2);
  assert.equal(legacy.length, 9);
});

test('fresh hourly labels do not make an empty planner postable', () => {
  const state = migrateSchedule();
  assert.equal(state.current.entries[0].time, '08:00');
  assert.equal(state.current.entries[7].time, '22:00');
  assert.ok(schedulePageError(state.current));
  assert.equal(postSchedulePage(state), state);
});

test('to-dos, tomorrow plans and notes survive posting independently of timed tasks', () => {
  for (const field of ['todos', 'tomorrow', 'notes']) {
    const state = migrateSchedule();
    if (field === 'todos') state.current.todos[2] = { text: '读完这一章', completed: true };
    if (field === 'tomorrow') state.current.tomorrow[1] = '给薄荷浇水';
    if (field === 'notes') state.current.notes = '留一点时间看地球';
    assert.equal(schedulePageError(state.current), null);
    const posted = postSchedulePage(state);
    assert.equal(posted.posted.length, 1);
    assert.deepEqual(posted.posted[0][field], state.current[field]);
    assert.equal(schedulePageError(posted.current) !== null, true);
    assert.equal(isScheduleNotebook(JSON.parse(JSON.stringify(posted))), true);
  }
});

test('v1 notebook migration preserves page identity, old text and the original storage value', () => {
  const oldPage = { id: 'old-page', number: 3, date: '2026-11-15', entries: [entry('old-a'), { ...entry('old-b'), completed: true }] };
  const old = { version: 1, current: oldPage, posted: [{ ...oldPage, id: 'posted-page' }], queued: [], discarded: [{ id: 'ball', seed: 2 }], syncPending: true, syncRemovedIds: ['removed'] };
  const original = JSON.stringify(old);
  const values = new Map([['pocketworld:schedule:notebook:v1', original]]);
  const upgraded = readScheduleNotebook({ getItem: key => values.get(key) ?? null });
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.current.id, 'old-page');
  assert.equal(upgraded.current.entries[0].content, '正文 old-a');
  assert.equal(upgraded.current.entries[1].completed, true);
  assert.equal(upgraded.posted[0].id, 'posted-page');
  assert.equal(upgraded.current.todos.length, 3);
  assert.equal(upgraded.current.tomorrow.length, 2);
  assert.equal(upgraded.discarded[0].id, 'ball');
  assert.equal(upgraded.syncRemovedIds[0], 'removed');
  assert.equal(values.get('pocketworld:schedule:notebook:v1'), original);
  assert.equal(isScheduleNotebook(upgraded), true);
  values.set(SCHEDULE_KEY, JSON.stringify({ ...upgraded, current: { ...upgraded.current, notes: '新版草稿' } }));
  assert.equal(readScheduleNotebook({ getItem: key => values.get(key) ?? null }).current.notes, '新版草稿');
});

test('reducing planner density moves filled overflow to queued pages without losing old content', () => {
  const oldPage = {
    id: 'busy-page', number: 4, date: '2026-11-15',
    entries: Array.from({ length: 17 }, (_, i) => entry(`busy-${i}`)),
    todos: Array.from({ length: 8 }, (_, i) => ({ text: `旧待办${i}`, completed: i === 7 })),
    tomorrow: ['明日一', '明日二', '明日三', '明日四'], notes: '原来的备注',
  };
  const original = JSON.stringify({ version: 2, current: oldPage, posted: [], queued: [], discarded: [] });
  const values = new Map([['pocketworld:schedule:notebook:v2', original]]);
  const state = readScheduleNotebook({ getItem: key => values.get(key) ?? null });
  assert.equal(state.current.id, 'busy-page');
  assert.equal(state.current.entries.length, 8);
  assert.equal(state.current.todos.length, 3);
  assert.equal(state.current.tomorrow.length, 2);
  assert.equal(state.current.notes, '原来的备注');
  const pages = JSON.parse(JSON.stringify([state.current, ...state.queued]));
  for (const oldEntry of oldPage.entries) assert.deepEqual(pages.flatMap(page => page.entries).find(item => item.id === oldEntry.id), oldEntry);
  for (const todo of oldPage.todos) assert.deepEqual(pages.flatMap(page => page.todos).find(item => item.text === todo.text), todo);
  assert.equal(pages.flatMap(page => page.tomorrow).filter(Boolean).length, 4);
  assert.equal(state.queued[0].number, 5);
  assert.equal(state.queued[1].number, 6);
  assert.equal(values.get('pocketworld:schedule:notebook:v2'), original);
  assert.equal(isScheduleNotebook(state), true);
});

test('empty legacy rows are removed when reducing density rather than creating empty overflow pages', () => {
  const original = JSON.stringify({ version: 2, current: {
    id: 'empty-old', number: 1, date: '2026-11-15',
    entries: Array.from({ length: 17 }, (_, i) => ({ id: `empty-${i}`, title: '', content: '', completed: false, time: `${String(i + 6).padStart(2, '0')}:00` })),
    todos: Array.from({ length: 8 }, () => ({ text: '', completed: false })), tomorrow: ['', '', '', ''], notes: '',
  }, posted: [], queued: [], discarded: [] });
  const state = readScheduleNotebook({ getItem: key => key === 'pocketworld:schedule:notebook:v2' ? original : null });
  assert.equal(state.current.entries.length, 8);
  assert.equal(state.current.todos.length, 3);
  assert.equal(state.queued.length, 0);
  assert.ok(schedulePageError(state.current));
});

test('corrupt new planner storage does not silently fall back and overwrite saved content', () => {
  const storage = { getItem: key => key === SCHEDULE_KEY ? '{broken' : null };
  assert.throws(() => readScheduleNotebook(storage));
  const state = migrateSchedule();
  state.current.todos = [];
  assert.equal(isScheduleNotebook(state), false);
});

test('five posted sheets fill the glass and rejection preserves the current draft', () => {
  let state = migrateSchedule([entry('a'), entry('b')]);
  const original = JSON.stringify(state.current);
  for (let i = 0; i < MAX_POSTED_SCHEDULES; i++) {
    state.current.entries[0] = entry(`page-${i}`);
    state = postSchedulePage(state);
  }
  assert.equal(state.posted.length, 5);
  assert.equal(state.current.number, 6);
  assert.equal(state.current.entries[0].title, '');
  assert.equal(JSON.parse(original).entries[1].id, state.posted[0].entries[1].id);
  assert.equal(new Set(state.posted.map(p => p.id)).size, 5);
  state.current.entries[0] = entry('sixth');
  const before = JSON.stringify(state);
  assert.equal(postSchedulePage(state), state);
  assert.equal(JSON.stringify(state), before);
  state = discardSchedulePage(state, state.posted[2].id);
  state = postSchedulePage(state);
  assert.equal(state.posted.length, 5);
  assert.equal(state.posted[4].entries[0].title, '任务 sixth');
  assert.equal(state.current.number, 7);
});

test('older over-capacity saves remain readable and cannot receive more sheets', () => {
  const state = migrateSchedule([entry('current')]);
  state.posted = Array.from({ length: 10 }, (_, i) => migrateSchedule([entry(`old-${i}`)]).current);
  const before = JSON.stringify(state);
  assert.equal(isScheduleNotebook(JSON.parse(before)), true);
  assert.equal(postSchedulePage(state), state);
  assert.equal(JSON.stringify(state), before);
});

test('empty and incomplete sheets cannot be posted; one complete task is enough', () => {
  let state = migrateSchedule();
  assert.ok(schedulePageError(state.current));
  assert.equal(postSchedulePage(state), state);
  state.current.entries[0].content = '仅内容也不能丢掉';
  assert.ok(schedulePageError(state.current));
  state.current.entries[0] = entry('a', '25:60');
  assert.ok(schedulePageError(state.current));
  state.current.entries[0].time = '23:59';
  assert.equal(schedulePageError(state.current), null);
  assert.equal(postSchedulePage(state).posted.length, 1);
});

test('direct time entry accepts unpadded hours and Chinese colons, and rejects invalid times', () => {
  const state = migrateSchedule([entry('typed-time')]);
  for (const time of ['9:30', '09:30', '9：30', ' 9:30 ']) {
    state.current.entries[0].time = time;
    assert.equal(schedulePageError(state.current), null);
  }
  for (const time of ['25:00', '09:70', 'later', '9:3']) {
    state.current.entries[0].time = time;
    assert.ok(schedulePageError(state.current));
  }
});

test('discard targets one posted page, retains the draft and bounds physical litter', () => {
  let state = migrateSchedule([entry('a')]);
  for (let i = 0; i < 30; i++) {
    state.current.entries[0] = entry(`task-${i}`);
    state = postSchedulePage(state);
    const currentId = state.current.id;
    const removed = state.posted[0].id;
    state = discardSchedulePage(state, removed);
    assert.equal(state.current.id, currentId);
    assert.equal(state.posted.length, 0);
    assert.equal(discardSchedulePage(state, removed), state);
  }
  assert.equal(state.discarded.length, 24);
});

test('storage rejects malformed pages and duplicate identities without truncating long text', () => {
  const state = migrateSchedule([entry('a')]);
  state.current.entries[0].content = '长正文'.repeat(200);
  assert.equal(isScheduleNotebook(JSON.parse(JSON.stringify(state))), true);
  assert.equal(flattenSchedule(state)[0].content.length, 600);
  assert.equal(isScheduleNotebook({ ...state, current: { ...state.current, entries: [] } }), false);
  assert.equal(isScheduleNotebook({ ...state, posted: [state.current] }), false);
  assert.equal(isScheduleNotebook({ ...state, discarded: [{ id: 'bad', seed: NaN }] }), false);
  assert.equal(isScheduleNotebook({ ...state, syncRemovedIds: ['removed-task'] }), true);
  assert.equal(isScheduleNotebook({ ...state, syncRemovedIds: [123] }), false);
});
