import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH_CATALOG } from './catalog.ts';
import { drawFish, FISH_SPRITE_HEIGHT, FISH_SPRITE_WIDTH } from './fishArt.ts';
import { BAY_WIDTH, BAY_HEIGHT, CATCH_EFFECT_MS, drawFishingBay, setDockImage, setFishingAtlas } from './renderer.ts';

function recordingCanvas(t) {
  class RecordingPath {
    constructor(d) { this.d = d; }
  }
  t.mock.method(globalThis, 'setTimeout', () => assert.fail('renderer scheduled a timer'));
  Object.defineProperty(globalThis, 'Path2D', { value: RecordingPath, configurable: true });
  t.after(() => { delete globalThis.Path2D; });
  const gradient = { addColorStop() {} };
  const calls = [];
  const context = log => new Proxy({}, {
    get(_target, name) {
      return (...args) => {
        log?.push([name, ...args]);
        return gradient;
      };
    },
  });
  const canvas = {
    width: BAY_WIDTH,
    height: BAY_HEIGHT,
    getContext: () => context(calls),
    ownerDocument: { createElement() { assert.fail('renderer should use the supplied atlas'); } },
  };
  const atlas = { width: 384, height: 384 };
  setFishingAtlas(canvas, atlas);
  return { canvas, calls, atlas };
}

test('every catalog fish has a distinct and bounded pixel sprite', () => {
  const drawn = new Set();
  for (const fish of FISH_CATALOG) {
    const blocks = [];
    drawFish({ fillRect(...block) { blocks.push([this.fillStyle, ...block]); } }, fish.id);
    assert.ok(new Set(blocks.map(([color]) => color)).size >= 6, fish.id);
    assert.ok(blocks.every(([, x, y, w, h]) => x >= 0 && y >= 0 && x + w <= FISH_SPRITE_WIDTH && y + h <= FISH_SPRITE_HEIGHT));
    drawn.add(JSON.stringify(blocks.map(([, ...block]) => block)));
  }
  assert.equal(drawn.size, FISH_CATALOG.length);
});

test('repaints from a single pixel atlas and distinguishes bite from waiting and full', t => {
  const { canvas, calls, atlas } = recordingCanvas(t);
  function paint(phase) {
    calls.length = 0;
    drawFishingBay(canvas, Object.freeze({ timeMs: 750, phase, reducedMotion: true }));
    return calls.filter(call => call[0] === 'ellipse').length;
  }
  const waiting = paint('waiting');
  const bite = paint('bite');
  assert.ok(bite > waiting);
  assert.equal(paint('full'), 0);
  paint('waiting');
  assert.deepEqual(calls[0], ['drawImage', atlas, 0, 0, 384, 288, 0, 0, 800, 600]);
  assert.ok(calls.some(call => call[0] === 'drawImage' && call[3] === 289 && call[4] === 260));
});

test('reduced motion holds position, and capture art stops at 1.5 seconds', t => {
  const { canvas, calls } = recordingCanvas(t);
  function paint(timeMs, ageMs, reducedMotion) {
    calls.length = 0;
    drawFishingBay(canvas, { timeMs, phase: 'waiting', reducedMotion, catchEffect: { fishId: 'snapper', ageMs } });
    return calls.slice();
  }
  assert.deepEqual(paint(0, 25, true), paint(999, 1000, true));
  assert.notDeepEqual(paint(0, 25, false), paint(999, 1000, false));
  const fishVisible = calls => calls.some(([name, x, y], index) =>
    name === 'translate' && x === -FISH_SPRITE_WIDTH / 2 && y === -FISH_SPRITE_HEIGHT / 2 && calls[index + 1]?.[0] === 'fillRect');
  assert.equal(fishVisible(paint(1200, CATCH_EFFECT_MS - 1, false)), true);
  assert.equal(fishVisible(paint(1500, CATCH_EFFECT_MS, false)), false);
  assert.equal(fishVisible(paint(0, -1, false)), false);
});

test('the fish follows a raised arc during reeling and stays still when motion is reduced', t => {
  const { canvas, calls } = recordingCanvas(t);
  function position(progress, reducedMotion = false) {
    calls.length = 0;
    drawFishingBay(canvas, { phase: 'bite', timeMs: 0, reducedMotion, progress, reelingFish: 'snapper' });
    return calls.filter(([name]) => name === 'translate').at(-2).slice(1);
  }
  const [x, y] = position(.25);
  const [middleX, middleY] = position(.77);
  const [deckX, deckY] = position(1);
  assert.ok(x > middleX && middleX > deckX);
  assert.ok(middleY < deckY && deckY < y);
  assert.deepEqual(position(0, true), position(1, true));
});

test('fight darkens the sea and lowers the rod tip, with no lightning in reduced motion', t => {
  const { canvas, calls } = recordingCanvas(t);
  const paint = (phase, reducedMotion) => {
    calls.length = 0;
    drawFishingBay(canvas, { phase, reducedMotion, timeMs: 0, progress: 0,
      impulse: phase === 'fight' ? { kind: 'strike', id: 1, ageMs: 65 } : undefined });
    return calls.slice();
  };
  const normal = paint('bite', true), storm = paint('fight', true), flash = paint('fight', false);
  const tip = rows => rows.find(([op]) => op === 'quadraticCurveTo').at(-1);
  const lightning = rows => rows.some(([op, path]) => op === 'fill' && path.d?.startsWith('M155 32'));
  assert.ok(tip(storm) > tip(normal));
  assert.ok(storm.some(([op, x, y, w, h]) => op === 'fillRect' && x === 0 && y === 94 && w === 200 && h === 56));
  assert.equal(lightning(storm), false);
  assert.equal(lightning(flash), true);
});

test('cast swings backward, pays out the line in air, then dips and rebounds at the surface', t => {
  const { canvas, calls } = recordingCanvas(t);
  const sample = (castAgeMs, phase = 'waiting', reducedMotion = false) => {
    calls.length = 0;
    drawFishingBay(canvas, { phase, timeMs: 0, progress: 1, castAgeMs, reducedMotion });
    const [, , , tipX, tipY] = calls.find(([op]) => op === 'quadraticCurveTo');
    const [, , bendY, x, y] = calls.filter(([op]) => op === 'quadraticCurveTo')[1];
    return { tipX, tipY, x, y, slack: bendY - (tipY + y) / 2, rings: calls.filter(([op]) => op === 'ellipse').length };
  };
  const ready = sample(0), backswing = sample(170), release = sample(270);
  const flight = sample(450), landed = sample(650), dip = sample(725), settled = sample(1200);
  assert.ok(backswing.tipX < ready.tipX && release.tipX > ready.tipX);
  assert.ok(release.x < flight.x && flight.x < landed.x);
  const beforeRelease = sample(269);
  assert.ok(Math.hypot(release.x - beforeRelease.x, release.y - beforeRelease.y) < 1.5);
  assert.equal(flight.rings, 0);
  assert.ok(landed.rings > settled.rings);
  assert.ok(dip.y > landed.y && dip.y > settled.y);
  assert.ok(sample(1200, 'fight').slack < settled.slack);
  assert.deepEqual(sample(0, 'waiting', true), sample(1200, 'waiting', true));
});


test('the compact angler stays on the open foredeck as the boat bobs', t => {
  const { canvas, calls } = recordingCanvas(t);
  for (const timeMs of [0, 1500, 4500]) {
    calls.length = 0;
    drawFishingBay(canvas, { phase: 'waiting', timeMs, castAgeMs: 160 });
    const boatIndex = calls.findIndex(([op, , , y]) => op === 'drawImage' && y === 289);
    const [, , , , , , boatX, boatY, boatWidth, boatHeight] = calls[boatIndex];
    const firstArmStroke = calls.findIndex(([op], i) => i > boatIndex && op === 'beginPath');
    const body = calls.slice(boatIndex + 1, firstArmStroke).filter(([op]) => op === 'fillRect');
    const left = Math.min(...body.map(([, x]) => x));
    const right = Math.max(...body.map(([, x, , width]) => x + width));
    const top = Math.min(...body.map(([, , y]) => y));
    const feet = Math.max(...body.map(([, , y, , height]) => y + height));
    assert.ok(left > boatX + boatWidth / 2 && right < boatX + boatWidth);
    assert.ok(right - left < boatWidth * .09 && feet - top < boatWidth * .12);
    assert.ok(Math.abs(feet - (boatY + boatHeight * .71)) < 1);
  }
});


test('the dock titles are drawn into the street once and follow both the camera and the settled dock', t => {
  const { canvas, calls } = recordingCanvas(t);
  const painted = [];
  const street = { getContext: () => ({
    drawImage: (...args) => painted.push(args),
    fillRect: (...args) => painted.push(args),
  }) };
  canvas.ownerDocument.createElement = name => {
    assert.equal(name, 'canvas');
    return street;
  };
  const image = { naturalWidth: 400, naturalHeight: 300 };
  setDockImage(canvas, image);
  assert.deepEqual([street.width, street.height], [400, 300]);
  assert.deepEqual(painted[0], [image, 0, 0]);
  const strokes = painted.slice(1);
  assert(strokes.every(([x, y, w, h]) => y >= 129 && y <= 142 && w === 1 && h === 1 &&
    ((x >= 78 && x <= 177) || (x >= 226 && x <= 342))));
  assert(strokes.some(([x]) => x < 175));
  assert(strokes.some(([x]) => x > 230));

  for (const progress of [.7, 1]) {
    calls.length = 0;
    drawFishingBay(canvas, { timeMs: 0, phase: 'idle', crossing: { destination: 'dock', progress } });
    assert(calls.some(([method, source]) => method === 'drawImage' && source === street));
    assert.equal(painted.length, strokes.length + 1);
  }
});
