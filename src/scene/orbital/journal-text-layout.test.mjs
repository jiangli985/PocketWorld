import test from 'node:test';
import assert from 'node:assert/strict';
import { journalTextLayout, journalTextHit } from './journal-text-layout.ts';

test('hit testing places the native caret on the displayed Chinese character', () => {
  const layout = journalTextLayout('今天，记住一点事。', () => 16, 32);
  assert.equal(journalTextHit(layout, 68, 102, 0), 2);
  assert.equal(journalTextHit(layout, 32, 102, 0), 0);
});

test('wrapping, explicit newlines and emoji keep native UTF-16 offsets', () => {
  const layout = journalTextLayout('你😀好\n下一行', () => 16, 32);
  assert.equal(layout.carets[4].y, 102);
  assert.equal(layout.carets[5].x, 32);
  assert.equal(layout.carets[5].y, 130);
  assert.equal(journalTextHit(layout, 32, 130, 0), 5);
  const wrapped = journalTextLayout('字'.repeat(20), () => 16, 32);
  assert.equal(wrapped.carets[16].y, 130);
  assert.equal(journalTextHit(wrapped, 32, 102, 28), 15);
  assert.equal(journalTextHit(wrapped, 400, 102, 0), 15);
});

test('combined emoji and accents are printed as whole characters', () => {
  const layout = journalTextLayout('👩‍💻👍🏽e\u0301', () => 16, 32);
  assert.deepEqual(layout.glyphs.map(({ text, offset }) => [text, offset]), [['👩‍💻', 0], ['👍🏽', 5], ['e\u0301', 9]]);
  assert.equal(journalTextHit(layout, 50, 102, 0), 5);
});
