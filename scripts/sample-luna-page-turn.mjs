import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
// Export actual web-rig matrices for Blender's editable review actions.
const root = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw Error('Usage: node scripts/sample-luna-page-turn.mjs --output <outside-repo.json>');
const req=createRequire(root+'package.json'),THREE=await import(pathToFileURL(root+'node_modules/three/build/three.module.js')),ts=req('typescript');
const {load}=await import(pathToFileURL(root+'src/scene/orbital/load-for-validation.mjs'));
const cache=new Map();
function loadTS(path){if(cache.has(path))return cache.get(path);const output=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod={exports:{}};vm.runInNewContext(output,{exports:mod.exports,require:id=>{if(id==='three')return THREE;if(id.startsWith('.'))return loadTS(fileURLToPath(new URL(id+'.ts',pathToFileURL(path))));throw Error('Unexpected '+id);}});cache.set(path,mod.exports);return mod.exports;}
const dir=root+'src/scene/orbital/';
const b=loadTS(dir+'library/bookMotion.ts'),r=loadTS(dir+'library/residentPose.ts'),c=loadTS(dir+'library/catalog.ts'),rigMod=loadTS(dir+'residentRig.ts');
const {gltf}=await load(pathToFileURL(root+'assets/public/models/resident/luna-walk-room.glb'));
gltf.scene.updateMatrixWorld(true);
const bind={};gltf.scene.traverse(o=>{if(o.isBone)bind[o.name]=o.matrixWorld.toArray()});
const rig=rigMod.createResidentRig(gltf.scene,gltf.animations[0]);
const actor=new THREE.Group();actor.add(rig.mesh);actor.rotation.y=Math.PI;
const book=c.freshLibrary().books[0];actor.position.fromArray(b.authoredBookStand('habitat',book,true));actor.updateMatrixWorld(true);
const centered=new THREE.Matrix4().makeTranslation(-actor.position.x,0,-actor.position.z);
const actions={};
for(const [name,direction] of [['forward',1],['reverse',-1]]){
 for(let n=0;n<80;n++){r.applyLibraryPose(rig,actor,'habitat',{book,phase:'reading',progress:0,direction},.03,true);rig.applyPose(0,0);}
 const frames=[];
 for(let frame=0;frame<=100;frame++){
 const flow={book,phase:'turn',progress:frame/100,direction};r.applyLibraryPose(rig,actor,'habitat',flow,.03,true);rig.applyPose(0,0);actor.updateMatrixWorld(true);
 const bones={};gltf.scene.traverse(o=>{if(o.isBone)bones[o.name]=o.matrixWorld.clone().premultiply(centered).toArray()});
 const pose=b.bookPose('habitat',book,flow,true),bookMatrix=new THREE.Matrix4().compose(pose.position,pose.quaternion,new THREE.Vector3(1,1,1));
 const curve=b.turningPageCurve(flow.progress,direction),page=[];
 for(const z of [-.1075,.1075])for(let i=0;i<=18;i++){page.push(b.turningPagePoint(curve.leafRatio,curve.bendAmp,b.BOOK_PAGE_WIDTH*i/18,z).position.applyMatrix4(bookMatrix).applyMatrix4(centered).toArray())}
 frames.push({bones,book:bookMatrix.premultiply(centered).toArray(),page});
 }
 actions[name]=frames;
}
const wings=[0,1].map(side=>{const w=b.bookWingPose(side);return {quaternion:w.quaternion.toArray(),thickness:w.thickness}});
fs.writeFileSync(process.argv[outputIndex + 1],JSON.stringify({bind,actions,wings}));
console.log('Exported exact runtime skin matrices and sheet vertices: 2 actions, 101 frames each.');
rig.dispose();
