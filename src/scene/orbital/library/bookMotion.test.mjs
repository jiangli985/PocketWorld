import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { load } from '../load-for-validation.mjs';

function loadTS(relativePath, deps = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {}, require: id => id === 'three' ? THREE : deps[id] };
  vm.runInNewContext(compiled, mod);
  return mod.exports;
}

const catalog = loadTS('./catalog.ts');
const authored = loadTS('./pageTurnFrames.ts');
const bookMotion = loadTS('./bookMotion.ts', { './catalog': catalog, './pageTurnFrames': authored });
const armPose = loadTS('./armPose.ts');
const residentPose = loadTS('./residentPose.ts', { './bookMotion': bookMotion, './catalog': catalog, './armPose': armPose, './pageTurnFrames': authored });
const rigMod = loadTS('../residentRig.ts');
const libraryMotion = loadTS('./libraryMotion.ts', { './bookMotion': bookMotion, './catalog': catalog, '../residentRig': rigMod });
const { gltf } = await load(new URL('../../../../assets/public/models/resident/luna-walk-room.glb', import.meta.url));

function makeRig() {
  const asset = clone(gltf.scene);
  const rig = rigMod.createResidentRig(asset, gltf.animations[0]);
  const root = new THREE.Group();
  root.add(rig.mesh);
  root.rotation.y = Math.PI;
  return { asset, rig, root };
}

function stepPose(rig, root, book, phase, progress, direction = 1) {
  const flow = { phase, book, page: 0, targetPage: 1, direction, progress, pages: [], nextId: null, closeRequested: false, exit: false, pending: null };
  const isHeld = ['open', 'reading', 'turn', 'close'].includes(phase);
  const stand = bookMotion.bookStand('habitat', book, !isHeld);
  root.position.set(stand[0], 0, stand[2]);
  residentPose.carryResident(root, 'habitat', flow);
  root.position.y -= residentPose.libraryCrouch(flow);
  root.updateMatrixWorld(true);
  // Settle damped torso/gaze over a few steps so we inspect the target pose.
  for (let i = 0; i < 6; i++) residentPose.applyLibraryPose(rig, root, 'habitat', flow, 0.25);
  rig.applyPose(0, 0);
  root.updateMatrixWorld(true);
  return bookMotion.bookPose('habitat', book, flow);
}

test('十八个书位在伸手、抽出与推入全程保持手书贴合且手臂未超限', () => {
  const { rig, root } = makeRig();
  try {
    for (const slot of catalog.BOOK_SLOTS) {
      const book = { id: 'b', source: 'builtin', title: 'T', author: 'A', text: 'x', color: '#617e79', slotId: slot.id, anchor: 0 };
      const grabSide = bookMotion.bookGrabSide(book);
      const grabLocal = bookMotion.bookGrabLocal(book);
      const shelfPos = bookMotion.bookPose('habitat', book, { phase: 'reach', book, progress: 0, page: 0, targetPage: 0, direction: 1, pages: [], nextId: null, closeRequested: false, exit: false, pending: null }).position;
      const reachEnd = bookMotion.bookPose('habitat', book, { phase: 'reach', book, progress: 1, page: 0, targetPage: 0, direction: 1, pages: [], nextId: null, closeRequested: false, exit: false, pending: null }).position;
      assert.ok(shelfPos.distanceTo(reachEnd) < 1e-6, `${slot.id} reach 阶段书不能提前移动`);

      for (const [phase, samples] of [['reach', [1]], ['extract', [0, 0.5, 1]], ['insert', [0, 0.5, 1]]]) {
        for (const p of samples) {
          const pose = stepPose(rig, root, book, phase, p);
          const expected = grabLocal.clone().applyQuaternion(pose.quaternion).add(pose.position);
          const arm = rig.arms[grabSide];
          const modeOff = arm.palmOffset.clone().lerp(arm.fingerTipOffset, 0.48);
          const actual = modeOff.applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion())).add(arm.hand.getWorldPosition(new THREE.Vector3()));
          assert.ok(actual.distanceTo(expected) < 0.002, `${slot.id} ${phase}@${p} 接触误差 ${actual.distanceTo(expected)}`);
          const ext = arm.upper.getWorldPosition(new THREE.Vector3()).distanceTo(arm.hand.getWorldPosition(new THREE.Vector3())) / (arm.upperLength + arm.lowerLength);
          assert.ok(ext < 0.92, `${slot.id} ${phase}@${p} 手臂伸展比例 ${ext}`);
        }
      }
    }
  } finally {
    rig.dispose();
  }
});

test('Blender three-row clips bind to the resident and keep every book at its shelf and handoff anchors', async () => {
  const { gltf: baked } = await load(new URL('../../../../assets/public/models/resident/luna-library.glb', import.meta.url));
  const motion = libraryMotion.readLibraryMotion(baked.animations);
  const { rig, root, asset } = makeRig();
  const play = libraryMotion.createLibraryPlayer(rig.mesh, motion);
  const contacts = ['RightHand', 'LeftHand', 'RightFoot', 'LeftFoot'].map(name => asset.getObjectByName(`mixamorig${name}`));
  function sample(book, phase, progress) {
    const flow = { book, phase, progress };
    const frame = libraryMotion.libraryMotionSample(flow);
    const coverFlow = libraryMotion.libraryCoverFlow(flow, frame);
    const pose = bookMotion.bookPose('habitat', book, coverFlow, true);
    root.position.fromArray(bookMotion.authoredBookStand('habitat', book, frame.coverProgress !== undefined));
    rig.applyPose(0, 0);
    play(book, frame);
    libraryMotion.applyLibraryBookMotion(motion, 'habitat', book, frame, pose.position, pose.quaternion);
    return { pose, anchors: contacts.map(joint => joint.getWorldPosition(new THREE.Vector3())) };
  }
  const adjacent = [
    ['reach', 1, 'extract', 0], ['extract', 1, 'carry', 0],
    ['carry', 1, 'open', 0], ['close', 1, 'return-carry', 0],
    ['return-carry', 1, 'insert', 0], ['insert', 1, 'release', 0],
  ];
  try {
    for (const slot of catalog.BOOK_SLOTS) {
      const book = { id: 'b', slotId: slot.id };
      const shelf = bookMotion.bookPose('habitat', book, { phase: 'idle', progress: 0 });
      const held = bookMotion.bookPose('habitat', book, { book, phase: 'open', progress: 0 }, true);
      const extracted = sample(book, 'extract', 0).pose;
      const carried = sample(book, 'carry', 1).pose;
      assert.ok(extracted.position.distanceTo(shelf.position) < .002, `${slot.id} seated book position`);
      assert.ok(extracted.quaternion.angleTo(shelf.quaternion) < .003, `${slot.id} seated book orientation`);
      assert.ok(carried.position.distanceTo(held.position) < .002, `${slot.id} held book position`);
      assert.ok(carried.quaternion.angleTo(held.quaternion) < .003, `${slot.id} held book orientation`);
      for (const [a, p, b, q] of adjacent) {
        const start = sample(book, a, p), end = sample(book, b, q);
        assert.ok(start.pose.position.distanceTo(end.pose.position) < .0001, `${slot.id} ${a} → ${b}: book position`);
        assert.ok(start.pose.quaternion.angleTo(end.pose.quaternion) < .001, `${slot.id} ${a} → ${b}: book orientation`);
        start.anchors.forEach((anchor, i) => {
          assert.ok(anchor.distanceTo(end.anchors[i]) < .0001, `${slot.id} ${a} → ${b}: ${contacts[i].name}`);
        });
      }
      const pull = sample(book, 'extract', .35), push = sample(book, 'insert', .65);
      assert.ok(pull.pose.position.distanceTo(push.pose.position) < .0001, `${slot.id} insertion reverses extraction`);
      pull.anchors.forEach((anchor, i) => {
        assert.ok(anchor.distanceTo(push.anchors[i]) < .0001, `${slot.id} ${contacts[i].name} reverses with the book`);
      });
    }
  } finally {
    rig.dispose();
  }
});

test('开书、合书与双向翻页手部轨迹紧贴封面边缘和弯曲纸页', () => {
  const { rig, root } = makeRig();
  try {
    const book = catalog.freshLibrary().books[0];
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      const pose = stepPose(rig, root, book, 'open', p);
      if (p <= 0.78) {
        const cg = bookMotion.bookCoverGripPose(pose.open);
        const expected = cg.position.clone().applyQuaternion(pose.quaternion).add(pose.position);
        const arm = rig.arms[0];
        const actual = arm.palmOffset.clone().applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion())).add(arm.hand.getWorldPosition(new THREE.Vector3()));
        assert.ok(actual.distanceTo(expected) < 0.002, `open@${p} 封面手接触误差`);
      }
      const cpose = stepPose(rig, root, book, 'close', p);
      if (p >= 0.22) {
        const cg = bookMotion.bookCoverGripPose(cpose.open);
        const expected = cg.position.clone().applyQuaternion(cpose.quaternion).add(cpose.position);
        const arm = rig.arms[0];
        const actual = arm.palmOffset.clone().applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion())).add(arm.hand.getWorldPosition(new THREE.Vector3()));
        assert.ok(actual.distanceTo(expected) < 0.002, `close@${p} 封面手接触误差`);
      }
    }
    for (const dir of [1, -1]) {
      for (let i = Math.round(bookMotion.PAGE_CONTACT_START * 100); i <= Math.round(bookMotion.PAGE_CONTACT_END * 100); i += 3) {
        const p = i / 100;
        const pose = stepPose(rig, root, book, 'turn', p, dir);
        const curve = bookMotion.turningPageCurve(p, dir);
        const pt = bookMotion.turningPagePoint(curve.leafRatio, curve.bendAmp, 0.205, 0.085);
        const expected = pt.position.clone().addScaledVector(pt.normal, dir > 0 ? 0.002 : -0.002).applyQuaternion(pose.quaternion).add(pose.position);
        const arm = rig.arms[dir > 0 ? 0 : 1];
        const actual = arm.fingerTipOffset.clone().applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion())).add(arm.hand.getWorldPosition(new THREE.Vector3()));
        assert.ok(actual.distanceTo(expected) < 0.002, `turn(${dir})@${p} 纸页指尖误差`);
      }
      const endCurve = bookMotion.turningPageCurve(1, dir);
      assert.equal(endCurve.leafRatio, dir > 0 ? 1 : 0);
      assert.ok(Math.abs(endCurve.bendAmp) < 1e-6);
    }
  } finally {
    rig.dispose();
  }
});

test('开书、双向翻页和合书的蒙皮手臂不会单帧反转', () => {
  const { asset, rig, root } = makeRig();
  const book = catalog.freshLibrary().books[0];
  const joints = ['Right', 'Left'].flatMap(side => ['Arm', 'ForeArm', 'Hand'].map(name => asset.getObjectByName(`mixamorig${side}${name}`)));
  const phases = [['open', 1], ['reading', 1], ['turn', 1], ['reading', 1], ['turn', -1], ['reading', 1], ['close', 1]];
  root.position.fromArray(bookMotion.authoredBookStand('habitat', book, true));
  let previous;
  try {
    for (const [phase, direction] of phases) for (let frame = 0; frame <= 240; frame++) {
      const flow = { book, phase, direction, progress: frame / 240 };
      residentPose.applyLibraryPose(rig, root, 'habitat', flow, 1 / 120, true);
      rig.applyPose(0, 0);
      if (previous) joints.forEach((joint, i) => {
        assert.ok(joint.quaternion.angleTo(previous[i]) < Math.PI / 15,
          `${phase}(${direction}) frame ${frame}: ${joint.name} changed more than 12°`);
      });
      previous = joints.map(joint => joint.quaternion.clone());
    }
  } finally {
    rig.dispose();
  }
});

test('连续阶段衔接处手腕与书本位置无跳变，且底层屈膝脚底贴地稳定', () => {
  const { asset, rig, root } = makeRig();
  try {
    for (const book of [catalog.freshLibrary().books[0], { ...catalog.freshLibrary().books[0], slotId: 's0-0' }, { ...catalog.freshLibrary().books[0], slotId: 's2-5' }]) {
      const pairs = [
        [['reach', 1], ['extract', 0]],
        [['extract', 1], ['carry', 0]],
        [['carry', 1], ['open', 0]],
        [['open', 1], ['reading', 0]],
        [['reading', 1], ['turn', 0]],
        [['turn', 1], ['reading', 0]],
        [['reading', 1], ['close', 0]],
        [['close', 1], ['return-carry', 0]],
        [['return-carry', 1], ['insert', 0]],
        [['insert', 1], ['release', 0]],
      ];
      for (const [[phA, pA], [phB, pB]] of pairs) {
        const poseA = stepPose(rig, root, book, phA, pA);
        const wristsA = rig.arms.map(a => a.hand.getWorldPosition(new THREE.Vector3()));
        const poseB = stepPose(rig, root, book, phB, pB);
        const wristsB = rig.arms.map(a => a.hand.getWorldPosition(new THREE.Vector3()));
        assert.ok(poseA.position.distanceTo(poseB.position) < 0.002, `${book.slotId} ${phA}->${phB} 书位置跳变`);
        for (let s = 0; s < 2; s++) {
          assert.ok(wristsA[s].distanceTo(wristsB[s]) < 0.015, `${book.slotId} ${phA}->${phB} arm ${s} 手腕跳变 ${wristsA[s].distanceTo(wristsB[s])}`);
        }
      }
    }

    // Check bottom-shelf crouch leg IK keeps both soles anchored at neutral foot Y/Z.
    const bottomBook = { ...catalog.freshLibrary().books[0], slotId: 's0-0' };
    rig.applyPose(0, 0);
    rig.mesh.position.y = 0;
    rig.mesh.updateMatrixWorld(true);
    const neutralL = asset.getObjectByName('mixamorigLeftFoot').getWorldPosition(new THREE.Vector3());
    for (const crouch of [0.02, 0.10, 0.19]) {
      const leg = rig.legs[1];
      const footZ = leg.thigh.position.z + leg.shin.position.z + leg.foot.position.z;
      const ahead = footZ - leg.hipForward;
      const below = leg.thigh.position.y - leg.ankleHeight - crouch;
      const { upperLength: thigh, lowerLength: shin } = leg;
      const reach = THREE.MathUtils.clamp(Math.hypot(ahead, below), Math.abs(thigh - shin) + 0.001, (thigh + shin) * 0.999);
      const hip = Math.atan2(ahead, below) + Math.acos(THREE.MathUtils.clamp((thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach), -1, 1));
      const knee = Math.PI - Math.acos(THREE.MathUtils.clamp((thigh * thigh + shin * shin - reach * reach) / (2 * thigh * shin), -1, 1));
      leg.thigh.rotation.x = -hip + leg.straighten[0];
      leg.shin.rotation.x = knee + leg.straighten[1];
      leg.foot.rotation.x = -(leg.thigh.rotation.x + leg.shin.rotation.x);
      rig.mesh.position.y = -crouch;
      rig.applyPose(0, 0);
      rig.mesh.updateMatrixWorld(true);
      const movedL = asset.getObjectByName('mixamorigLeftFoot').getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(movedL.y - neutralL.y) < 0.002 && Math.abs(movedL.z - neutralL.z) < 0.002, `crouch ${crouch} 脚位漂移`);
    }
    void bottomBook;
  } finally {
    rig.dispose();
  }
});

test('翻页手先跨页再接触：双向掌心朝纸页，页过书脊后释放，回到原侧托书', () => {
  assert.ok(bookMotion.PAGE_TURN_SECONDS >= 2.8 && bookMotion.PAGE_TURN_SECONDS <= 3.2);
  for (const direction of [1, -1]) {
    const side = direction > 0 ? 0 : 1;
    const rest = bookMotion.bookSupportPose(side);
    const start = bookMotion.turningHandPose(0, direction);
    const end = bookMotion.turningHandPose(1, direction);
    assert.equal(start.side, side);
    for (const pose of [start, end]) {
      assert.ok(pose.position.distanceTo(rest.position) < 1e-9);
      assert.ok(pose.quaternion.angleTo(rest.quaternion) < 1e-7);
      assert.equal(pose.tipWeight, 0);
    }
    const caught = bookMotion.turningHandPose(bookMotion.PAGE_CONTACT_START, direction);
    assert.ok(caught.position.x * rest.position.x < 0, 'cross the spine to the opposite page corner before lifting');
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(caught.quaternion).y < -Math.cos(bookMotion.BOOK_WING_ANGLE) + 0.001, 'palm faces the tilted page on approach');
    assert.equal(bookMotion.turningPageCurve(bookMotion.PAGE_CONTACT_START, direction).forwardRatio, 0);
    assert.ok(bookMotion.turningPageCurve(bookMotion.PAGE_CONTACT_END, direction).forwardRatio > 0.5, 'carry the page beyond the spine before release');
    for (let frame = 0; frame <= 720; frame++) {
      const p = frame / 720;
      const hand = bookMotion.turningHandPose(p, direction);
      if (p >= bookMotion.PAGE_CONTACT_START && p <= bookMotion.PAGE_CONTACT_END) {
        const curve = bookMotion.turningPageCurve(p, direction);
        const page = bookMotion.turningPagePoint(curve.leafRatio, curve.bendAmp, 0.205, 0.085);
        const palmNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(hand.quaternion);
        assert.ok(palmNormal.dot(page.normal) * direction < -0.999, 'palm normal follows the visible face');
        assert.ok(Math.abs(hand.position.distanceTo(page.position) - 0.002) < 1e-9);
        assert.equal(hand.tipWeight, 1);
        assert.ok(hand.fingerCurl <= 0.15 && hand.thumbOppose <= 0.2, 'pinch stays soft');
      }
    }
    for (const boundary of [0.08, 0.16, bookMotion.PAGE_CONTACT_START, bookMotion.PAGE_CONTACT_END, 0.78, 0.86]) {
      const epsilon = 1e-5;
      const a = bookMotion.turningHandPose(boundary - epsilon, direction);
      const b = bookMotion.turningHandPose(boundary + epsilon, direction);
      assert.ok(a.position.distanceTo(b.position) < 0.0001, `position continuous at ${boundary}`);
      assert.ok(a.quaternion.angleTo(b.quaternion) < 0.001, `palm frame continuous at ${boundary}`);
      const center = bookMotion.turningHandPose(boundary, direction).position;
      const incoming = center.clone().sub(a.position).divideScalar(epsilon);
      const outgoing = b.position.clone().sub(center).divideScalar(epsilon);
      assert.ok(incoming.distanceTo(outgoing) < 0.006, `velocity continuous at ${boundary}`);
    }
  }
});

test('正向翻页左手持续托在书脊下，双向手臂保持可达且不穿过纸页堆', () => {
  const { rig, root } = makeRig();
  const book = catalog.freshLibrary().books[0];
  try {
    for (const direction of [1, -1]) for (let frame = 0; frame <= 180; frame++) {
      const p = frame / 180;
      const pose = stepPose(rig, root, book, 'turn', p, direction);
      const hand = bookMotion.turningHandPose(p, direction);
      const supportSide = 1 - hand.side;
      const support = rig.arms[supportSide];
      const actual = support.palmOffset.clone().applyQuaternion(support.hand.getWorldQuaternion(new THREE.Quaternion())).add(support.hand.getWorldPosition(new THREE.Vector3()));
      const local = actual.sub(pose.position).applyQuaternion(pose.quaternion.clone().invert());
      assert.ok(local.distanceTo(bookMotion.bookSupportPose(supportSide).position) < 0.002);
      if (direction > 0) assert.ok(local.x < 0.08 && local.y < 0, 'left cradles beneath the spine');
      const turning = rig.arms[hand.side];
      const fingertip = turning.palmOffset.clone().lerp(turning.fingerTipOffset, hand.tipWeight)
        .applyQuaternion(turning.hand.getWorldQuaternion(new THREE.Quaternion())).add(turning.hand.getWorldPosition(new THREE.Vector3()));
      const expected = hand.position.clone().applyQuaternion(pose.quaternion).add(pose.position);
      assert.ok(fingertip.distanceTo(expected) < 0.002, `turning contact ${direction}@${p}`);
      if (direction > 0) {
        const wrist = support.hand.getWorldPosition(new THREE.Vector3()).sub(pose.position).applyQuaternion(pose.quaternion.clone().invert());
        assert.ok(Math.abs(wrist.z) < 0.1075 && wrist.z < local.z, 'support wrist stays beneath the book footprint behind its contacting palm');
      }
      for (const arm of rig.arms) {
        const extension = arm.upper.getWorldPosition(new THREE.Vector3()).distanceTo(arm.hand.getWorldPosition(new THREE.Vector3())) / (arm.upperLength + arm.lowerLength);
        assert.ok(extension < 0.985, `reachable ${direction}@${p}: ${extension}`);
      }
      // The crossing contact clears the top face; lowering happens only beyond the cover edge.
      if (p >= 0.16 && p <= bookMotion.PAGE_CONTACT_START) assert.ok(hand.position.y >= 0.049, 'reach travels above the page stack');
      if (p > bookMotion.PAGE_CONTACT_END && p < 0.78) assert.ok(hand.position.y > 0.12, 'released palm returns above the falling sheet and page stacks');
      if (p > 0.78 && p < 0.86) assert.ok(Math.abs(hand.position.x) > 0.24, 'lower hand beyond the cover with room for the palm width');
    }
  } finally {
    rig.dispose();
  }
});

test('浅 V 的封面、正文和活动页在两端共面，合书保持原厚度', () => {
  const angle = bookMotion.BOOK_WING_ANGLE;
  assert.ok(angle >= THREE.MathUtils.degToRad(10) && angle <= THREE.MathUtils.degToRad(14));
  assert.equal(bookMotion.bookWingPose(1, 0).thickness, 0.041);
  assert.equal(bookMotion.bookWingPose(0, 0).widthScale, 0);
  for (const side of [0, 1]) {
    const wing = bookMotion.bookWingPose(side);
    assert.ok(Math.abs(wing.thickness - 0.011) < 1e-12, 'opened page stacks relax to the Blender-authored thin book profile');
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(wing.quaternion);
    assert.ok(Math.abs(normal.y - Math.cos(angle)) < 1e-12);
    for (let i = 0; i <= 18; i++) {
      const radius = bookMotion.BOOK_PAGE_WIDTH * i / 18;
      for (const z of [-0.1075, 0.1075]) {
        const top = bookMotion.bookWingPoint(side, 1, radius, wing.surfaceY, z);
        const page = bookMotion.turningPagePoint(side === 1 ? 0 : 1, 0, radius, z);
        assert.ok(page.position.distanceTo(top) < 1e-12, `${side} vertex ${i} lands on the static top face`);
        assert.ok(Math.abs(page.normal.dot(normal)) > 1 - 1e-12, 'sheet and text share the wing plane');
      }
    }
  }
  for (let i = 0; i <= 120; i++) {
    const open = i / 120;
    const frame = bookMotion.bookCoverPose(open);
    const grip = bookMotion.bookCoverGripPose(open);
    const local = grip.position.clone().sub(frame.position).applyQuaternion(frame.quaternion.clone().invert());
    assert.ok(local.distanceTo(new THREE.Vector3(0.18, -0.004, -0.088)) < 1e-12, 'cover hand remains attached during opening and closing');
    const support = bookMotion.bookSupportPose(1, open);
    const wing = bookMotion.bookWingPose(1, open);
    const underside = support.position.clone().sub(wing.position).applyQuaternion(wing.quaternion.clone().invert());
    assert.ok(underside.y <= -0.009 && underside.y >= -0.0141, 'left palm remains below the bottom cover');
    assert.ok(underside.x > 0 && underside.x <= 0.12 + 1e-12, 'left support moves continuously toward the spine');
  }
  const left = bookMotion.bookSupportPose(1).position;
  assert.ok(left.x < 0.05 && left.z > 0.02 && left.z < 0.07, 'left palm supports inside the book footprint near the spine');
});

test('阅读降高八厘米，开合和烘焙交接端点连续，抬页低于面部', () => {
  const book = catalog.freshLibrary().books[0];
  for (const authored of [false, true]) {
    const pose = (phase, progress, direction = 1) => bookMotion.bookPose('habitat', book, { book, phase, progress, direction }, authored);
    assert.equal(pose('open', 0).position.y, 0.93);
    assert.equal(pose('reading', 0).position.y, 0.85);
    const closed = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, Math.PI, 0));
    const reading = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, Math.PI, 0));
    assert.ok(bookMotion.heldQuaternion.angleTo(closed) < 1e-7, 'preserve the baked closed tilt');
    assert.ok(pose('open', 0).quaternion.angleTo(closed) < 1e-7);
    assert.ok(pose('close', 1).quaternion.angleTo(closed) < 1e-7);
    assert.ok(pose('reading', 0).quaternion.angleTo(reading) < 1e-7);
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(reading).y > 0, 'the open front edge rises');
    for (const phase of ['open', 'close']) {
      let previous;
      for (let i = 0; i <= 120; i++) {
        const held = pose(phase, i / 120);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(held.quaternion);
        const pitch = Math.atan2(front.y, -front.z);
        assert.ok(Math.abs(pitch - THREE.MathUtils.lerp(-0.32, 0.08, held.open)) < 1e-10, 'pitch follows the same continuous cover opening');
        if (previous) assert.ok(held.quaternion.angleTo(previous) < 0.02, phase + ': continuous orientation');
        previous = held.quaternion.clone();
      }
    }
    for (const [[a, p], [b, q]] of [
      [['carry', 1], ['open', 0]], [['open', 1], ['reading', 0]],
      [['reading', 1], ['close', 0]], [['close', 1], ['return-carry', 0]],
    ]) {
      assert.ok(pose(a, p).position.distanceTo(pose(b, q).position) < 1e-12, `${a} → ${b}: position`);
      assert.ok(pose(a, p).quaternion.angleTo(pose(b, q).quaternion) < 1e-7, `${a} → ${b}: rotation`);
    }
    for (const direction of [1, -1]) {
      for (const p of [0, 1]) {
        assert.ok(pose('turn', p, direction).position.distanceTo(pose('reading', 0).position) < 1e-12);
        assert.ok(pose('turn', p, direction).quaternion.angleTo(pose('reading', 0).quaternion) < 1e-7);
      }
      for (let i = 0; i <= 180; i++) {
        const p = i / 180, held = pose('turn', p, direction);
        const curve = bookMotion.turningPageCurve(p, direction);
        for (const z of [-0.1075, 0.1075]) {
          const edge = bookMotion.turningPagePoint(curve.leafRatio, curve.bendAmp, bookMotion.BOOK_PAGE_WIDTH, z).position;
          edge.applyQuaternion(held.quaternion).add(held.position);
          assert.ok(edge.y < 1.15, `turn(${direction})@${p}: raised page remains below face height`);
        }
      }
    }
  }
});

test('双向翻页的前臂旋转有界，重复播放、倒序跳进度和四元数换号得到相同姿态', () => {
  const { rig, root } = makeRig();
  const book = catalog.freshLibrary().books[0];
  root.position.fromArray(bookMotion.authoredBookStand('habitat', book, true));
  const progress = [0, 0.12, 0.23, 0.45, 0.65, 0.8, 1];
  const expected = new Map();
  try {
    for (let cycle = 0; cycle < 4; cycle++) for (const direction of [1, -1]) {
      for (const p of cycle % 2 ? [...progress].reverse() : progress) {
        const pose = bookMotion.bookPose('habitat', book, { book, phase: 'turn', direction, progress: p }, true);
        const hand = bookMotion.turningHandPose(p, direction), arm = rig.arms[hand.side];
        const contact = hand.position.clone().applyQuaternion(pose.quaternion).add(pose.position);
        const quaternion = hand.quaternion.clone().premultiply(pose.quaternion);
        if (cycle % 2) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        const opts = { quaternion, blend: 1, tipWeight: hand.tipWeight, shoulderWeight: hand.shoulderWeight };
        armPose.reachPalm(rig, arm, contact, hand.side, opts);
        const joints = [arm.shoulder, arm.upper, arm.forearm, arm.hand];
        const key = `${direction}@${p}`;
        if (cycle === 0) expected.set(key, joints.map(joint => joint.quaternion.clone()));
        else joints.forEach((joint, i) => assert.ok(joint.quaternion.angleTo(expected.get(key)[i]) < 1e-6, `${key} cycle ${cycle}: joint ${i} depends on history`));
        const actual = arm.palmOffset.clone().lerp(arm.fingerTipOffset, hand.tipWeight)
          .applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion())).add(arm.hand.getWorldPosition(new THREE.Vector3()));
        assert.ok(actual.distanceTo(contact) < 0.002, `${key} jump contact`);
        const shared = arm.forearm.quaternion.clone();
        armPose.reachArm(rig, arm, arm.hand.getWorldPosition(new THREE.Vector3()), hand.side);
        const roll = arm.forearm.quaternion.angleTo(shared);
        assert.ok(roll <= 1.75 + 1e-6, 'forearm pronation remains bounded');
        if (p === 0.45) assert.ok(roll > 0.15, 'forearm participates instead of leaving all twist at the wrist');
      }
    }
  } finally {
    rig.dispose();
  }
});


test('Blender low curling sweep preserves paper length and mirrors the reverse sheet', () => {
  let maxTipHeight = 0;
  for (let frame = 0; frame <= 300; frame++) {
    const p = frame / 300;
    const forward = bookMotion.turningPageCurve(p, 1);
    const reverse = bookMotion.turningPageCurve(p, -1);
    let previous, length = 0;
    for (let i = 0; i <= 96; i++) {
      const radius = bookMotion.BOOK_PAGE_WIDTH * i / 96;
      const a = bookMotion.turningPagePoint(forward.leafRatio, forward.bendAmp, radius, .085);
      const b = bookMotion.turningPagePoint(reverse.leafRatio, reverse.bendAmp, radius, .085);
      assert.ok(Math.abs(a.position.x + b.position.x) < 1e-10, 'reverse curl mirrors x');
      assert.ok(Math.abs(a.position.y - b.position.y) < 1e-10, 'both directions use the same low sweep');
      if (previous) length += a.position.distanceTo(previous);
      previous = a.position;
      if (i === 96) maxTipHeight = Math.max(maxTipHeight, a.position.y);
    }
    assert.ok(Math.abs(length - bookMotion.BOOK_PAGE_WIDTH) < .004, 'sheet length does not shrink into a rigid paddle');
  }
  assert.ok(maxTipHeight < .16, 'tip stays within 16 cm of the book plane throughout the curling sweep');
});

test('actual curled skin fingertip meets the sheet, instead of a neutral shortened proxy', () => {
  const { asset, rig, root } = makeRig();
  const book = catalog.freshLibrary().books[0];
  try {
    for (const direction of [1, -1]) for (let i = Math.round(bookMotion.PAGE_CONTACT_START * 100); i <= Math.round(bookMotion.PAGE_CONTACT_END * 100); i++) {
      const p = i / 100;
      const pose = stepPose(rig, root, book, 'turn', p, direction);
      const hand = bookMotion.turningHandPose(p, direction);
      const target = hand.position.clone().applyQuaternion(pose.quaternion).add(pose.position);
      const tip = asset.getObjectByName('mixamorig' + (direction > 0 ? 'Right' : 'Left') + 'HandMiddle4');
      const actual = tip.getWorldPosition(new THREE.Vector3());
      assert.ok(actual.distanceTo(target) < .002, direction + '@' + p + ': real finger contact error ' + actual.distanceTo(target));
    }
  } finally { rig.dispose(); }
});
