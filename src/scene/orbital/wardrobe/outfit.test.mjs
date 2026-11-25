import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initialOutfit, isOutfit, outfitSlots, previewOutfit, readOutfit, rememberOutfit } from './outfit.ts';

test('the wardrobe lists the ribbon jacket second and opens retired outfit previews in everyday', () => {
  assert.deepEqual(outfitSlots, ['everyday', 'ribbon', 'cardigan']);
  assert.equal(previewOutfit('?view=cabin&outfit=ribbon'), 'ribbon');
  assert.equal(previewOutfit('?outfit=cardigan'), 'cardigan');
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

  rememberOutfit('cardigan');
  assert.equal(window.location.search, '?view=cabin&outfit=cardigan&sun=0.5');
  window.location.search = '?view=cabin';
  assert.equal(initialOutfit(), 'cardigan');

  window.history.replaceState = () => { throw new Error('restricted history'); };
  rememberOutfit('everyday');
  assert.equal(initialOutfit(), 'everyday');
});

test('ribbon uses the everyday full-atlas fill, normal strength and skin shader inputs', () => {
  function look(filename) {
    const raw = readFileSync(new URL('../../../../assets/public/models/resident/' + filename, import.meta.url));
    const asset = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
    const material = asset.materials.find(m => m.normalTexture && m.pbrMetallicRoughness.baseColorTexture);
    const pbr = material.pbrMetallicRoughness;
    const color = pbr.baseColorTexture;
    assert.deepEqual(material.emissiveTexture, color, 'shared color and emission texture enables the room skin shader');
    return {
      pigment: pbr.baseColorFactor ?? [1, 1, 1, 1], fill: material.emissiveFactor,
      normal: material.normalTexture.scale, metallic: pbr.metallicFactor, roughness: pbr.roughnessFactor ?? 1,
      twoSided: material.doubleSided, extensions: material.extensions ?? {},
      sampling: asset.samplers[asset.textures[color.index].sampler],
    };
  }
  assert.deepEqual(look('luna-ribbon.glb'), look('luna-walk-room.glb'));
});
