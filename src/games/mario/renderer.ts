import type { FishId, RodLevel } from './catalog.ts';
import { drawFish, FISH_SPRITE_HEIGHT, FISH_SPRITE_WIDTH } from './fishArt.ts';
import { ROD_ART } from './rodArt.ts';
import { paintDockSigns } from './dockSigns.ts';

export const BAY_WIDTH = 800;
export const BAY_HEIGHT = 600;
export const CATCH_EFFECT_MS = 1500;
export const LAND_HOLD_MS = 240;
export const IMPULSE_MS = 520;
export type FishingImpulse = 'tap' | 'splash' | 'nibble' | 'bite' | 'strike' | 'reel' | 'slip' | 'locked' | 'escape';
export interface FishingScene {
  readonly timeMs: number;
  readonly rodLevel?: RodLevel;
  readonly phase: 'idle' | 'waiting' | 'bite' | 'fight' | 'full';
  readonly progress?: number;
  readonly castAgeMs?: number;
  readonly reducedMotion?: boolean;
  readonly reelingFish?: FishId;
  readonly impulse?: Readonly<{ kind: FishingImpulse; ageMs: number; id: number }>;
  readonly catchEffect?: Readonly<{ fishId: FishId; ageMs: number }>;
  readonly crossing?: Readonly<{ destination: 'dock' | 'boat'; progress: number }>;
}

type Ctx = CanvasRenderingContext2D;
const atlases = new WeakMap<HTMLCanvasElement, HTMLImageElement>();
type DockImage = HTMLImageElement | HTMLCanvasElement;
const dockImages = new WeakMap<HTMLCanvasElement, DockImage>();
export function setFishingAtlas(canvas: HTMLCanvasElement, atlas: HTMLImageElement) { atlases.set(canvas, atlas); }
export function setDockImage(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const street = canvas.ownerDocument.createElement('canvas');
  street.width = image.naturalWidth;
  street.height = image.naturalHeight;
  const context = street.getContext('2d');
  if (!context) {
    dockImages.set(canvas, image);
    return;
  }
  context.drawImage(image, 0, 0);
  paintDockSigns(context);
  dockImages.set(canvas, street);
}
const paths = new Map<string, Path2D>();
const rnd = (n: number) => ((n * 811 + 17) % 997 * 613 % 997) / 997;
function rect(c: Ctx, color: string, x: number, y: number, w: number, h: number) { c.fillStyle = color; c.fillRect(x,y,w,h); }
function poly(c: Ctx, color: string, d: string) {
  let p = paths.get(d);
  if (!p) paths.set(d, p = new Path2D(d));
  c.fillStyle = color; c.fill(p);
}

const fx = 172, fy = 132;
function swell(c: Ctx,x:number,y:number,r:number,alpha:number) {
  const old=c.globalAlpha;
  c.globalAlpha=alpha;
  c.strokeStyle='#c9e7f2';c.lineWidth=.45;c.beginPath();c.ellipse(x,y,r,Math.max(1,r*.28),0,0,Math.PI*2);c.stroke();
  c.globalAlpha=old;
}
function stars(c:Ctx,x:number,y:number,time:number,splash:boolean) {
  for(let i=0;i<7;i++){
    const dx=(rnd(i+5)-.5)*(splash?24:19)*time;
    const dy=splash?-rnd(i+15)*10*Math.sin(Math.PI*time):-rnd(i+12)*12*time;
    const px=Math.round(x+dx),py=Math.round(y+dy);
    rect(c,i%2?'#fff4ba':'#dcfff1',px,py,i%3?1:2,1);
  }
}
const unit = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const p = unit(value);
  return p * p * (3 - 2 * p);
};
const RELEASE_MS = 270;
const FLIGHT_MS = 380;
export const CAST_LAND_MS = RELEASE_MS + FLIGHT_MS;

const ANGLER_X = 128;
const DECK_Y = 107;

function angler(c: Ctx, bob: number, lean: number, handX: number, handY: number) {
  const x = ANGLER_X + Math.round(lean * .6);
  const feet = DECK_Y + bob;
  const head = feet - 11 - Math.round(lean / 3);
  const outline = '#212739';
  const skin = '#ffd0a5';
  const linen = '#f3e4cf';
  for (const bootX of [ANGLER_X - 2.5, ANGLER_X + 1]) {
    rect(c, skin, bootX + .5, feet - 4, 1.5, 2);
    rect(c, outline, bootX, feet - 2.5, 2.5, 2.5);
    rect(c, linen, bootX + .5, feet - 2.5, 1.5, .5);
    rect(c, '#8a624d', bootX + .5, feet - 1.5, 2, 1);
  }
  rect(c, outline, x - 3.5, feet - 7, 7, 3.5);
  rect(c, '#526b8d', x - 2.5, feet - 7, 5, 2.5);
  rect(c, '#425675', x + .5, feet - 7, 1, 2.5);
  rect(c, '#7da0ad', x - 2, feet - 4.5, 4.5, .5);
  rect(c, outline, x - 3.5, head + 4, 7, 3.5);
  rect(c, linen, x - 3, head + 4.5, 5.5, 2.5);
  rect(c, '#6a919d', x - .5, head + 4.5, 2, .75);
  rect(c, '#506985', x, head + 5.25, 1, 1.5);
  // Satchel and strap follow the shifting torso, while the boots stay fixed to the deck.
  rect(c, '#92715f', x - 2, head + 5, .5, 2);
  rect(c, '#65453e', x - 4.5, feet - 7, 2.5, 3);
  rect(c, '#af8061', x - 4, feet - 6.75, 1.5, 2);
  rect(c, '#e8b67a', x - 3.5, feet - 6.5, .5, .5);

  rect(c, outline, x - 4.5, head - 1.5, 9, 4.5);
  rect(c, outline, x - 3, head - 3, 6.5, 1.5);
  rect(c, outline, x - 4, head + 2.5, 3.5, 1.5);
  rect(c, '#3c4f6e', x - 3.5, head - 2, 7.5, 4.5);
  rect(c, '#3c4f6e', x - 3.5, head + 2, 2, 1.5);
  rect(c, '#7087a2', x - 2.5, head - 2.5, 4.5, 1);
  rect(c, '#8298af', x + 1.5, head - 1.5, 2, .5);
  rect(c, '#607894', x + 2, head - 1, 1, 1.5);
  rect(c, skin, x - .5, head + .5, 4, 3.5);
  rect(c, skin, x + 1, head + 3.5, 1.5, 1);
  rect(c, '#3c4f6e', x - 1, head, 2.5, 1.5);
  rect(c, outline, x + 2.5, head + 1.5, .5, 1);
  rect(c, '#df977f', x + 3, head + 2.5, .5, .5);
  rect(c, '#fff0ba', x - 3.5, head - .5, 2.5, .5);
  rect(c, '#fff0ba', x - 2.5, head - 1.5, .5, 2.5);

  const shoulder = head + 5.5;
  c.beginPath();
  c.moveTo(x + 1, shoulder);
  c.lineTo((x + 1 + handX) / 2, (shoulder + handY) / 2 + 1);
  c.lineTo(handX, handY);
  c.strokeStyle = outline;
  c.lineWidth = 2.1;
  c.stroke();
  c.strokeStyle = linen;
  c.lineWidth = 1.35;
  c.stroke();
  rect(c, '#668299', Math.round(handX) - .5, Math.round(handY) - .5, 1.5, 1.5);
  rect(c, skin, Math.round(handX), Math.round(handY), 1, 1);
}

const impulseStrength: Record<FishingImpulse, number> = {
  tap: -.32, splash: 0, nibble: .08, bite: .67, strike: .95, reel: -.55, slip: -.32, locked: -.68, escape: -.6,
};

function fishingMotion(c: Ctx, f: FishingScene, bob: number) {
  const still = f.reducedMotion;
  const fight = f.phase === 'fight', bite = fight || f.phase === 'bite';
  const waiting = f.phase === 'waiting';
  const t = still ? 0 : f.timeMs / 1000;
  const age = still || !waiting ? Infinity : f.castAgeMs ?? Infinity;
  const airborne = age < CAST_LAND_MS;
  const charge = ease(age / 170);
  const swing = ease((age - 170) / 100);
  const settle = ease((age - RELEASE_MS) / 420);
  const hauling = f.reelingFish !== undefined;
  const haulProgress = still ? .55 : unit(f.progress ?? 0);
  const lift = hauling ? ease((haulProgress - .35) / .65) : 0;
  const pulse = f.impulse && !still ? (1 - unit(f.impulse.ageMs / 235)) ** 2 : 0;
  const tug = f.impulse ? impulseStrength[f.impulse.kind] * pulse : 0;
  const resistance = still ? 0 : Math.sin((f.progress ?? 0) * 6 * Math.PI) * (.07 - .05 * lift);
  const pull = hauling ? .58 - .42 * lift + resistance
    : bite ? (fight ? 1 : .48) * (still ? 1 : .86 + .14 * Math.sin(t * 21)) : 0;
  const lean = -3 * charge + 7 * swing - 4 * settle - 3 * pull - 3 * lift - 7 * tug;
  const angle = -.8 - 1.47 * charge + 2.05 * swing - .58 * settle - .95 * lift + .38 * tug;
  const handX = ANGLER_X + 5 + .6 * lean;
  const handY = DECK_Y + bob - 6 + .6 * (-5 * charge + 4 * swing + settle - 4 * lift);
  const rod = ROD_ART[f.rodLevel ?? 1];
  const tipX = handX + rod.length * Math.cos(angle), tipY = handY + rod.length * Math.sin(angle) + 18 * pull + 6 * tug;
  angler(c, bob, lean, handX, handY);

  c.strokeStyle = rod.shaft;
  c.lineWidth = rod.width;
  c.beginPath();
  c.moveTo(handX, handY);
  c.quadraticCurveTo(handX + (rod.length - 9) * Math.cos(angle), handY + (rod.length - 7) * Math.sin(angle) - rod.bend * pull, tipX, tipY);
  c.stroke();
  if (rod.reel) {
    rect(c, rod.grip, Math.round(handX) + 1, Math.round(handY), 3, 3);
    rect(c, rod.metal, Math.round(handX) + 2, Math.round(handY) + 1, 2, 2);
    rect(c, rod.metal, Math.round(tipX), Math.round(tipY), 1, 1);
  }
  if (!waiting && !bite && !hauling) return;

  let x = fx + Math.sin(t * 2) * 1.3, y = fy + Math.sin(t * 4) * .55 + 3 * pull;
  let slack = Math.max(0, 1 - pull - tug) * (bite ? 1.3 : 5);
  if (f.impulse?.kind === 'nibble') y += Math.sin(pulse * 2 * Math.PI) * 2.1;
  if (f.impulse?.kind === 'strike') y += 6 * pulse;
  if (hauling) {
    [x, y] = reelPosition(haulProgress, bob);
    if (haulProgress < .52) swell(c, x, fy + 1, 4 + haulProgress * 10, .58 - haulProgress * .65);
    y -= 3;
    slack = 0;
  } else if (age < RELEASE_MS) {
    x = tipX + 2 * Math.sin(angle);
    y = tipY + 5;
    slack = 2;
  } else if (airborne) {
    const flight = (age - RELEASE_MS) / FLIGHT_MS;
    // Start at the end of the forward flick before the float leaves the tip.
    const releaseX = 156.4 + (rod.length - 22) * Math.cos(-.22);
    const releaseY = 100.6 + (rod.length - 22) * Math.sin(-.22);
    x = releaseX + (fx - releaseX) * flight;
    y = releaseY + bob * (1 - flight) + (fy - releaseY) * flight - 90 * flight * (1 - flight);
    slack = 3 + flight * 8;
  } else {
    const entry = 1 - unit((age - CAST_LAND_MS) / 440);
    y += 5 * entry * Math.sin((1 - entry) * Math.PI * 3);
    const ripple = still ? .4 : t % 1;
    swell(c, x, fy + 1, 3 + ripple * 5, .7 - ripple * .46);
    if (entry > 0 || bite) {
      swell(c, x, fy + 1, 4 + (1 - entry) * 10, bite ? .72 : entry);
      if (!still) stars(c, x, fy, bite ? .2 + pull * .5 : 1 - entry, true);
    }
  }

  const floatTop = Math.round(y) - 3;
  const lineY = hauling ? y : airborne ? floatTop : Math.min(floatTop, fy + 1);
  c.strokeStyle = tug > .2 ? '#fff3c6' : '#dfebfa';
  c.lineWidth = tug > .2 ? .9 : .55;
  c.beginPath();
  c.moveTo(tipX, tipY);
  c.quadraticCurveTo((tipX + x) / 2, (tipY + lineY) / 2 + slack, x, lineY);
  c.stroke();
  const shown = hauling ? 0 : airborne ? 5 : Math.min(5, fy + 1 - floatTop);
  if (shown > 0) {
    rect(c, '#493e58', Math.round(x) - 2, floatTop, 4, shown);
    rect(c, '#ff8d69', Math.round(x) - 1, floatTop, 2, Math.min(4, shown));
    rect(c, '#fff4cc', Math.round(x), floatTop, 1, 1);
  }
  rect(c, '#202942dd', 61, 73 + bob, 27, 3);
  rect(c, hauling ? '#ffd097' : bite ? '#ef796a' : '#79c897', 62, 74 + bob, 25 * (hauling ? f.progress ?? 0 : bite ? 1 : f.progress ?? 0), 1);
}

function reelPosition(progress: number, bob: number): [number, number] {
  const rise = ease((progress - .35) / .65);
  const x = fx + (113 - fx) * ease(progress);
  const y = fy + (103 + bob - fy) * rise - 124 * rise * (1 - rise) + 3 * Math.sin(Math.PI * progress);
  return [x, y];
}

function drawReelingFish(c: Ctx, f: FishingScene, bob: number) {
  const landed = f.catchEffect;
  const p = f.reducedMotion ? .55 : unit(f.progress ?? 0);
  if (f.reelingFish) {
    const [x, y] = reelPosition(p, bob);
    if (!f.reducedMotion && p > .35 && p < .67) {
      const breakSurface = unit((p - .35) / .32);
      spray(c, x + 4, fy, breakSurface, 1.25);
    }
    const flip = f.reducedMotion ? 0 : -.65 * (1 - p) + .18 * Math.sin(p * 7 * Math.PI);
    drawCatchSprite(c, f.reelingFish, x, y, ease((p - .23) / .25), flip);
  } else if (landed && landed.ageMs >= 0 && landed.ageMs < CATCH_EFFECT_MS) {
    const [x, y] = reelPosition(1, bob);
    if (f.reducedMotion) {
      drawCatchSprite(c, landed.fishId, x, y, 1, 0);
    } else {
      const kick = unit(landed.ageMs / 440);
      if (kick < 1) spray(c, x, y, kick, 1.3, '#ffe2a6');
      const launch = ease(landed.ageMs / 340);
      drawCatchSprite(c, landed.fishId, x, y - 8 * launch,
        unit((CATCH_EFFECT_MS - landed.ageMs) / 250) * (1 - .8 * launch), .32 * launch, .38 + .39 * launch);
    }
  }
}

function spray(c: Ctx, x: number, y: number, progress: number, strength: number, highlight = '#e5fbf6') {
  c.save();
  c.globalAlpha = (1 - progress) * .95;
  for (let i = 0; i < 14; i++) {
    const speed = (.35 + rnd(70 + i) * .65) * strength;
    const dx = (rnd(91 + i) - .5) * 64 * progress * speed;
    const dy = -Math.sin(progress * Math.PI) * (7 + 21 * rnd(111 + i)) * speed;
    rect(c, i % 3 ? highlight : '#83c6d9', Math.round(x + dx), Math.round(y + dy), i % 4 ? 1 : 2, i % 3 ? 2 : 1);
  }
  c.restore();
}

function drawImpulse(c: Ctx, f: FishingScene) {
  if (!f.impulse || f.impulse.ageMs >= IMPULSE_MS) return;
  const { kind, ageMs } = f.impulse;
  const progress = f.reducedMotion ? .28 : unit(ageMs / IMPULSE_MS);
  const strike = kind === 'strike' || kind === 'bite';
  const success = kind === 'reel' || kind === 'locked';
  const failure = kind === 'slip' || kind === 'escape';
  const radius = strike ? 24 : success ? 18 : kind === 'nibble' ? 9 : 14;
  swell(c, fx, fy + 1, 4 + progress * radius, .95 * (1 - progress));
  if (strike || success) swell(c, fx, fy + 1, 2 + progress * radius * .7, .8 * (1 - progress));
  if (!f.reducedMotion && kind !== 'tap' && kind !== 'nibble') {
    spray(c, fx, fy, progress, strike ? 1.6 : .88, success ? '#f4dca3' : undefined);
  }
  if (!strike && !success && !failure) return;
  c.save();
  c.globalAlpha = 1 - ease((progress - .6) / .4);
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  const y = Math.round(fy - 16 - 8 * progress);
  const mark = strike ? '!' : success ? '✦' : '×';
  c.strokeStyle = '#142d40';
  c.lineWidth = 3;
  c.strokeText(mark, fx, y);
  c.fillStyle = failure ? '#ffaaa2' : '#ffe6ad';
  c.fillText(mark, fx, y);
  c.restore();
}

function drawCatchSprite(c: Ctx, fishId: FishId, x: number, y: number, opacity: number, angle: number, size = .38) {
  if (opacity === 0) return;
  c.save();
  c.globalAlpha = opacity;
  c.translate(Math.round(x), Math.round(y) - 3);
  if (angle) c.rotate(angle);
  c.scale(size, size);
  c.translate(-FISH_SPRITE_WIDTH/2,-FISH_SPRITE_HEIGHT/2);
  drawFish(c, fishId);
  c.restore();
}

function dockFromWater(c: Ctx, dock: DockImage | undefined, towardDock: number) {
  const lift = ease((towardDock - .48) / .52);
  const top = Math.round(-40 * (1 - lift));
  const inset = Math.round(14 * (1 - lift));
  const width = 200 + inset * 2;
  const bottom = top + 150;
  if (dock) {
    if (bottom < 150) {
      // Carry the reflection at the bottom of the street image into the foreground.
      c.drawImage(dock, 0, dock.height - 10, dock.width, 10, -inset, bottom, width, 150 - bottom);
      const shade = c.createLinearGradient(0, bottom, 0, 150);
      shade.addColorStop(0, '#18344900');
      shade.addColorStop(1, '#183449bc');
      c.fillStyle = shade;
      c.fillRect(0, bottom, 200, 150 - bottom);
    }
    c.drawImage(dock, -inset, top, width, 150);
    return;
  }

  rect(c, '#384665', 0, 0, 200, 150);
  rect(c, '#233d53', 0, top + 133, 200, 150 - (top + 133));
  rect(c, '#937d79', 0, top + 117, 200, 16);
  rect(c, '#545062', 0, top + 132, 200, 7);
  for (const [x, w, wall, board] of [[23, 82, '#3c5468', '#263e57'], [101, 83, '#764b44', '#603f3b']] as const) {
    rect(c, wall, x, top + 25, w, 92);
    rect(c, '#272f49', x - 3, top + 24, w + 6, 7);
    rect(c, board, x + 7, top + 61, w - 14, 13);
    rect(c, '#b47a4c', x + 14, top + 83, w - 28, 30);
    rect(c, '#e3aa6b', x + 18, top + 86, w - 36, 17);
    rect(c, wall, x + 32, top + 83, 3, 30);
    rect(c, wall, x + 51, top + 83, 3, 30);
  }
  c.save();
  c.translate(0, top - 2);
  c.scale(.5, .5);
  paintDockSigns(c);
  c.restore();
}

function drawCrossing(c: Ctx, scene: FishingScene, crossing: NonNullable<FishingScene['crossing']>, atlas: HTMLImageElement | undefined, dock: DockImage | undefined) {
  const toPier = crossing.destination === 'dock';
  const p = unit(toPier ? crossing.progress : 1 - crossing.progress);
  const travel = ease(p / .72);
  const dockBlend = ease((p - .29) / .19);
  const lift = ease((p - .55) / .45);
  const bob = Math.round(Math.sin(scene.timeMs / 950 + 5 * Math.sin(Math.PI * p)));

  c.imageSmoothingEnabled = false;
  rect(c, '#18384d', 0, 0, 200, 150);
  if (atlas && dockBlend < 1) {
    const zoom = 1 + .25 * travel;
    c.drawImage(atlas, 0, 0, 384, 288, Math.round(-10 * travel), Math.round(-9 * travel), Math.ceil(200 * zoom), Math.ceil(150 * zoom));
  }
  if (dockBlend > 0) {
    c.save();
    c.globalAlpha = dockBlend;
    dockFromWater(c, dock, p);
    c.restore();
  }
  if (p >= 1) return;

  const size = 1 - .24 * travel;
  const shipX = Math.round(98 + 33 * travel);
  const shipY = Math.round(114 + 7 * travel + 66 * lift);
  const wake = Math.sin(Math.PI * p) * ease(p / .15);
  c.save();
  c.globalAlpha = .58 * wake;
  for (let i = 0; i < 7; i++) {
    const spread = ((crossing.progress * 8 + i) % 7) / 7;
    const x = Math.round(shipX + (toPier ? -1 : 1) * (38 + 50 * spread));
    const y = shipY + 2 + Math.round(rnd(i + 6) * (3 + 8 * spread));
    rect(c, i % 2 ? '#9ac4c5' : '#537c94', x, y, 5 + i + Math.round(7 * spread), 1);
  }
  c.restore();

  c.save();
  c.translate(shipX, shipY);
  c.scale(size, size);
  c.translate(-98, -114);
  if (atlas) c.drawImage(atlas, 0, 289, 260, 92, 34, 75 + bob, 128, 45);
  const rodStowed = ease(p / .12);
  if (rodStowed < 1) {
    c.globalAlpha = 1 - rodStowed;
    fishingMotion(c, scene, bob);
  }
  if (rodStowed > 0) {
    c.globalAlpha = rodStowed;
    angler(c, bob, 0, 130, 102 + bob);
  }
  c.restore();
}

/** Paints the layered twilight atlas; all weather and fishing animation is immediate-mode. */
export function drawFishingBay(canvas:HTMLCanvasElement,f:FishingScene):void {
  const c=canvas.getContext('2d');if(!c)return;
  const cache=atlases.get(canvas);
  if (f.crossing) {
    c.save();
    c.scale(4, 4);
    drawCrossing(c, f, f.crossing, cache, dockImages.get(canvas));
    c.restore();
    return;
  }
  if(cache){c.imageSmoothingEnabled=false;c.drawImage(cache,0,0,384,288,0,0,BAY_WIDTH,BAY_HEIGHT);}
  c.save();c.scale(4,4);
  if(!cache){rect(c,'#4a5080',0,0,200,94);rect(c,'#153650',0,94,200,56);}
  if(f.phase==='fight'){
    rect(c,'#25334bb8',0,0,200,94);rect(c,'#101e24bb',0,94,200,56);
    poly(c,'#293247','M0 0H200V34H193V30H182V25H172V22H161V27H153V33H143V39H133V42H119V37H106V33H95V37H85V43H74V46H63V41H55V35H44V31H34V35H26V39H13V35H5V31H0Z');
    if(!f.reducedMotion && f.impulse?.kind === 'strike' && f.impulse.ageMs < 130)poly(c,'#fff2b8','M155 32H161L151 53H159L143 75L149 56H144Z');
  }
  const t=f.reducedMotion?0:f.timeMs/950,bob=Math.round(Math.sin(t));
  for(let i=0;i<13;i++){const x=Math.floor((rnd(i+19)*200+t*(i%3+2))%200),y=101+Math.floor(rnd(i+57)*45);rect(c,i%3?'#7195b73a':'#cb955c40',x,y,3+(i%5)*3,1);}
  if (cache) {
    c.drawImage(cache, 0, 289, 260, 92, 34, 75 + bob, 128, 45);
  }
  fishingMotion(c,f,bob);
  drawImpulse(c, f);
  drawReelingFish(c, f, bob);
  c.restore();
}
