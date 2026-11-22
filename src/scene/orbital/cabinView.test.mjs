import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { load } from './load-for-validation.mjs';
import { BEDROOM_LEFT, BEDROOM_WALL_FRONT, BEDROOM_WALL_OUTSET, CABIN_DIVIDER_X, CABIN_RIGHT, RESIDENT_RADIUS, UPPER_DECK_OFFSET, WARDROBE_FOOTPRINT, WARDROBE_STAND } from './cabinLayout.ts';
import { CAMERA_FOV, EARTH_RADIUS, HOME_ZOOM, cabinCameraFrame, earthPositionForAspect, stairCameraFrames } from './cabinView.ts';
import { CABIN_STAIRS, STAIR_DISTANCE, STAIR_UPPER_PLATFORM_BACK, STAIR_UPPER_ENTRY_FRONT, sampleCabinStairs, stairLanding } from './cabinStairs.ts';

const [upperX, upperY] = UPPER_DECK_OFFSET;
const upperRight = CABIN_DIVIDER_X + upperX;
const lower = [
  [CABIN_DIVIDER_X, -.28, -3.41], [CABIN_DIVIDER_X, -.28, 3.19],
  [CABIN_RIGHT, -.28, -3.41], [CABIN_RIGHT, -.28, 3.19],
  [CABIN_DIVIDER_X, 3.77, -3.41], [CABIN_RIGHT, 3.77, -3.41], [CABIN_RIGHT, 3.77, 3.19],
];
const upper = [
  [CABIN_DIVIDER_X, upperY + .76, 3.19], [upperRight, upperY + .76, 3.19],
  [CABIN_DIVIDER_X, upperY + 3.77, -3.41], [upperRight, upperY + 3.77, -3.41],
  [upperRight + BEDROOM_WALL_OUTSET, upperY + 3.77, BEDROOM_WALL_FRONT],
  [CABIN_STAIRS.x - CABIN_STAIRS.width / 2, upperY + .80, STAIR_UPPER_PLATFORM_BACK],
];
const stairsLeft = CABIN_STAIRS.x - CABIN_STAIRS.width / 2;
const stairs = [
  [stairsLeft, 0, CABIN_STAIRS.lowerZ], [stairsLeft, upperY + .76, CABIN_STAIRS.upperZ],
];

for (const [width, height] of [[1400, 950], [390, 844], [844, 390]]) {
  test(`the cabin overview and both floor presets fit at ${width} × ${height}`, () => {
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, .08, 2000);
    camera.zoom = HOME_ZOOM;
    for (const [view, corners] of [['overview', [...lower, ...upper, ...stairs]], ['lower', lower], ['upper', upper]]) {
      const frame = cabinCameraFrame(view, aspect);
      camera.position.copy(frame.position);
      camera.lookAt(frame.target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      for (const point of corners) {
        const { x, y } = new THREE.Vector3(...point).project(camera);
        assert.ok(Math.abs(x) < .95 && Math.abs(y) < .95, `${view} cropped ${point}`);
      }
    }
    const eye = cabinCameraFrame('overview', aspect).position;
    const windowRay = new THREE.Vector3(.68, 2.6, -3.31).sub(eye).normalize();
    const earth = new THREE.Vector3(...earthPositionForAspect(aspect));
    assert.ok(earth.dot(windowRay) > 0);
    assert.ok(Math.abs(earth.clone().cross(windowRay).length() - EARTH_RADIUS) < .001);
    for (const { position } of Object.values(stairCameraFrames(aspect))) {
      assert.ok(position.x < stairsLeft, 'the stair camera keeps the resident in front of the bedroom wall');
    }
  });
}

test('the exported bedroom places the window and wardrobe on the right and leaves the stairs open', async () => {
  const { gltf } = await load(new URL('../../../assets/public/models/cabin/open-cabin.glb', import.meta.url));
  gltf.scene.updateMatrixWorld(true);
  const shell = gltf.scene.getObjectByName('Duplex_UpperShell');
  const lowerShell = gltf.scene.getObjectByName('Duplex_LowerShell');
  for (const z of [-2.8, -.2, 1.2]) {
    const outerWallX = (wall, shift) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(CABIN_RIGHT + .5 - shift, 1.6, z), new THREE.Vector3(-1, 0, 0));
      return ray.intersectObject(wall, true)[0].point.x + shift;
    };
    assert.ok(Math.abs(outerWallX(shell, upperX) - outerWallX(lowerShell, 0)) < .004, 'the exterior walls share a vertical plane');
  }
  const floor = gltf.scene.getObjectByName('Floor_Parquet_Bedroom');
  for (const x of [BEDROOM_LEFT + .16, CABIN_DIVIDER_X - .08]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 1, .8), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(floor, true).length, 'parquet reaches both bedroom walls');
  }
  const cabinet = gltf.scene.getObjectByName('Interactable_Wardrobe');
  const wardrobe = new THREE.Box3().setFromObject(cabinet, true);
  const actual = [wardrobe.min.x, wardrobe.max.x, wardrobe.min.z, wardrobe.max.z];
  actual.forEach((edge, i) => assert.ok(Math.abs(edge - WARDROBE_FOOTPRINT[i]) < .02, 'walking bounds follow the cabinet'));
  assert.ok(wardrobe.max.x > CABIN_DIVIDER_X - .12);
  assert.ok(WARDROBE_STAND[0] + RESIDENT_RADIUS < wardrobe.min.x);

  const door = cabinet.getObjectByName('Wardrobe_SlidingDoor');
  const intoCabinet = new THREE.Raycaster(new THREE.Vector3(-3, 1.79, 1.09), new THREE.Vector3(1, 0, 0));
  for (const [z, angle] of [[.748, 0], [.075, -.8], [1.425, .8]]) {
    const direction = new THREE.Vector3(1, 0, -angle).normalize();
    const origin = new THREE.Vector3(-2.7215, 1.79, z).addScaledVector(direction, -.27);
    const ray = new THREE.Raycaster(origin, direction);
    const hits = ray.intersectObject(cabinet, true);
    assert.ok(hits.length && hits[0].point.x < -2.65, 'closed panels and door jambs mask the compartment');
  }
  const depth = () => intoCabinet.intersectObject(cabinet, true)[0].distance;
  const closed = depth();
  door.position.x -= .093;
  door.position.z -= .66;
  cabinet.updateMatrixWorld(true);
  assert.ok(depth() > closed + .55, 'sliding the leaf exposes the interior behind it');

  const wallAt = (x, z, direction) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.7, z), new THREE.Vector3(direction, 0, 0), 0, 1);
    return ray.intersectObject(shell, true).length > 0;
  };
  for (const z of [CABIN_STAIRS.upperZ, WARDROBE_STAND[1], 2.08]) {
    assert.ok(!wallAt(BEDROOM_LEFT + .4, z, -1), 'stair side is open');
  }
  assert.ok(wallAt(wardrobe.min.x, WARDROBE_STAND[1], 1), 'solid backing behind the wardrobe');
  assert.ok(wallAt(CABIN_DIVIDER_X - .5, CABIN_STAIRS.upperZ, 1), 'no stair doorway in the right wall');
  assert.ok(!wallAt(CABIN_DIVIDER_X - .5, 2.08, 1), 'the porthole looks outside');
});

test('the stair path connects the authored landings at their actual deck elevations', () => {
  const lower = stairLanding('lower');
  const upper = stairLanding('upper');
  assert.deepEqual(sampleCabinStairs(0).position, [lower[0], 0, lower[1]]);
  const end = sampleCabinStairs(STAIR_DISTANCE).position;
  assert.ok(Math.hypot(end[0] - (upper[0] + upperX), end[1] - upperY, end[2] - upper[1]) < 1e-10);
  let last = sampleCabinStairs(0);
  for (let index = 1; index <= 1000; index++) {
    const next = sampleCabinStairs(STAIR_DISTANCE * index / 1000);
    assert.ok(next.position[1] >= last.position[1] - 1e-10);
    assert.ok(Math.hypot(...next.position.map((value, axis) => value - last.position[axis])) < .03);
    const [x, y, z] = next.position;
    if (y === upperY && x + RESIDENT_RADIUS >= CABIN_DIVIDER_X) {
      assert.ok(z - RESIDENT_RADIUS > STAIR_UPPER_PLATFORM_BACK + .032);
      assert.ok(z + RESIDENT_RADIUS < STAIR_UPPER_ENTRY_FRONT - .032);
    }
    last = next;
  }
});
