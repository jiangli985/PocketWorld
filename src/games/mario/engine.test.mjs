import assert from 'node:assert/strict';
import test from 'node:test';
import { createRun, frontGap, stepRun, terrainAngle, terrainY } from './engine.ts';
import { emptyInput, TRAILS } from './model.ts';
import { playerBody, skiContacts } from './character.ts';


const DT = 1 / 120;
function tick(state, input = {}, count = 1) {
  const events = [];
  for (let i = 0; i < count; i++) {
    stepRun(state, { ...emptyInput(), ...input, jumpPressed: i === 0 && !!input.jumpPressed }, DT);
    events.push(...state.events);
  }
  return events;
}
function clearRun(trail = 'valley') {
  const state = createRun(trail);
  state.features = [];
  state.nextSegment = 1e6;
  state.chasers = [];
  return state;
}
function addFeature(state, kind, x = state.player.x, width = 44) {
  state.features.push({ id: state.nextId++, kind, x, width, y: terrainY(x + width / 2, state.trail), used: false });
}
function airborne(state, height, vy = 0) {
  const p = state.player;
  p.grounded = false;
  p.coyote = 0;
  p.y = terrainY(p.x, state.trail) - height;
  p.vy = vy;
}

test('three trails start at x=200 with feet on a continuous, bounded slope', () => {
  for (const { id } of TRAILS) {
    const state = createRun(id);
    assert.equal(state.player.x, 200);
    assert.equal(state.player.y, terrainY(200, id));
    assert.equal(state.player.angle, terrainAngle(200, id));
    assert.equal(state.distance, 0);
    assert.equal(state.chasers.length, 8);
    const left = Math.min(...playerBody(state.player).map(circle => circle.x - circle.radius));
    assert.equal(frontGap(state), left - state.chasers[0].x - 14);
    assert.ok(!state.features.some(f => f.kind === 'gap' || f.kind === 'branch'));
    for (let x = -500; x < 20000; x += 71) {
      assert.ok(terrainY(x, id) > 375 && terrainY(x, id) < 465);
      const derivative = (terrainY(x + 0.01, id) - terrainY(x - 0.01, id)) / 0.02;
      assert.ok(Math.abs(Math.tan(terrainAngle(x, id)) - derivative) < 1e-8);
    }
  }
});

test('events are per call; zero, invalid dt, and ended runs freeze simulation', () => {
  const state = clearRun();
  state.events.push('coin');
  stepRun(state, emptyInput(), 0);
  assert.deepEqual(state.events, []);
  const snapshot = structuredClone(state);
  for (const dt of [-1, NaN, Infinity]) stepRun(state, emptyInput(), dt);
  assert.deepEqual(state, snapshot);
  state.over = true;
  const ended = structuredClone(state);
  tick(state, { jumpPressed: true }, 30);
  assert.deepEqual(state, ended);
});

test('holding jump gives more height than tapping, and flip starts once per flight', () => {
  const tap = clearRun();
  const hold = clearRun();
  tick(tap, { jump: true, jumpPressed: true });
  tick(hold, { jump: true, jumpPressed: true });
  const events = tick(hold, { jump: true }, 55);
  tick(tap, {}, 55);
  assert.ok(hold.player.y < tap.player.y - 25);
  assert.equal(events.filter(e => e === 'flip').length, 1);
  assert.equal(hold.flips, 0);
  assert.equal(hold.bonus, 0);
});

test('release assists upright landing and only landing banks completed rotations', () => {
  const state = clearRun();
  airborne(state, 210, -150);
  const events = tick(state, { jump: true }, 125);
  assert.equal(events.filter(e => e === 'flip').length, 1);
  assert.equal(state.flips, 0);
  assert.ok(Math.abs(state.player.rotation) >= Math.PI * 2);
  const landing = tick(state, {}, 180);
  assert.ok(landing.includes('land'));
  assert.ok(!landing.includes('crash'));
  assert.equal(state.flips, 1);
  assert.equal(state.bonus, 120);
  assert.equal(state.combo, 1);
  assert.ok(state.player.grounded);
});

test('a natural ground jump has enough airtime for one banked backflip', () => {
  const state = clearRun();
  let released = false;
  const events = [];
  for (let i = 0; i < 240; i++) {
    if (Math.abs(state.player.rotation) >= Math.PI * 2) released = true;
    events.push(...tick(state, { jump: !released, jumpPressed: i === 0 }));
  }
  assert.equal(state.flips, 1);
  assert.equal(state.bonus, 120);
  assert.equal(events.filter(e => e === 'flip').length, 1);
  assert.equal(events.filter(e => e === 'boost').length, 1);
  assert.ok(!events.includes('crash'));
});

test('a full airborne turn grants a small immediate boost before landing, once per milestone', () => {
  for (const direction of [-1, 1]) {
    const state = clearRun();
    airborne(state, 600);
    Object.assign(state.player, { airTime: .3, rotation: direction * (Math.PI * 2 - .01) });
    const baseline = structuredClone(state);
    baseline.player.rotation = 0;
    tick(baseline, { tilt: direction });
    const events = tick(state, { tilt: direction });
    assert.equal(events.filter(e => e === 'boost').length, 1);
    assert.equal(state.player.grounded, false);
    assert.equal(state.player.boostTime, .9);
    assert.ok(Math.abs(state.player.speed - baseline.player.speed - 45) < 1e-6);
    assert.equal(state.flips, 0);
    assert.equal(state.bonus, 0);
    assert.equal(state.player.airBoosts, 1);
    // Crossing the same full-turn boundary again must not pay twice.
    state.player.rotation = direction * (Math.PI * 2 - .01);
    assert.ok(!tick(state, { tilt: direction }).includes('boost'));
    state.player.rotation = direction * (Math.PI * 4 - .01);
    assert.ok(tick(state, { tilt: direction }).includes('boost'));
    assert.equal(state.player.airBoosts, 2);
    assert.equal(state.player.boostTime, .9);
  }
});

test('partial turns and automatic upright correction do not earn boosts', () => {
  const state = clearRun();
  airborne(state, 600);
  Object.assign(state.player, { airTime: .3, rotation: -Math.PI * 1.9, angle: -Math.PI * 1.9 });
  assert.ok(!tick(state, {}, 45).includes('boost'));
  assert.equal(state.player.boostTime, 0);
  assert.equal(state.player.airBoosts, 0);
});

test('boost speed is capped, its timer expires, and frozen simulation preserves the effect', () => {
  const state = clearRun();
  airborne(state, 600);
  Object.assign(state.player, { airTime: .3, rotation: -Math.PI * 2 + .01, speed: 469 });
  assert.ok(tick(state, { jump: true }).includes('boost'));
  assert.equal(state.player.speed, 470);
  const frozen = structuredClone(state);
  for (const dt of [0, -1, NaN, Infinity]) stepRun(state, emptyInput(), dt);
  state.events = frozen.events;
  assert.deepEqual(state, frozen);
  tick(state, {}, 120);
  assert.equal(state.player.boostTime, 0);
  assert.equal(state.player.boostFlash, 0);
  assert.ok(state.player.speed < 470);
});

test('reduced motion preserves flip boosts and scores without decorative particles', () => {
  const state = clearRun();
  airborne(state, 600);
  Object.assign(state.player, { airTime: .3, rotation: -Math.PI * 2 + .01 });
  const reduced = structuredClone(state);
  stepRun(state, { ...emptyInput(), jump: true }, DT, false);
  stepRun(reduced, { ...emptyInput(), jump: true }, DT, true);
  assert.ok(state.events.includes('boost'));
  assert.ok(state.particles.length > 0);
  assert.equal(reduced.particles.length, 0);
  state.particles = [];
  assert.deepEqual(state, reduced);
});

test('every trail layout generates continuous snow without holes', () => {
  for (const { id } of TRAILS) {
    const state = clearRun(id);
    for (let segment = 0; segment < 12; segment++) {
      const x = segment * 2400 + 200;
      Object.assign(state.player, { x, y: terrainY(x, id), angle: terrainAngle(x, id) });
      state.features = [];
      state.nextSegment = segment;
      const events = tick(state);
      assert.ok(state.features.length > 0);
      assert.ok(state.features.every(f => f.kind !== 'gap'), `${id}: segment ${segment}`);
      assert.equal(state.player.grounded, true);
      assert.ok(!events.includes('crash'));
    }
  }
});

test('upside-down landing crashes once, loses unbanked flips and resets combo', () => {
  const state = clearRun();
  airborne(state, 1, 150);
  state.player.angle = Math.PI;
  state.player.rotation = -Math.PI * 3;
  state.combo = 3;
  const events = tick(state, { tilt: 1 }, 10);
  assert.equal(events.filter(e => e === 'crash').length, 1);
  assert.equal(state.flips, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.bonus, 0);
});

test('ski-first landings accept near-vertical boards on every trail and settle continuously', () => {
  for (const { id } of TRAILS) {
    for (const degrees of [-90, -80, -65, 65, 80, 90]) {
      const state = clearRun(id);
      airborne(state, 1, 120);
      state.player.angle = terrainAngle(state.player.x, id) + degrees * Math.PI / 180;
      state.player.rotation = -Math.PI * 2;
      const events = tick(state);
      assert.ok(events.includes('land'), `${id}: ${degrees} degrees`);
      assert.ok(!events.includes('crash'), `${id}: ${degrees} degrees`);
      assert.equal(state.flips, 1);
      assert.ok(Math.abs(state.player.angle - terrainAngle(state.player.x, id)) > 0.85);
      const recovery = tick(state, {}, 30);
      assert.ok(!recovery.includes('crash'));
      assert.equal(state.player.grounded, true);
      assert.ok(Math.abs(state.player.angle - terrainAngle(state.player.x, id)) < 0.02);
      for (const circle of [...playerBody(state.player), ...skiContacts(state.player)]) {
        assert.ok(circle.y + circle.radius <= terrainY(circle.x, id) + 0.1);
      }
    }
  }
});

test('head-first contact crashes while the foot anchor is still above the snow', () => {
  for (const { id } of TRAILS) {
    const state = clearRun(id);
    airborne(state, 4, 120);
    state.player.angle = terrainAngle(state.player.x, id) + Math.PI;
    const events = tick(state, { tilt: 1 });
    assert.ok(events.includes('crash'), id);
    assert.equal(state.player.crashTime, 1.25);
    assert.equal(state.flips, 0);
  }
});

test('ski-tip contact begins landing before the foot anchor reaches the surface', () => {
  const state = clearRun();
  airborne(state, 10, 120);
  state.player.angle = terrainAngle(state.player.x, state.trail) + Math.PI / 3;
  assert.ok(tick(state).includes('land'));
  assert.ok(state.player.y < terrainY(state.player.x, state.trail) - 10);
  assert.equal(state.player.crashTime, 0);
});

test('the ski tip hits a rock before the torso reaches it', () => {
  const state = clearRun();
  state.player.boostTime = .8;
  state.player.boostFlash = .4;
  addFeature(state, 'rock', state.player.x + 30);
  const events = tick(state);
  assert.ok(events.includes('crash'));
  assert.equal(state.player.boostTime, 0);
  assert.equal(state.player.boostFlash, 0);
  assert.equal(state.features[0].used, true);
});

test('jump buffer and coyote grace both accept near-edge inputs', () => {
  const buffered = clearRun();
  airborne(buffered, 4, 100);
  tick(buffered, { jump: true, jumpPressed: true });
  assert.ok(buffered.player.jumpBuffer > 0);
  tick(buffered, { jump: true }, 5);
  assert.equal(buffered.player.grounded, false);
  assert.ok(buffered.player.vy < 0);
  const coyote = clearRun();
  airborne(coyote, 2);
  coyote.player.coyote = 0.07;
  tick(coyote, { jumpPressed: true, jump: true });
  assert.ok(coyote.player.vy < -300);
  const late = clearRun();
  airborne(late, 50);
  tick(late, { jumpPressed: true, jump: true });
  assert.ok(late.player.vy >= 0);
});

test('repeated fresh presses recover faster but holding a key does not retrigger', () => {
  const taps = clearRun();
  const hold = clearRun();
  addFeature(taps, 'rock');
  addFeature(hold, 'rock');
  tick(taps);
  tick(hold);
  assert.ok(taps.player.crashTime > 1);
  for (let i = 0; i < 5; i++) {
    tick(taps, { jumpPressed: true, jump: true });
    tick(taps, {}, 5);
  }
  tick(hold, { jump: true, jumpPressed: true }, 30);
  assert.equal(taps.player.crashTime, 0);
  assert.ok(hold.player.crashTime > 0.5);
  assert.ok(taps.player.invulnerable > 0);
});

test('slide mount absorbs one hit and partner replacement never stacks shields', () => {
  const state = clearRun();
  addFeature(state, 'slide');
  assert.ok(tick(state).includes('mount'));
  assert.equal(state.player.partner, 'slide');
  assert.equal(state.player.shield, true);
  const support = skiContacts(state.player)[0];
  assert.ok(Math.abs(support.y - terrainY(support.x, state.trail)) < 0.1);
  tick(state, {}, 10);
  assert.equal(state.player.partner, 'slide');
  addFeature(state, 'branch');
  assert.ok(!tick(state).includes('crash'));
  assert.equal(state.player.partner, null);
  assert.equal(state.player.shield, false);
  tick(state, {}, 45);
  addFeature(state, 'rock');
  assert.ok(tick(state).includes('crash'));

  const replacement = clearRun();
  addFeature(replacement, 'slide');
  tick(replacement);
  addFeature(replacement, 'charge');
  assert.ok(tick(replacement).includes('mount'));
  assert.equal(replacement.player.partner, 'charge');
  assert.equal(replacement.player.shield, false);
});

test('both mounts last indefinitely without harmful contact and survive safe jumps', () => {
  for (const { id } of TRAILS) {
    for (const kind of ['slide', 'charge']) {
      const state = clearRun(id);
      addFeature(state, kind);
      assert.ok(tick(state).includes('mount'));
      const mountedX = state.player.x;
      const events = tick(state, {}, 10 * 60 * 120);
      assert.equal(state.player.partner, kind, `${id}: ${kind}`);
      assert.ok(state.player.x - mountedX > 1900 * 50);
      assert.equal(state.player.crashTime, 0);
      assert.ok(!events.includes('crash'));
      tick(state, { jump: true, jumpPressed: true });
      assert.equal(state.player.grounded, false);
      assert.ok(tick(state, {}, 240).includes('land'));
      assert.equal(state.player.partner, kind);
    }
  }
});

test('slide absorbs a rock collision and immediately ends the mount', () => {
  const state = clearRun();
  addFeature(state, 'slide');
  tick(state);
  state.player.boostTime = .8;
  addFeature(state, 'rock');
  assert.ok(!tick(state).includes('crash'));
  assert.equal(state.player.partner, null);
  assert.equal(state.player.boostTime, 0);
  assert.equal(state.player.shield, false);
  assert.ok(state.player.invulnerable > 0);
});

test('charge keeps riding through rocks but a branch ends the mount', () => {
  const rocks = clearRun();
  addFeature(rocks, 'charge');
  tick(rocks);
  addFeature(rocks, 'rock');
  const rock = rocks.features[rocks.features.length - 1];
  assert.ok(!tick(rocks).includes('crash'));
  assert.equal(rock.used, true);
  assert.equal(rocks.bonus, 30);
  assert.equal(rocks.player.partner, 'charge');
  addFeature(rocks, 'branch');
  assert.ok(tick(rocks).includes('crash'));
  assert.equal(rocks.player.partner, null);
});

test('tucking passes under branches, normal stance crashes; ramp launches and coins score once', () => {
  const tucked = clearRun();
  const standing = clearRun();
  addFeature(tucked, 'branch');
  addFeature(standing, 'branch');
  assert.ok(!tick(tucked, { tuck: true }, 45).includes('crash'));
  assert.ok(tick(standing).includes('crash'));
  const ramp = clearRun();
  addFeature(ramp, 'ramp', ramp.player.x - 60, 76);
  tick(ramp);
  assert.equal(ramp.player.grounded, false);
  assert.ok(ramp.player.vy < -400);
  const coins = clearRun();
  addFeature(coins, 'coin');
  coins.features[0].y -= 32;
  const events = tick(coins, {}, 10);
  assert.equal(events.filter(e => e === 'coin').length, 1);
  assert.equal(coins.coins, 1);
  assert.ok(coins.coinFlash > 0);
  assert.ok(coins.particles.some(p => p.color === '#FFD475'));
  assert.equal(coins.score, Math.floor(coins.distance) + 25);
});

test('only body contact catches; airborne clearance and transparent margin are safe', () => {
  const state = clearRun();
  state.player.speed = 0;
  state.chasers = [{ x: state.player.x - 50, offset: 0, lane: 0, phase: 0 }];
  tick(state);
  assert.equal(state.over, false);
  const jumping = clearRun();
  airborne(jumping, 140);
  jumping.chasers = [{ x: jumping.player.x - 10, offset: 0, lane: 2, phase: 0 }];
  tick(jumping);
  assert.equal(jumping.over, false);
  const touching = clearRun();
  touching.chasers = [{ x: touching.player.x - 20, offset: 0, lane: 0, phase: 0 }];
  touching.player.invulnerable = 99;
  assert.deepEqual(tick(touching), ['caught']);
  assert.equal(touching.over, true);
  assert.deepEqual(tick(touching), []);
});

test('swept bodies catch crossings at extreme speed, including while riding', () => {
  const crossing = clearRun();
  crossing.player.speed = 30000;
  crossing.chasers = [{ x: crossing.player.x + 80, offset: 0, lane: 0, phase: 0 }];
  assert.ok(tick(crossing).includes('caught'));
  assert.ok(crossing.player.x > 350);
  for (const partner of ['slide', 'charge']) {
    const state = clearRun();
    state.player.partner = partner;
    state.player.shield = true;
    state.player.invulnerable = 99;
    state.chasers = [{ x: state.player.x, offset: 0, lane: 0, phase: 0 }];
    assert.ok(tick(state).includes('caught'), partner);
    assert.equal(state.player.partner, null);
    assert.equal(state.over, true);
  }
});

test('reduced motion preserves gameplay and limits only particles', () => {
  const full = clearRun();
  const reduced = clearRun();
  addFeature(full, 'slide');
  addFeature(reduced, 'slide');
  stepRun(full, emptyInput(), DT, false);
  stepRun(reduced, emptyInput(), DT, true);
  assert.ok(full.particles.length > 0);
  assert.equal(reduced.particles.length, 0);
  full.particles = [];
  assert.deepEqual(full, reduced);
});

test('one 1/60 call agrees with two 1/120 steps and an oversized frame is capped', () => {
  const one = clearRun();
  const two = clearRun();
  stepRun(one, { ...emptyInput(), jump: true, jumpPressed: true }, 1 / 60);
  tick(two, { jump: true, jumpPressed: true }, 2);
  assert.deepEqual(one.player, two.player);
  const capped = clearRun();
  stepRun(capped, emptyInput(), 10);
  assert.ok(Math.abs(capped.time - 0.1) < 1e-9);
});

test('without mounts, idle players recover from the first rock but repeated mistakes end every trail', () => {
  for (const { id } of TRAILS) {
    const state = createRun(id);
    let crashes = 0;
    let caught = 0;
    let recoveredFirstCrash = false;
    for (let i = 0; i < 120 * 120 && !state.over; i++) {
      // Isolate recovery and pursuit from the now unlimited mount protection.
      state.features = state.features.filter(f => f.kind !== 'slide' && f.kind !== 'charge');
      stepRun(state, emptyInput(), DT);
      crashes += Number(state.events.includes('crash'));
      caught += Number(state.events.includes('caught'));
      if (crashes === 1 && state.player.crashTime === 0 && !state.over) recoveredFirstCrash = true;
    }
    assert.equal(recoveredFirstCrash, true, id);
    assert.ok(crashes >= 2, id);
    assert.equal(state.over, true, id);
    assert.ok(state.time > 10 && state.time < 90, `${id}: ${state.time}s`);
    assert.equal(caught, 1, id);
    assert.deepEqual(tick(state), []);
  }
});

test('steady skiing maintains a close gap and indefinite mounts keep a bounded lead', () => {
  for (const { id } of TRAILS) {
    for (const partner of ['slide', 'charge']) {
      const state = createRun(id);
      state.features = [];
      state.nextSegment = 1e6;
      state.time = 40;
      tick(state, {}, 60 * 120);
      const baseline = frontGap(state);
      assert.ok(baseline >= 200 && baseline <= 260, `${id}: baseline ${baseline}`);
      addFeature(state, partner);
      assert.ok(tick(state).includes('mount'));
      tick(state, {}, 2 * 120);
      assert.ok(frontGap(state) > baseline + 50, `${id}: ${partner} boost`);
      tick(state, {}, 18 * 120);
      assert.equal(state.player.partner, partner);
      const mountedGap = frontGap(state);
      assert.ok(mountedGap > baseline + 50 && mountedGap < 500, `${id}: mounted ${mountedGap}`);
      assert.equal(state.over, false);
    }
  }
});

test('hand-authored route patterns admit safe jump/tuck paths without invulnerability', () => {
  for (const { id } of TRAILS) {
    const state = createRun(id);
    let crashes = 0;
    for (let i = 0; i < 180 * 120 && !state.over; i++) {
      const p = state.player;
      const obstacle = state.features.find(f => !f.used
        && ((f.kind === 'rock' && p.partner !== 'charge') || (f.kind === 'branch' && p.partner))
        && f.x > p.x && f.x - p.x < 115);
      const tuck = !p.partner && state.features.some(f => f.kind === 'branch'
        && f.x - p.x < 120 && f.x + f.width > p.x - 30);
      const pressed = !!obstacle && p.grounded;
      stepRun(state, { jump: pressed || (!p.grounded && p.airTime < 0.2), jumpPressed: pressed, tuck: !!tuck, tilt: 0 }, DT);
      crashes += Number(state.events.includes('crash'));
    }
    assert.equal(state.over, false, id);
    assert.equal(crashes, 0, id);
    assert.ok(state.distance > 5000, id);
  }
});

test('thirty-minute runs keep every live collection bounded with finite capped difficulty', () => {
  for (const { id } of TRAILS) {
    const state = createRun(id);
    let maxFeatures = 0;
    let maxParticles = 0;
    for (let i = 0; i < 30 * 60 * 120; i++) {
      // Isolate streaming/resource lifetime from failure; collision/recovery are tested above.
      state.player.invulnerable = 1;
      if (frontGap(state) < 160) {
        for (const chaser of state.chasers) chaser.x -= 300;
      }
      const obstacle = state.features.find(f => !f.used && f.kind === 'rock'
        && f.x > state.player.x && f.x - state.player.x < 115);
      const branch = state.features.some(f => f.kind === 'branch' && f.x - state.player.x < 120
        && f.x + f.width > state.player.x - 30);
      stepRun(state, { jump: false, jumpPressed: !!obstacle && state.player.grounded, tuck: branch, tilt: 0 }, DT, i % 2 === 0);
      assert.equal(state.over, false);
      maxFeatures = Math.max(maxFeatures, state.features.length);
      maxParticles = Math.max(maxParticles, state.particles.length);
      assert.equal(state.chasers.length, 8);
      assert.ok(state.events.length <= 8);
    }
    assert.ok(state.distance > 50000);
    assert.ok(maxFeatures <= 72);
    assert.ok(maxParticles <= 80);
    assert.ok(state.player.speed <= 470);
    assert.ok(Number.isFinite(state.player.y));
    assert.ok(Number.isFinite(state.score));
    assert.ok(state.features.every(f => f.x + f.width > state.player.x - 450));
    assert.ok(state.nextSegment < state.player.x / 2400 + 2);
  }
});
