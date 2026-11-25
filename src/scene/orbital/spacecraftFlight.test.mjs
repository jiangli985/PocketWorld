import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMERA_FOV, earthPositionForAspect } from './cabinView.ts';
import * as flightMotion from './spacecraftFlight.ts';
import {
  APPROACH_DURATION,
  BOOST_TIME_SCALE_EXTRA,
  SHIP_TARGET,
  approachStartPosition,
  createFlightState,
  hullOpacityForTransition,
  orbitDistanceForAspect,
  orbitHomePosition,
  readInitialViewMode,
  stepFlightState,
} from './spacecraftFlight.ts';

test('initial view mode respects query params and reduced motion', () => {
  assert.equal(readInitialViewMode('', false), 'approach');
  assert.equal(readInitialViewMode('', true), 'orbit');
  assert.equal(readInitialViewMode('?view=orbit', false), 'orbit');
  assert.equal(readInitialViewMode('?view=cabin', false), 'cabin');
  assert.equal(readInitialViewMode('?dev=mario', false), 'cabin');
  assert.equal(readInitialViewMode('?dev=shooter', false), 'cabin');
});

test('orbital framing keeps the spacecraft and Earth together in view across desktop and portrait', () => {
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.08, 2000);
    const eye = orbitHomePosition(aspect);
    camera.position.copy(eye);
    camera.lookAt(SHIP_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    // Spacecraft primary hull corners stay uncropped
    for (const point of [[-8.95, -0.96, -4.26], [7.85, 4.5, 4.26], [-8.95, 6.2, 0]]) {
      const projected = new THREE.Vector3(...point).project(camera);
      assert.ok(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95, `${width}x${height} cropped ${point}`);
    }

    // Opening approach starts much farther out than settled orbit view
    const startDist = approachStartPosition(aspect).distanceTo(SHIP_TARGET);
    assert.ok(startDist > orbitDistanceForAspect(aspect) * 2.2);

    // Earth sits forward of the orbital camera look vector (visible behind/below the spacecraft)
    const lookDir = SHIP_TARGET.clone().sub(eye).normalize();
    const earthDir = new THREE.Vector3(...earthPositionForAspect(aspect)).normalize();
    assert.ok(lookDir.dot(earthDir) > 0.85, `${width}x${height} Earth alignment too weak: ${lookDir.dot(earthDir)}`);
  }
});

test('boost ramps up smoothly, accelerates orbital time and Earth spin, then coasts down cleanly', () => {
  const flight = createFlightState('orbit');
  assert.equal(flight.timeScale, 1);

  flight.boosting = true;
  for (let i = 0; i < 60; i++) stepFlightState(flight, 1 / 60, false);
  assert.ok(flight.boost > 0.9, `expected near-full boost, got ${flight.boost}`);
  assert.ok(flight.timeScale > 1 + BOOST_TIME_SCALE_EXTRA * 0.9);
  const boostedSpin = flight.earthSpinAngle;
  assert.ok(boostedSpin > 0.15);

  flight.boosting = false;
  for (let i = 0; i < 240; i++) stepFlightState(flight, 1 / 60, false);
  assert.ok(flight.boost < 0.02, `expected boost decay, got ${flight.boost}`);
  assert.ok(flight.timeScale < 1.8);
});

test('opening approach transitions cleanly to orbit and reduced motion skips long glide', () => {
  const normal = createFlightState('approach');
  let finished = false;
  for (let i = 0; i < Math.ceil(APPROACH_DURATION * 60) + 5; i++) {
    if (stepFlightState(normal, 1 / 60, false)) finished = true;
  }
  assert.equal(finished, true);
  assert.equal(normal.mode, 'orbit');
  assert.equal(normal.approachProgress, 1);

  const reduced = createFlightState('approach');
  assert.equal(stepFlightState(reduced, 1 / 60, true), true);
  assert.equal(reduced.mode, 'orbit');
});

test('hull opacity fades smoothly during enter/leave transitions and stays solid or hidden at endpoints', () => {
  assert.equal(hullOpacityForTransition('orbit', 0), 1);
  assert.equal(hullOpacityForTransition('cabin', 0), 0);
  assert.equal(hullOpacityForTransition('entering-cabin', 0), 1);
  assert.ok(hullOpacityForTransition('entering-cabin', 0.5) > 0.2 && hullOpacityForTransition('entering-cabin', 0.5) < 0.8);
  assert.equal(hullOpacityForTransition('entering-cabin', 1), 0);
  assert.equal(hullOpacityForTransition('leaving-cabin', 0), 0);
  assert.ok(hullOpacityForTransition('leaving-cabin', 0.5) > 0.2 && hullOpacityForTransition('leaving-cabin', 0.5) < 0.8);
  assert.equal(hullOpacityForTransition('leaving-cabin', 1), 1);
});

test('the interior and hull dissolve together in both flight directions', () => {
  const opacity = flightMotion.cabinOpacityForTransition;
  assert.equal(opacity('orbit', 1), 0);
  assert.equal(opacity('cabin', 0), 1);
  for (const [mode, start, end] of [['entering-cabin', 0, 1], ['leaving-cabin', 1, 0]]) {
    assert.equal(opacity(mode, 0), start);
    assert.equal(opacity(mode, 1), end);
    let previous = start;
    let overlap = 0;
    for (let i = 1; i <= 20; i++) {
      const progress = i / 20;
      const cabin = opacity(mode, progress);
      const hull = hullOpacityForTransition(mode, progress);
      assert.ok(start === 0 ? cabin >= previous : cabin <= previous);
      assert.ok(cabin > 0 || hull > 0, 'there is always a visible model during the transition');
      if (cabin > 0 && cabin < 1 && hull > 0 && hull < 1) overlap++;
      previous = cabin;
    }
    assert.ok(overlap >= 7, 'both models should overlap through the crossfade');
  }
});
