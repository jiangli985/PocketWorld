import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { CAT_HOME, CAT_MAT_Y, CAT_CUSHION_TOP, CAT_YAW, PLUSH_DOLLS, RESIDENT_RADIUS } from '../cabinLayout.ts';
import { planCatWalk, sampleCatWalk } from './catWalk.ts';

const start = [2.52, 1.10];
const penguin = PLUSH_DOLLS.find(doll => doll.id === 'plush-penguin');
const clear = (x, z) => x < 3.21 && z < 2.72
  && Math.hypot(x - start[0], z - start[1]) > RESIDENT_RADIUS + .28
  && Math.hypot(x - penguin.position[0], z - penguin.position[2]) > penguin.radius + .28;

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / (2 ** 32));
}

test('different wakes yield short and long routes that stay clear and meet the cat bed at the same pose', () => {
  const lengths = [];
  const point = new Vector3(), tangent = new Vector3();
  for (let seed = 1; seed <= 32; seed++) {
    const route = planCatWalk(clear, seeded(seed));
    assert(route, `No route for seed ${seed}`);
    lengths.push(route.length);
    for (let i = 0; i <= 160; i++) {
      const { yaw, weight } = sampleCatWalk(route, route.length * i / 160, point, tangent);
      // A few millimetres of tolerance account for the spacing of the planning samples.
      assert(point.x + CAT_HOME[0] < 3.212 && point.z + CAT_HOME[1] < 2.722);
      assert(Math.hypot(point.x + CAT_HOME[0] - start[0], point.z + CAT_HOME[1] - start[1]) > .507);
      assert(Math.hypot(point.x + CAT_HOME[0] - penguin.position[0], point.z + CAT_HOME[1] - penguin.position[2]) > .497);
      if (i === 0 || i === 160) {
        assert(point.distanceTo(new Vector3(0, CAT_MAT_Y + CAT_CUSHION_TOP, 0)) < 1e-7);
        assert.equal(yaw, CAT_YAW);
        assert.equal(weight, 0);
      }
    }
  }
  assert(Math.min(...lengths) < 2.8);
  assert(Math.max(...lengths) > 4.5);
  assert.equal(new Set(lengths).size, lengths.length);
});

test('the cat tries a nearby route when the longer route is blocked and stays put when all paths are blocked', () => {
  const nearbyOnly = (x, z) => x > 2.21 && clear(x, z);
  const route = planCatWalk(nearbyOnly, seeded(1));
  assert(route);
  assert(route.length < 3.2);
  assert.equal(planCatWalk(() => false, seeded(1)), null);
});
