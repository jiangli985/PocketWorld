import { orbitPoints } from './engine';
import type { Run, Vec, Enemy } from './engine';
import { armamentOf, STARTERS } from './arsenal';
import { INK, heroSprite, SLIME, variantSprite } from './pixel-art';
import type { Sprite } from './pixel-art';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const buffers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const hash = (x:number,y:number):number => { const a=Math.sin(x*127.1+y*311.7)*43758.5453;return a-Math.floor(a); };
function box(c:Ctx,x:number,y:number,w:number,h:number,color:string):void{c.fillStyle=color;c.fillRect(Math.round(x*2)/2,Math.round(y*2)/2,Math.max(.5,Math.round(w*2)/2),Math.max(.5,Math.round(h*2)/2));}
function disk(c:Ctx,x:number,y:number,r:number,color:string,squash=1):void{
  for(let row=-Math.ceil(r);row<=Math.ceil(r);row++){const span=Math.floor(Math.sqrt(Math.max(0,r*r-row*row)));if(span)box(c,x-span,y+row*squash,span*2+1,Math.max(1,squash),color);}
}
function sprite(c:Ctx,s:Sprite,x:number,y:number,scale=1,flip=false,white=false):void{
  c.save();c.translate(Math.round(x*2)/2,Math.round(y*2)/2);if(flip)c.scale(-1,1);
  s.rows.forEach((row,iy)=>[...row].forEach((key,ix)=>{const color=s.colors[key];if(color)box(c,ix*scale,iy*scale,scale,scale,white&&key!=='x'?'#fff1c9':color);}));c.restore();
}
function spark(c:Ctx,x:number,y:number,s:number,color:string):void{box(c,x-s,y,s*2+1,1,color);box(c,x,y-s,1,s*2+1,color);box(c,x-1,y-1,3,3,color);}
function stroke(c:Ctx,points:number[][],color:string,width=1):void{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(Math.round(x),Math.round(y)):c.moveTo(Math.round(x),Math.round(y)));c.stroke();}
function tree(c:Ctx,x:number,y:number,variant:number):void{
  disk(c,x+3,y+2,13,'#152b36',.35);box(c,x-2,y-25,5,26,'#382c43');box(c,x,y-22,2,20,'#6c5261');
  const colors=variant>.5?['#252e43','#465174','#6b6f94']:['#203c40','#32594f','#537967'];
  const layers=[{r:17,y:-25},{r:14,y:-36},{r:10,y:-45}];
  for(const l of layers){disk(c,x,y+l.y,l.r+1,INK,.65);disk(c,x,y+l.y-1,l.r,colors[0],.65);disk(c,x-3,y+l.y-3,l.r-3,colors[1],.55);}
  for(let i=0;i<10;i++){const xx=x-12+hash(i,variant)*23,yy=y-49+hash(i,4)*26;box(c,xx,yy,2,1,colors[2]);}
}
function hero(c:Ctx,r:Run,x:number,y:number,time:number,home:boolean):void{
  const scale=home?3:1.25,bob=r.moving?Math.abs(Math.sin(time*10))*2:Math.round(Math.sin(time*2));
  disk(c,x,y+1,11*scale,'#172b37',.28);
  if(r.dash>0){for(let i=1;i<4;i++){c.globalAlpha=.13*(4-i);sprite(c,heroSprite(r.profession),x-8*scale-r.dashDir.x*i*6,y-20*scale-r.dashDir.y*i*4,scale);}c.globalAlpha=1;}
  c.save();if(r.invincible>0&&!home)c.globalAlpha=.55+Math.sin(time*42)*.25;
  sprite(c,heroSprite(home?r.weapon:r.profession),x-8*scale,y-20*scale-bob,scale,false,false);
  const left=r.facing<0,armX=x+(left?-5:5)*scale,armY=y-8*scale-bob;
  c.save();c.translate(armX,armY);c.rotate(Math.round(Math.atan2(Math.sin(home?-.15:r.aim)*.72,Math.cos(home?-.15:r.aim))*8/Math.PI)*Math.PI/8);
  const w=variantSprite(r.weapon,r.variant);sprite(c,w,-4-r.recoil*14,-4,home?1.4:.8,false);
  if(r.recoil>.04&&!home)spark(c,17,0,3,'#ffe4a0');c.restore();c.restore();
  if(!home&&r.specials.witchstep&&r.witchCharge>0){box(c,x-12,y+3,24,1,'#c4d590');spark(c,x+12,y-8,2,'#e2e6b2');}
}
function enemy(c:Ctx,e:Enemy,p:Vec,time:number):void{
  const s=e.kind===3?3:e.kind===2?1.5:1,bob=Math.round(Math.sin(time*5+e.seed)*1.5);
  disk(c,p.x+1,p.y+2,8*s,'#182933',.3);
  const palettes=[['#9bc9a1','#547f77'],['#c2a3d4','#886a9e'],['#b7b1cc','#77758f'],['#edc490','#ac7f66']];
  const [light,fill]=palettes[e.kind];
  const art={rows:SLIME.rows,colors:{...SLIME.colors,H:light,G:fill}};
  sprite(c,art,p.x-8*s,p.y-10*s+bob,s,false,e.flash>0);
  if(e.kind===1){box(c,p.x-5,p.y-15+bob,3,7,INK);box(c,p.x+3,p.y-15+bob,3,7,INK);box(c,p.x-4,p.y-14+bob,1,5,light);box(c,p.x+4,p.y-14+bob,1,5,light);}
  if(e.kind===2||e.kind===3){const yy=p.y-10*s+bob;stroke(c,[[p.x-6*s,yy],[p.x-7*s,yy-6*s],[p.x,yy-2*s],[p.x+6*s,yy-6*s],[p.x+5*s,yy]],'#dbc18c',2);}
  if(e.hp<e.max){box(c,p.x-9*s,p.y+5,18*s,2,'#251f36');box(c,p.x-9*s,p.y+5,18*s*e.hp/e.max,1,'#bcaa82');}
  if((e.chill??0)>0)spark(c,p.x-7*s,p.y-12*s,2,'#99d8e8');
  if((e.burn??0)>0){box(c,p.x+7*s,p.y-11*s-Math.sin(time*10)*2,2,4,'#ec9f6a');box(c,p.x+7*s,p.y-13*s,1,3,'#f5d395');}
}
/** Logical field stays 320 × 240; HD paints actual 640 × 480 pixels with half-cell detail. */
export function render(output:Ctx,r:Run,home=false,clock=r.time,surface?:HTMLCanvasElement,detail:1|2=2):void{
  let buffer=surface??buffers.get(output.canvas);
  if(!buffer){buffer=document.createElement('canvas');buffers.set(output.canvas,buffer);}
  if(buffer.width!==320*detail||buffer.height!==240*detail){buffer.width=320*detail;buffer.height=240*detail;}
  const c=buffer.getContext('2d');if(!c)return;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,buffer.width,buffer.height);c.imageSmoothingEnabled=false;c.save();c.scale(detail,detail);
  const camera=home?{x:1000,y:1000}:r.player,cx=home?226:160,cy=home?165:135;
  const project=(p:Vec):Vec=>({x:Math.round((cx+(p.x-camera.x)*.4)*detail)/detail,y:Math.round((cy+(p.y-camera.y)*.29)*detail)/detail});
  if(!home&&r.shake)c.translate(Math.round(Math.sin(clock*49)*r.shake*.5),Math.round(Math.cos(clock*61)*r.shake*.35));
  box(c,0,0,320,240,'#293e43');
  const tx=Math.floor((camera.x-cx/.4)/80)-1,ty=Math.floor((camera.y-cy/.29)/80)-1;
  for(let j=ty;j<ty+14;j++)for(let i=tx;i<tx+13;i++){
    const p=project({x:i*80,y:j*80}),n=hash(i,j);
    box(c,p.x,p.y,33,24,(i+j)%2?'#2c4447':'#2b4146');
    for(let k=0;k<4;k++){const xx=p.x+Math.floor(hash(i+k,j)*29),yy=p.y+Math.floor(hash(i,j+k)*20);box(c,xx,yy,2,1,n>.5?'#385953':'#38515a');if(k%2===0)box(c,xx+1,yy-2,1,2,'#42675b');}
    if(n>.86){box(c,p.x+14,p.y+10,1,4,'#587566');box(c,p.x+12,p.y+8,4,2,n>.95?'#d3a7a7':'#8d86ae');box(c,p.x+14,p.y+8,1,1,'#edcf91');}
  }
  if(detail===2)for(let i=0;i<100;i++){const xx=hash(i,21)*320,yy=hash(i,33)*240;box(c,xx,yy,.5,.5,hash(i,6)>.5?'#618175':'#4b6672');}
  // Weathered violet stones, with broken edges and hand-placed highlights.
  for(let i=0;i<27;i++){
    const worldX=480+i*42,worldY=900+Math.sin(i*.26)*90;
    const p=project({x:worldX,y:worldY});if(p.x<-30||p.x>350)continue;
    box(c,p.x-1,p.y,19,11,'#222d3c');box(c,p.x,p.y-1,17,10,'#555164');box(c,p.x+2,p.y,12,1,'#727084');box(c,p.x+14,p.y+2,2,5,'#484357');
  }
  const aa=project({x:50,y:50}),bb=project({x:1950,y:1950});c.strokeStyle='#675675';c.lineWidth=3;c.strokeRect(aa.x,aa.y,bb.x-aa.x,bb.y-aa.y);
  for(const f of home?[]:r.fields){const p=project(f);c.globalAlpha=.28;disk(c,p.x,p.y,f.radius*.4,'#c27a5a',.72);c.globalAlpha=1;for(let i=0;i<5;i++)spark(c,p.x+Math.sin(clock+i)*f.radius*.25,p.y+Math.cos(clock*2+i)*f.radius*.18,1,'#e7b576');}
  for(const h of home?[]:r.hazards){const p=project(h);c.globalAlpha=h.delay>0?.6:1;c.strokeStyle='#a87db8';c.lineWidth=1;c.setLineDash([2,2]);c.beginPath();c.ellipse(p.x,p.y,h.radius*.4,h.radius*.29,0,0,TAU);c.stroke();c.setLineDash([]);spark(c,p.x,p.y,3,h.delay>0?'#b191bf':'#f6dab9');if(h.delay<=0)stroke(c,[[p.x,p.y-45],[p.x-5,p.y-24],[p.x+3,p.y-24],[p.x,p.y]],'#eee1ff',3);c.globalAlpha=1;}
  const objects:{y:number;paint:()=>void}[]=[];
  for(let i=0;i<46;i++){
    const angle=i*2.39996,radius=i<14?290+hash(i,7)*100:540+hash(i,9)*350;
    const p=project({x:1000+Math.cos(angle)*radius,y:1000+Math.sin(angle)*radius});
    if(p.x<-40||p.x>360||p.y<-20||p.y>285)continue;
    objects.push({y:p.y,paint:()=>{
      if(i%3===0)tree(c,p.x,p.y,hash(i,6));
      else if(i%3===1){box(c,p.x-5,p.y-13,11,14,INK);box(c,p.x-4,p.y-14,8,12,'#777187');box(c,p.x-3,p.y-13,6,1,'#a09baa');spark(c,p.x,p.y-7,2,'#95c7b2');box(c,p.x+4,p.y-9,3,9,'#4b485e');}
      else{box(c,p.x-1,p.y-5,3,6,'#c8baae');box(c,p.x-5,p.y-8,11,4,INK);box(c,p.x-4,p.y-9,8,3,'#9c789c');box(c,p.x-2,p.y-9,2,1,'#e7c6c0');}
    }});
  }
  if(home){
    const p={x:240,y:101};box(c,p.x-26,p.y-42,52,5,INK);box(c,p.x-26,p.y-41,6,43,'#6e637f');box(c,p.x+20,p.y-41,6,43,'#6e637f');box(c,p.x-20,p.y-42,40,6,'#81748d');box(c,p.x-19,p.y-35,38,35,'#28243c');
    for(let i=0;i<5;i++){const xx=p.x+Math.round(Math.sin(clock*.5+i)*15),yy=p.y-8-Math.round((clock*9+i*7)%25);spark(c,xx,yy,1,'#c4aecf');}
    for(let i=0;i<7;i++)spark(c,172+hash(i,5)*130,25+hash(i,9)*80,Math.sin(clock+i)>0?1:0,'#b5b490');
    objects.push({y:167,paint:()=>hero(c,r,226,165,clock,true)});
  }
  for(const g of home?[]:r.gems){const p=project(g);if(g.heart){box(c,p.x-2,p.y-3,5,3,'#cc94a6');box(c,p.x-1,p.y,3,1,'#cc94a6');}else{const yy=p.y-2+Math.round(Math.sin(clock*4+g.x));box(c,p.x-1,yy-2,3,5,'#baa16e');box(c,p.x-2,yy-1,5,3,'#ddc88e');box(c,p.x,yy-2,1,2,'#fff0bb');}}
  const enemies=home?[{id:1,x:1200,y:1100,kind:0,hp:20,max:20,radius:18,speed:0,seed:1,flash:0,hit:0,charge:4},{id:2,x:850,y:1160,kind:1,hp:20,max:20,radius:18,speed:0,seed:3,flash:0,hit:0,charge:4}]:r.enemies;
  for(const e of enemies){const p=project(e);if(p.x>-35&&p.x<355&&p.y>-30&&p.y<285)objects.push({y:p.y,paint:()=>enemy(c,e,p,clock)});}
  const player=project(r.player);if(!home)objects.push({y:player.y,paint:()=>hero(c,r,player.x,player.y,clock,false)});
  objects.sort((a,b)=>a.y-b.y).forEach(o=>o.paint());
  if(!home){
    for(const b of r.bullets){
      const w=armamentOf(b.variant??STARTERS[b.kind]);if((b.delay??0)>0&&w.mode!=='mine')continue;
      const p=project(b),q=project({x:b.x-b.vx*.035,y:b.y-b.vy*.035}),tint=b.traits?.frost?'#96d0e1':b.traits?.burn?'#e7a476':w.color;
      if(w.mode==='mine'&&!b.explosiveFollowup){
        c.strokeStyle=(b.delay??0)>0?'#6d7580':'#bacd8d';c.lineWidth=.5;c.beginPath();c.ellipse(p.x,p.y,9,5,0,0,TAU);c.stroke();
        box(c,p.x-5,p.y-5,10,5,INK);box(c,p.x-4,p.y-4,8,3,tint);spark(c,p.x,p.y-4,1,(b.delay??0)>0?'#6d7580':'#faf2b7');continue;
      }
      let lift=8;
      if(w.mode==='lob'&&b.target){const land=project(b.target);c.strokeStyle='#e4bc85';c.lineWidth=.5;c.setLineDash([2,2]);c.beginPath();c.ellipse(land.x,land.y,w.radius*.4,w.radius*.29,0,0,TAU);c.stroke();c.setLineDash([]);spark(c,land.x,land.y,4,'#d7b175');lift+=Math.sin(Math.PI*(1-b.life/(b.duration??w.life)))*45;}
      stroke(c,[[q.x,q.y-lift],[p.x,p.y-lift]],tint,w.id==='prism'?2.5:w.id==='rail'?1.5:1);
      if(w.id==='prism'||w.id==='rail'){stroke(c,[[q.x,q.y-lift],[p.x,p.y-lift]],'#fff3d9',.5);spark(c,p.x,p.y-lift,2,tint);}
      else if(b.kind==='rocket'){box(c,p.x-4,p.y-lift-2,8,4,tint);box(c,p.x-3,p.y-lift-2,2,4,'#e6bd8f');spark(c,q.x,q.y-lift,b.secondary?1:2,'#dca86a');}
      else if(w.id==='moon'){disk(c,p.x,p.y-lift,4,'#eee1a9');disk(c,p.x+2,p.y-lift-1,3,'#293e43');}
      else if(w.id==='frostfan'){stroke(c,[[p.x,p.y-lift-4],[p.x+2,p.y-lift],[p.x,p.y-lift+4],[p.x-2,p.y-lift],[p.x,p.y-lift-4]],tint,.5);}
      else if(b.kind==='broom'){c.save();c.translate(p.x,p.y-lift);c.rotate(clock*15);stroke(c,[[-4,-4],[4,0],[-4,4]],'#d7dcaa',2);c.restore();}
      else spark(c,p.x,p.y-lift,b.kind==='wand'?3:1,tint);
    }
    for(const b of r.blasts){const p=project(b),progress=1-b.life/b.max,rr=b.radius*.4*(.35+progress*.65);c.globalAlpha=1-progress;c.strokeStyle=b.color;c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y-6,rr,rr*.72,0,0,TAU);c.stroke();for(let i=0;i<8;i++)spark(c,p.x+Math.cos(i*TAU/8)*rr,p.y-6+Math.sin(i*TAU/8)*rr*.72,2,b.color);c.globalAlpha=1;}
    if(r.sweep>0){const arm=armamentOf(r.variant),radius=(arm.reach+r.upgrades.spread*12)*.4,span=arm.id==='lance'?.4:1.5;for(let i=0;i<13;i++){const a=r.aim-span+i*span/6;box(c,player.x+Math.cos(a)*radius,player.y-7+Math.sin(a)*radius*.72,3,2,'#e4dfb1');}}
    if(r.pulseRing>0){const rr=(1-r.pulseRing/.6)*60;c.strokeStyle='#b8ccdc';c.beginPath();c.ellipse(player.x,player.y-6,rr,rr*.72,0,0,TAU);c.stroke();}
    for(const o of orbitPoints(r)){const p=project(o);spark(c,p.x,p.y-8,3,'#d8c493');}
    for(const a of r.arcs){const p=project(a.from),q=project(a.to);stroke(c,[[p.x,p.y-7],[(p.x+q.x)/2+3,(p.y+q.y)/2-11],[(p.x+q.x)/2-2,(p.y+q.y)/2-4],[q.x,q.y-7]],'#ead59c',2);}
    for(const p of r.particles){const point=project(p);c.globalAlpha=p.life/p.max;box(c,point.x,point.y-6,Math.max(1,p.size*.5),Math.max(1,p.size*.5),p.color);}c.globalAlpha=1;
    c.textAlign='center';c.font='bold 6px monospace';
    for(const t of r.texts){const p=project(t);c.globalAlpha=Math.min(1,t.life*3);c.fillStyle=INK;c.fillText(t.label,p.x+1,p.y-8);c.fillStyle=t.color;c.fillText(t.label,p.x,p.y-9);}c.globalAlpha=1;
    if(r.combo>=3&&r.comboTime>0){c.textAlign='right';c.font='bold 10px monospace';c.fillStyle='#ebcf95';c.fillText(`${r.combo} CHAIN`,302,59);}
    if(r.damageFlash>0){c.globalAlpha=r.damageFlash*1.5;box(c,0,0,320,3,'#ed8b99');box(c,0,237,320,3,'#ed8b99');box(c,0,0,3,240,'#ed8b99');box(c,317,0,3,240,'#ed8b99');c.globalAlpha=1;}
  }
  c.restore();output.save();output.setTransform(1,0,0,1,0,0);output.imageSmoothingEnabled=false;output.clearRect(0,0,output.canvas.width,output.canvas.height);output.drawImage(buffer,0,0,output.canvas.width,output.canvas.height);output.restore();
}
