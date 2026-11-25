import assert from 'node:assert/strict';
import test from 'node:test';
import { initialOutfit, isOutfit, outfitChoices, previewOutfit, readOutfit, rememberOutfit } from './outfit.ts';

test('the wardrobe lists the ribbon jacket second and opens retired outfit previews in everyday', () => {
  assert.deepEqual(outfitChoices, ['everyday', 'ribbon']);
  assert.equal(previewOutfit('?view=cabin&outfit=ribbon'), 'ribbon');
  assert.equal(previewOutfit('?outfit=everyday'), 'everyday');
  assert.equal(previewOutfit('?outfit=unknown'), null);
  assert.equal(previewOutfit('?view=cabin'), null);
  for (const retired of ['snowflower', 'cloudhoodie']) {
    assert.equal(isOutfit(retired), false);
    assert.equal(readOutfit(retired), 'everyday');
    assert.equal(previewOutfit('?view=cabin&outfit=' + retired), 'everyday');
  }
});

test('a retired saved outfit falls back to everyday and remembering it preserves the preview context', t => {
  const key = 'pocketworld:wardrobe:outfit';
  const saved = new Map();
  const window = {
    location: new URL('http://localhost/?view=cabin'),
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    history: { replaceState: (_state, _title, url) => { window.location = url; } },
  };
  const original = globalThis.window;
  globalThis.window = window;
  t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original; });

  for (const retired of ['snowflower', 'cloudhoodie']) {
    saved.set(key, retired);
    assert.equal(initialOutfit(), 'everyday');
  }
  rememberOutfit('ribbon');
  assert.equal(saved.get(key), 'ribbon');
  assert.equal(initialOutfit(), 'ribbon');
  assert.equal(window.location.search, '?view=cabin');

  window.location.search = '?view=cabin&outfit=snowflower&sun=0.5';
  rememberOutfit('everyday');
  assert.equal(window.location.search, '?view=cabin&outfit=everyday&sun=0.5');

  window.history.replaceState = () => { throw new Error('restricted history'); };
  rememberOutfit('everyday');
  assert.equal(initialOutfit(), 'everyday');
});
