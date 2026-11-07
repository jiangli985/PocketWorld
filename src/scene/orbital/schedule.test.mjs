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
const { migrateSchedule, postSchedulePage, discardSchedulePage, schedulePageError, isScheduleNotebook, flattenSchedule } = context.exports;
const entry = (id, time = '09:00') => ({ id, title: `任务 ${id}`, time, completed: false, content: `正文 ${id}` });

test('legacy three-task schedules retain every task and completion across two sheets', () => {
  const legacy = [entry('a'), { ...entry('b'), completed: true }, entry('c')];
  let state = migrateSchedule(legacy);
  assert.equal(state.current.entries.length, 2);
  assert.equal(state.queued[0].entries[0].id, 'c');
  state = postSchedulePage(state);
  assert.equal(state.posted[0].entries[1].completed, true);
  assert.equal(state.current.entries[0].content, '正文 c');
  assert.equal(state.current.number, 2);
  assert.equal(legacy.length, 3);
});

test('posting keeps the written sheet immutable and supports more than three tasks', () => {
  let state = migrateSchedule([entry('a'), entry('b')]);
  const original = JSON.stringify(state.current);
  for (let i = 0; i < 8; i++) {
    state.current.entries[0] = entry(`page-${i}`);
    state = postSchedulePage(state);
  }
  assert.equal(state.posted.length, 8);
  assert.equal(state.current.number, 9);
  assert.equal(state.current.entries[0].title, '');
  assert.equal(JSON.parse(original).entries[1].id, state.posted[0].entries[1].id);
  assert.equal(new Set(state.posted.map(p => p.id)).size, 8);
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
});
