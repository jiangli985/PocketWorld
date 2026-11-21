import assert from 'node:assert/strict';
import test from 'node:test';
import { initialOutfit, rememberOutfit, nextOutfit } from './outfit.ts';

test('the wardrobe remembers the choice on both the cabin and a shared outfit preview', t => {
  const saved = new Map();
  const window = {
    location: new URL('http://localhost/?view=cabin'),
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    history: { replaceState: (_state, _title, url) => { window.location = url; } },
  };
  const original = globalThis.window;
  globalThis.window = window;
  t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original; });

  assert.equal(initialOutfit(), 'everyday');
  rememberOutfit('snowflower');
  assert.equal(initialOutfit(), 'snowflower');
  assert.equal(window.location.search, '?view=cabin');

  window.location.search = '?view=cabin&outfit=everyday&sun=0.5';
  assert.equal(initialOutfit(), 'everyday');
  rememberOutfit('snowflower');
  assert.equal(window.location.search, '?view=cabin&outfit=snowflower&sun=0.5');
  assert.equal(saved.get('pocketworld:wardrobe:outfit'), 'snowflower');

  assert.equal(nextOutfit('snowflower'), 'cloudhoodie');
  rememberOutfit('cloudhoodie');
  assert.equal(window.location.search, '?view=cabin&outfit=cloudhoodie&sun=0.5');
  window.location.search = '?view=cabin';
  assert.equal(initialOutfit(), 'cloudhoodie');
  assert.equal(nextOutfit('cloudhoodie'), 'everyday');

  window.location.search = '?view=cabin&outfit=cloudhoodie';
  window.history.replaceState = () => { throw new Error('restricted history'); };
  rememberOutfit('everyday');
  assert.equal(saved.get('pocketworld:wardrobe:outfit'), 'everyday');
});
