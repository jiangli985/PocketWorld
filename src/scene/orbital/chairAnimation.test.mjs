import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { load } from './load-for-validation.mjs';
const modules={};
function local(name){
 if(modules[name])return modules[name];
 const scope={exports:{},require:n=>n==='three'?THREE:local(n)};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL(name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
 return modules[name]=scope.exports;
}
const {createResidentRig}=local('./residentRig');
const {createChairAnimation,readSeatContactCache}=local('./chairAnimation');
const {CHAIR_FPS,CHAIR_SIT_FRAMES,CHAIR_SIT_SECONDS}=local('./chairMotion');
const data=readFileSync(new URL('../../../assets/public/models/resident/luna-seat-contact.bin',import.meta.url));
const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),cache=readSeatContactCache(buffer);
const {gltf}=await load(new URL('../../../assets/public/models/resident/luna-walk-room.glb',import.meta.url));
function instance(){
 const asset=clone(gltf.scene),rig=createResidentRig(asset,gltf.animations.find(c=>c.name==='Walk_Grounded_Loop'));
 const chair=createChairAnimation(asset,gltf.animations.find(c=>c.name==='ChairSit_Contact'),cache);
 const root=new THREE.Group();root.add(rig.mesh);root.position.z=.54;
 const sample=(t,w=1)=>{rig.applyPose(0,0);chair.apply(t,w);root.updateMatrixWorld(true);asset.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});};
 return {asset,rig,chair,root,sample,dispose:()=>{chair.dispose();rig.dispose();}};
}
test('the shipped contact cache validates its header, dimensions and vertex mapping',()=>{
 assert.equal(cache.frames,CHAIR_SIT_FRAMES);assert(cache.count<5000);
 const clip=gltf.animations.find(c=>c.name==='ChairSit_Contact');
 assert(Math.abs(clip.duration-CHAIR_SIT_SECONDS)<1e-6);
 for(const track of clip.tracks)assert.equal(track.times[0],0,'Blender frame 1 and cache frame 0 must share the same time origin');
 assert.throws(()=>readSeatContactCache(new ArrayBuffer(8)));
 assert.throws(()=>readSeatContactCache(buffer.slice(0,-2)));
 const x=instance();x.dispose();
});
test('seat deformation is instance-local and releases the original geometry and authored normals',()=>{
 const a=instance(),b=instance();
 const ma=a.asset.getObjectByProperty('isSkinnedMesh',true),mb=b.asset.getObjectByProperty('isSkinnedMesh',true);
 const rest=new Float32Array(ma.geometry.attributes.position.array),normals=new Float32Array(ma.geometry.attributes.normal.array);
 a.sample(CHAIR_SIT_SECONDS);
 assert.notDeepEqual(ma.geometry.attributes.position.array,rest);
 assert.deepEqual(mb.geometry.attributes.position.array,rest);
 assert.deepEqual(ma.geometry.attributes.normal.array,normals);
 a.sample(0,0);assert.deepEqual(ma.geometry.attributes.position.array,rest);
 a.rig.applyPose(.49,1);a.root.updateMatrixWorld(true);
 assert(a.asset.getObjectByName('mixamorigHips').position.length()<1);
 a.dispose();b.dispose();
});
test('authored sitting preserves limb lengths and finite skinning',()=>{
 const a=instance(),position=o=>o.getWorldPosition(new THREE.Vector3());
 const lengths=[];
 for(const time of [0,.5,1,1.5,(53 - 1) / CHAIR_FPS,2.45,CHAIR_SIT_SECONDS]) {
  a.sample(time);
  const values=[];
  for(const side of ['Left','Right']) {
   const chain=['UpLeg','Leg','Foot'].map(n=>a.asset.getObjectByName('mixamorig'+side+n));
   values.push(position(chain[0]).distanceTo(position(chain[1])),position(chain[1]).distanceTo(position(chain[2])));
  }
  if(!lengths.length)lengths.push(...values);
  values.forEach((v,i)=>assert(Math.abs(v-lengths[i])<1e-5,`bone ${i}: ${v} vs ${lengths[i]}`));
  const mesh=a.asset.getObjectByProperty('isSkinnedMesh',true),v=new THREE.Vector3();
  for(let i=0;i<mesh.geometry.attributes.position.count;i+=61){mesh.getVertexPosition(i,v);assert(v.toArray().every(Number.isFinite));}
 }
 a.dispose();
});

test('the baked seat transfers weight from planted feet to fixed armrests and settles farther back',()=>{
 const a=instance();
 const atFrame=frame=>{
  a.sample((frame-1)/CHAIR_FPS);
  const p=name=>a.asset.getObjectByName('mixamorig'+name).getWorldPosition(new THREE.Vector3());
  return {hips:p('Hips'),head:p('Head'),ankles:[p('LeftFoot'),p('RightFoot')],wrists:[p('LeftHand'),p('RightHand')]};
 };
 const edge=atFrame(53),braced=atFrame(66),pressed=atFrame(73),landed=atFrame(82),deep=atFrame(98);
 assert(Math.abs(edge.hips.z-deep.hips.z-.16)<.002);
 assert(deep.hips.z>.12&&deep.hips.z<.14);
 assert(pressed.hips.y>edge.hips.y+.023);
 assert(deep.hips.y<pressed.hips.y-.024);
 assert(braced.head.z-braced.hips.z>.085);
 assert(deep.head.z-deep.hips.z<.025);
 assert(pressed.hips.z-landed.hips.z>.08);
 for(let side=0;side<2;side++){
  assert(Math.abs(edge.ankles[side].y-.076)<.003);
  assert(pressed.wrists[side].distanceTo(landed.wrists[side])<.002,'hands support the moving pelvis');
  assert(landed.wrists[side].distanceTo(deep.wrists[side])>.18,'hands leave the armrests after landing');
  assert(deep.ankles[side].y>edge.ankles[side].y+.18);
 }
 a.dispose();
});

test('the raised front skirt covers both thighs during the scoot and deep seated hold', () => {
 const a = instance();
 const mesh = a.asset.getObjectByProperty('isSkinnedMesh', true);
 const { skinIndex, skinWeight } = mesh.geometry.attributes;
 const down = new THREE.Vector3(0, -1, 0);
 const ray = new THREE.Raycaster();
 function strongestBone(vertex) {
  let strongest = 0;
  for (let slot = 1; slot < 4; slot++) {
   if (skinWeight.getComponent(vertex, slot) > skinWeight.getComponent(vertex, strongest)) strongest = slot;
  }
  return mesh.skeleton.bones[skinIndex.getComponent(vertex, strongest)].name;
 }
 for (const frame of [78, 86, 98]) {
  a.sample((frame - 1) / CHAIR_FPS);
  mesh.computeBoundingSphere();
  const hips = a.asset.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3());
  for (const x of [-.10, .10]) for (const depth of [.22, .25]) {
   ray.set(new THREE.Vector3(x, 2, hips.z + depth), down);
   const hits = [];
   // The room disables pointer hits on Luna. Use the deforming mesh's original raycast.
   THREE.SkinnedMesh.prototype.raycast.call(mesh, ray, hits);
   hits.sort((a, b) => a.distance - b.distance);
   const cloth = hits.find(hit => strongestBone(hit.face.a).startsWith('Dress_Front'));
   const thigh = hits.find(hit => strongestBone(hit.face.a).endsWith('UpLeg'));
   assert(cloth && thigh, `skirt and thigh at frame ${frame}, x ${x}, depth ${depth}`);
   assert(cloth.point.y > thigh.point.y + .005, `exposed thigh at frame ${frame}, x ${x}, depth ${depth}`);
  }
 }
 a.dispose();
});

test('palms face the armrests with aligned forearms and little axial wrist twist during sit and exit', () => {
  const actor = instance();
  const chains = ['Left', 'Right'].map(side => {
    const joint = name => actor.asset.getObjectByName(`mixamorig${side}${name}`);
    const wrist = joint('Hand');
    const mesh = actor.asset.getObjectByProperty('isSkinnedMesh', true);
    const index = mesh.skeleton.bones.indexOf(wrist);
    const parent = mesh.skeleton.bones.indexOf(wrist.parent);
    const bind = mesh.skeleton.boneInverses[parent].clone().multiply(mesh.skeleton.boneInverses[index].clone().invert());
    const bindRotation = new THREE.Quaternion().setFromRotationMatrix(bind.extractRotation(bind));
    const middle = joint('HandMiddle1');
    return { side, wrist, middle, index: joint('HandIndex1'), pinky: joint('HandPinky1'),
      bindRotation, palmAxis: middle.position.clone().normalize() };
  });
  const position = bone => bone.getWorldPosition(new THREE.Vector3());
  try {
    for (const reverse of [false, true]) for (let step = 0; step <= 2 * (89 - 55); step++) {
      const frame = reverse ? 89 - step / 2 : 55 + step / 2;
      actor.sample((frame - 1) / CHAIR_FPS);
      for (const { side, wrist, middle, index, pinky, bindRotation, palmAxis } of chains) {
        const label = `${side} at Blender frame ${frame} (${reverse ? 'exit' : 'sit'})`;
        const forearm = position(wrist).sub(position(wrist.parent)).normalize();
        const palm = position(middle).sub(position(wrist)).normalize();
        assert(THREE.MathUtils.radToDeg(forearm.angleTo(palm)) < 58, `bent wrist: ${label}`);
        const relative = bindRotation.clone().invert().multiply(wrist.quaternion).normalize();
        const axial = new THREE.Vector3(relative.x, relative.y, relative.z).dot(palmAxis);
        const twist = 2 * Math.atan2(Math.abs(axial), Math.abs(relative.w));
        assert(THREE.MathUtils.radToDeg(twist) < 12, `twisted wrist: ${label}`);
        if (frame >= 65 && frame <= 82) {
          const across = position(index).sub(position(pinky));
          const inwardNormal = palm.clone().cross(across).normalize().multiplyScalar(side === 'Left' ? 1 : -1);
          assert(inwardNormal.y < -.97, `palm should face the rail: ${label}`);
        }
      }
    }
  } finally {
    actor.dispose();
  }
});


test('雪花裙装使用自己的接触索引，坐起只变形接触网格，站姿两只袜脚着地', async () => {
  const root = new URL('../../../assets/public/models/resident/', import.meta.url);
  const { gltf } = await load(new URL('luna-snowflower.glb', root));
  const data = readFileSync(new URL('luna-snowflower-seat.bin', root));
  const contact = readSeatContactCache(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const asset = clone(gltf.scene);
  const clip = name => gltf.animations.find(value => value.name === name);
  const rig = createResidentRig(asset, clip('Walk_Grounded_Loop'), true);
  const surfaces = [];
  asset.traverse(node => { if (node.isSkinnedMesh) surfaces.push(node); });
  const sock = surfaces.find(node => node.material.name === 'Snowflower | socks');
  const face = surfaces.find(node => node.material.name === 'Luna | Snowflower Face');
  const faceGeometry = face.geometry;
  const body = surfaces.find(node => node.geometry.getAttribute('_contact_id').array.some(v => v >= 0));
  const rest = body.geometry.getAttribute('position').array;
  const mapped = new Set(body.geometry.getAttribute('_contact_id').array);
  mapped.delete(-1);
  assert.equal(mapped.size, contact.count);
  assert.equal(Math.max(...mapped), contact.count - 1);
  const seat = createChairAnimation(asset, clip('ChairSit_Contact'), contact);
  try {
    rig.applyPose(0, 0);
    rig.mesh.updateMatrixWorld(true);
    const sole = [Infinity, Infinity], point = new THREE.Vector3();
    for (let i = 0; i < sock.geometry.getAttribute('position').count; i++) {
      sock.localToWorld(sock.getVertexPosition(i, point));
      const side = point.x < 0 ? 0 : 1;
      sole[side] = Math.min(sole[side], point.y);
    }
    sole.forEach(height => assert.ok(Math.abs(height) < .003, '袜底站姿离地 ' + height));
    seat.apply(97 / 30, 1);
    const posed = body.geometry.getAttribute('position').array;
    assert.ok(posed.some((v, i) => Math.abs(v - rest[i]) > .002));
    assert.equal(face.geometry, faceGeometry);
    seat.apply(0, 0);
    assert.deepEqual(posed, rest);
  } finally { seat.dispose(); rig.dispose(); }
});
