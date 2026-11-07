import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { TRAILS } from './model.ts';

let source = await readFile(new URL('./renderer.ts', import.meta.url), 'utf8');
source += '\nexport { mountains };';
source = ts.transpile(source, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext });
for (const name of ['engine', 'model']) {
  source = source.replace(`'./${name}'`, JSON.stringify(new URL(`./${name}.ts`, import.meta.url).href));
}
const { mountains } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function recordMountains(scroll, trail) {
  const fills = [];
  let path = [];
  const ctx = {
    beginPath() { path = []; },
    moveTo(...points) { path.push(['move', ...points]); },
    lineTo(...points) { path.push(['line', ...points]); },
    bezierCurveTo(...points) { path.push(['cubic', ...points]); },
    quadraticCurveTo(...points) { path.push(['quadratic', ...points]); },
    closePath() {},
    fill() { fills.push({ color: this.fillStyle, path }); },
  };
  mountains(ctx, scroll, trail);
  return fills;
}

for (const trail of TRAILS) {
  test(`${trail.id}: mountain silhouettes cover downhill views and join without vertical seams`, () => {
    for (const scroll of [-40, 0, 850 / .055 - .001, 850 / .055 + .001, 850 / .09 - .001, 850 / .09 + .001, 1e6]) {
      const fills = recordMountains(scroll, trail);
      const bodies = fills.filter(fill => fill.path.some(command => command[0] === 'cubic'));
      assert.equal(bodies.length, 2);
      for (const { path } of bodies) {
        assert.equal(path.filter(command => command[0] === 'move').length, 1);
        assert.ok(path[0][1] < 0);
        const lines = path.filter(command => command[0] === 'line');
        assert.equal(lines.length, 2, 'only the offscreen bottom may have straight closing edges');
        assert.ok(lines[0][1] > 800 && lines[1][1] < 0);
        assert.ok(lines.every(command => command[2] > 600), 'mountain fill must continue below the viewport');
        const ridge = path.slice(1, -2);
        for (let i = 1; i < ridge.length; i++) {
          const previous = ridge[i - 1], next = ridge[i];
          if (previous[0] !== 'cubic' || next[0] !== 'cubic') continue;
          const end = previous.slice(-2);
          if (end[1] !== path[0][2]) continue;
          assert.equal(previous[4], end[1], 'tile ends with a horizontal tangent');
          assert.equal(next[2], end[1], 'next tile starts at the same height and tangent');
          assert.ok(next[1] > end[0]);
        }
      }
    }
  });
}
