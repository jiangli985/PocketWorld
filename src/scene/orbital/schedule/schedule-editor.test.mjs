import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../journal/bookModel.ts';
import { migrateSchedule } from './schedule.ts';

function mount() {
  const hooks = [], changes = [];
  let cursor = 0, current = migrateSchedule().current;
  const element = (type, props) => ({ type, props });
  const dependencies = {
    react: { useState: value => [value, () => {}], useRef: value => hooks[cursor++] ?? (hooks[cursor - 1] = { current: value }) },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    '@react-three/drei': { Html: 'Html' }, '../journal/bookModel': model,
  };
  const source = fs.readFileSync(new URL('./SchedulePageEditor.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const context = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(compiled, context);
  const render = () => {
    cursor = 0;
    const tree = context.exports.SchedulePageEditor({ page: current, book: { current: {} }, leafCount: 32, onGesture() {}, onChange: page => { current = page; changes.push(page); } });
    const fields = new Map();
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node?.props) return;
      if (node.props['aria-label']) fields.set(node.props['aria-label'], node.props);
      visit(node.props.children);
    };
    visit(tree);
    return fields;
  };
  return { render, changes, get current() { return current; } };
}
const valueEvent = value => ({ currentTarget: { value }, target: { value } });

test('rapid edits across schedule fields retain each update before the next scene render', () => {
  const editor = mount(), fields = editor.render();
  fields.get('第1项标题').onChange(valueEvent('写完报告'));
  fields.get('待办1').onChange(valueEvent('买书'));
  fields.get('明日计划1').onChange(valueEvent('散步'));
  fields.get('日程备注').onChange(valueEvent('别忘了带伞'));
  assert.equal(editor.current.entries[0].title, '写完报告');
  assert.equal(editor.current.todos[0].text, '买书');
  assert.equal(editor.current.tomorrow[0], '散步');
  assert.equal(editor.current.notes, '别忘了带伞');
});

test('Chinese composition stays native until confirmed in every text section', () => {
  for (const label of ['第1项标题', '待办1', '明日计划1', '日程备注']) {
    const editor = mount(), field = editor.render().get(label);
    field.onCompositionStart();
    field.onChange(valueEvent('zhongwen'));
    assert.equal(editor.changes.length, 0, `${label} saved unconfirmed pinyin`);
    let stopped = false;
    field.onKeyDown({ nativeEvent: { isComposing: true }, keyCode: 229, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true, `${label} leaked an IME key to scene shortcuts`);
    field.onCompositionEnd(valueEvent('中文'));
    assert.equal(editor.changes.length, 1);
    assert.ok(JSON.stringify(editor.current).includes('中文'));
    assert.ok(!JSON.stringify(editor.current).includes('zhongwen'));
  }
});
