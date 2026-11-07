import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as PointerInput } from 'react';
import type { GameCartridgeProps } from '../../../types/game';
import { PinballAudio } from '../audio';
import { advance, chooseUpgrade, createRun, dash, DURATION, H, W, UPGRADES, switchVariant, upgradeRank, rerollUpgrades } from './engine';
import { SPECIALS, PROFESSIONS } from './professions';
import { TRAITS, synergies } from './traits';
import { WEAPONS, weaponOf } from './weapons';
import type { WeaponId } from './weapons';
import { armamentOf, variantsFor } from './arsenal';
import type { VariantId } from './arsenal';
import WeaponGlyph from './WeaponGlyph';
import type { Run, UpgradeId, Vec } from './engine';
import { render } from './render';
import './style.css';

type Screen = 'home' | 'playing' | 'paused' | 'upgrade' | 'victory' | 'defeat' | 'history' | 'armory';
type RecordEntry = { score: number; victory: boolean; date: string; time?: number; level?: number };
const HIGH = 'pocketworld:shooter:highscore', HISTORY = 'pocketworld:shooter:history';
function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function save(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } }
function records(): RecordEntry[] {
  try { const data: unknown = JSON.parse(read(HISTORY) ?? '[]'); return Array.isArray(data) ? data.filter((e): e is RecordEntry => typeof e === 'object' && e !== null && Number.isFinite(e.score) && e.score >= 0 && typeof e.victory === 'boolean' && typeof e.date === 'string').slice(0, 10) : []; } catch { return []; }
}
const timeText = (t: number): string => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
const snapshot = (r: Run) => ({ hp: r.hp, maxHp: r.maxHp, time: r.time, level: r.level, xp: r.xp, need: r.need, kills: r.kills, score: r.score, dashCd: r.dashCd, weapon: r.weapon, variant: r.variant, weaponNotice:r.weaponNotice, profession: r.profession, wave: r.wave, rerolls: r.rerolls, specials: { ...r.specials }, enchants: { ...r.enchants[r.weapon] }, upgrades: { ...r.upgrades } });

export default function ShooterGame({ width = W, height = H, isActive = true, isMuted = false, onScoreChange, onGameOver, onExit }: GameCartridgeProps): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null);
  const game = useRef<Run>(createRun()), audio = useRef<PinballAudio>(new PinballAudio());
  const screenRef = useRef<Screen>('home'), keys = useRef(new Set<string>()), joystick = useRef<Vec>({ x: 0, y: 0 });
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const props = useRef({ isActive, isMuted, onScoreChange, onGameOver, onExit }); props.current = { isActive, isMuted, onScoreChange, onGameOver, onExit };
  const storedBest = Number(read(HIGH));
  const best = useRef(Number.isFinite(storedBest) ? Math.max(0, storedBest) : 0), scoreSent = useRef(-1), ended = useRef(false), initialBest = useRef(best.current);
  const [screen, setScreen] = useState<Screen>('home'), [hud, setHud] = useState(() => snapshot(game.current));
  const [bestScore, setBestScore] = useState(best.current), [history, setHistory] = useState(records);
  const [quiet, setQuiet] = useState(false), quietRef = useRef(false);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('pistol'), selectedRef = useRef<WeaponId>('pistol');
  const [selectedVariant,setSelectedVariant]=useState<VariantId>('hex'), variantRef=useRef<VariantId>('hex');
  const [quality,setQuality]=useState<1|2>(2);
  const pixelRatio=typeof window==='undefined'?1:Math.min(2,window.devicePixelRatio||1);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

  const clearInput = useCallback(() => {
    keys.current.clear(); joystick.current = { x: 0, y: 0 }; setStick(null);
    const id = pointer.current?.id; pointer.current = null;
    if (id !== undefined && canvas.current?.hasPointerCapture(id)) canvas.current.releasePointerCapture(id);
  }, []);
  const view = useCallback((s: Screen) => {
    clearInput(); screenRef.current = s; setScreen(s);
    audio.current.configure(s === 'playing' && props.current.isActive, props.current.isMuted || quietRef.current);
  }, [clearInput]);
  const publish = useCallback(() => {
    const r = game.current;
    if (r.score > best.current) { best.current = r.score; save(HIGH, String(r.score)); setBestScore(r.score); }
    if (scoreSent.current !== r.score) { scoreSent.current = r.score; props.current.onScoreChange?.(r.score, best.current); }
  }, []);
  const start = useCallback(() => {
    if (!props.current.isActive) return;
    game.current = createRun(Math.random, selectedRef.current,variantRef.current); ended.current = false; scoreSent.current = -1; initialBest.current = best.current;
    setHud(snapshot(game.current)); view('playing'); publish(); audio.current.unlock();
  }, [publish, view]);
  const pause = useCallback(() => {
    if (!props.current.isActive) return;
    if (screenRef.current === 'playing') view('paused');
    else if (screenRef.current === 'paused') { view('playing'); audio.current.unlock(); }
  }, [view]);
  const move = useCallback((): Vec => ({
    x: Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft')) + joystick.current.x,
    y: Number(keys.current.has('s') || keys.current.has('arrowdown')) - Number(keys.current.has('w') || keys.current.has('arrowup')) + joystick.current.y,
  }), []);
  const doDash = useCallback(() => { if (props.current.isActive && screenRef.current === 'playing') { dash(game.current, move()); audio.current.unlock(); } }, [move]);
  const choose = useCallback((id: UpgradeId) => {
    if (props.current.isActive && screenRef.current === 'upgrade' && chooseUpgrade(game.current, id)) { setHud(snapshot(game.current)); view('playing'); audio.current.unlock(); }
  }, [view]);
  const reroll = useCallback(() => { if (props.current.isActive && rerollUpgrades(game.current)) setHud(snapshot(game.current)); }, []);
  const selectProfession = useCallback((id: WeaponId) => {
    if (!props.current.isActive || (screenRef.current !== 'armory' && screenRef.current !== 'home')) return;
    selectedRef.current = id; setSelectedWeapon(id); game.current = createRun(Math.random,id);
    variantRef.current=game.current.variant; setSelectedVariant(game.current.variant);
  }, []);
  const equipVariant=useCallback((id?:VariantId)=>{
    if(!props.current.isActive)return;
    if(screenRef.current==='playing'){if(switchVariant(game.current,id))setHud(snapshot(game.current));}
    else if(id&&(screenRef.current==='armory'||screenRef.current==='home')&&armamentOf(id).family===selectedRef.current){variantRef.current=id;setSelectedVariant(id);game.current.variant=id;}
  },[]);
  const home = useCallback(() => { if (props.current.isActive) { game.current = createRun(Math.random, selectedRef.current,variantRef.current); view('home'); } }, [view]);
  const finish = useCallback(() => {
    if (ended.current) return; ended.current = true;
    const r = game.current; publish();
    const victory = r.phase === 'victory';
    const list = [{ score: r.score, victory, date: new Date().toISOString(), time: r.time, level: r.level }, ...records()].slice(0, 10);
    save(HISTORY, JSON.stringify(list)); setHistory(list); setHud(snapshot(r)); view(victory ? 'victory' : 'defeat');
    props.current.onGameOver?.({ score: r.score, highScore: best.current, victory });
  }, [publish, view]);

  useEffect(() => {
    if (!isActive) { clearInput(); if (screenRef.current === 'playing') view('paused'); }
    audio.current.configure(isActive && screenRef.current === 'playing', isMuted || quiet);
  }, [isActive, isMuted, quiet, clearInput, view]);
  useEffect(() => () => audio.current.dispose(), []);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    render(ctx, game.current, screen === 'home' || screen === 'history' || screen === 'armory',game.current.time,undefined,quality);
    if (!isActive || (screen !== 'home' && screen !== 'playing')) return;
    let frame = 0, previous = performance.now(), uiTime = 0, demoTime = 0, live = true;
    const loop = (now: number): void => {
      if (!live || !props.current.isActive) return;
      const dt = Math.min(.05, (now - previous) / 1000); previous = now;
      if (screenRef.current === 'home') { demoTime += dt; render(ctx, game.current, true, demoTime,undefined,quality); }
      else if (screenRef.current === 'playing') {
        const r = game.current; advance(r, dt, move());
        for (const s of [...new Set(r.sounds.splice(0))].slice(0, 3)) audio.current.play(s, r.weapon);
        render(ctx, r,false,r.time,undefined,quality);
        if (r.phase === 'upgrade') { setHud(snapshot(r)); publish(); view('upgrade'); return; }
        if (r.phase === 'victory' || r.phase === 'defeat') { finish(); return; }
        if (now - uiTime > 100) { uiTime = now; setHud(snapshot(r)); publish(); }
      } else return;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { live = false; cancelAnimationFrame(frame); };
  }, [screen, isActive, width, height, quality, selectedVariant, selectedWeapon, finish, move, publish, view]);
  useEffect(() => {
    if (!isActive) return;
    const handled = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'escape', 'p', 'enter', '1', '2', '3']);
    const buttonActivation = (e: KeyboardEvent, k: string): boolean => (k === 'enter' || k === ' ') && e.target instanceof HTMLElement && e.target.tagName === 'BUTTON';
    const down = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase(); if (!handled.has(k) || !props.current.isActive) return;
      // Let focused buttons activate normally, including the outer display controls.
      if (buttonActivation(e, k)) return;
      e.preventDefault(); e.stopPropagation();
      if (screenRef.current === 'playing') keys.current.add(k);
      if (e.repeat) return;
      if (k === 'escape' && screenRef.current === 'armory') home();
      else if (k === 'escape' || k === 'p') pause();
      else if (screenRef.current === 'home' && k === 'enter') view('armory');
      else if (screenRef.current === 'playing' && k === ' ') doDash();
      else if (screenRef.current === 'playing' && (k === 'q' || k === 'r')) equipVariant();
      else if (screenRef.current === 'playing' && k === 'e') { const list=variantsFor(game.current.profession);equipVariant(list[(list.findIndex(a=>a.id===game.current.variant)+2)%3].id); }
      else if (screenRef.current === 'playing' && ['1','2','3'].includes(k)) equipVariant(variantsFor(game.current.profession)[Number(k)-1].id);
      else if (screenRef.current === 'upgrade' && k === 'r') reroll();
      else if (screenRef.current === 'upgrade' && ['1', '2', '3'].includes(k)) { const u = game.current.choices[Number(k) - 1]; if (u) choose(u.id); }
    };
    const up = (e: KeyboardEvent): void => { const k = e.key.toLowerCase(); if (handled.has(k)) { keys.current.delete(k); if (buttonActivation(e, k)) return; e.preventDefault(); e.stopPropagation(); } };
    const blur = (): void => { clearInput(); if (screenRef.current === 'playing') view('paused'); };
    const visibility = (): void => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); clearInput(); };
  }, [isActive, clearInput, view, choose, doDash, pause, equipVariant, home, reroll]);

  const point = (e: PointerInput<HTMLCanvasElement>): Vec => { const box = e.currentTarget.getBoundingClientRect(); return { x: (e.clientX - box.left) / box.width * W, y: (e.clientY - box.top) / box.height * H }; };
  const pointerDown = (e: PointerInput<HTMLCanvasElement>): void => {
    if (!isActive || screen !== 'playing' || pointer.current || e.button !== 0) return;
    e.preventDefault(); const p = point(e); pointer.current = { id: e.pointerId, ...p }; e.currentTarget.setPointerCapture(e.pointerId); setStick({ ...p, dx: 0, dy: 0 }); audio.current.unlock();
  };
  const pointerMove = (e: PointerInput<HTMLCanvasElement>): void => {
    const origin = pointer.current; if (!origin || origin.id !== e.pointerId) return;
    const p = point(e), dx = p.x - origin.x, dy = p.y - origin.y, d = Math.max(36, Math.hypot(dx, dy));
    joystick.current = { x: dx / d, y: dy / d }; setStick({ x: origin.x, y: origin.y, dx: dx / d * 26, dy: dy / d * 26 });
  };
  const toggleSound = (): void => { const next = !quiet; quietRef.current = next; setQuiet(next); audio.current.configure(screenRef.current === 'playing' && isActive, isMuted || next); if (!next) audio.current.unlock(); };
  const isHome = screen === 'home';
  const activeSkills = UPGRADES.filter(u => hud.upgrades[u.id] > 0);
  const combinations = synergies(hud.enchants);
  return <div ref={container} className="sprout-cartridge" data-game-screen={screen} style={{ aspectRatio: `${width}/${height}` }} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    <canvas ref={canvas} width={Math.round(width*pixelRatio)} height={Math.round(height*pixelRatio)} aria-label="团团魔法录游戏场景，WASD 移动，空格冲刺" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={clearInput} onPointerCancel={clearInput} onLostPointerCapture={clearInput} />
    {(isHome||screen==='paused')&&<button className="sg-quality" onClick={()=>setQuality(q=>q===2?1:2)} disabled={!isActive} aria-label="切换画质" title={quality===2?'640 × 480 场景 · 高密度画布':'320 × 240 场景 · 节能'}>{quality===2?'HD 高清':'经典像素'}</button>}
    {isHome && <div className="sg-home">
      <div className="sg-topline"><span className="sg-brand"><i>✿</i> POCKETWORLD </span><button className="sg-icon-button" onClick={toggleSound} aria-label={quiet || isMuted ? '开启音效' : '关闭音效'} disabled={!isActive || isMuted}>{quiet || isMuted ? '♫ ×' : '♫'}</button></div>
      <div className="sg-home-copy"><h1>团团<br /><span>魔法录</span><b>✦</b></h1><p>自动攻击，拖动移动 · 生存 10 分钟。</p><button className="sg-primary sg-start" onClick={() => isActive && view('armory')} disabled={!isActive}>选择职业 <span>↗</span></button></div>
      <div className="sg-guide"><div><b><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></b><span>移动</span></div><div><b><kbd>SPACE</kbd></b><span>冲刺</span></div><div><b><kbd>P</kbd><kbd>Esc</kbd></b><span>暂停</span></div></div>
      <div className="sg-home-footer"><button onClick={() => isActive && view('history')}>冒险手记 ↗</button><span>最高 {bestScore.toLocaleString()}</span><button onClick={() => { if (isActive) { clearInput(); audio.current.dispose(); props.current.onExit(); } }}>退出到桌面 ↗</button></div>
    </div>}
    {!isHome && screen !== 'history' && screen !== 'armory' && <>
      <div className="sg-hud"><div className="sg-vitals"><div><span>♥ {PROFESSIONS[hud.profession].shortName}</span><b>{Math.ceil(hud.hp)}/{hud.maxHp}</b></div><div className="sg-health"><i style={{ width: `${hud.hp / hud.maxHp * 100}%` }} /></div><small>得分 {hud.score.toLocaleString()}</small></div><div className="sg-clock"><strong>{timeText(Math.max(0, DURATION - hud.time))}</strong><span>第 {hud.wave} 波</span></div><div className="sg-actions"><span className="sg-kills">✦ <b>{hud.kills}</b></span><button className="sg-icon-button" onClick={toggleSound} disabled={!isActive || isMuted} aria-label="切换音效">{quiet || isMuted ? '♫ ×' : '♫'}</button><button className="sg-icon-button" onClick={pause} disabled={!isActive} aria-label="暂停游戏">Ⅱ</button><button className="sg-icon-button" onClick={home} disabled={!isActive} aria-label="返回首页">⌂</button></div></div>
      <div className="sg-loadout">{activeSkills.map(u => <span key={u.id} title={`${u.name} Lv.${hud.upgrades[u.id]}`} style={{ '--skill': u.color } as CSSProperties}>{u.icon}<small>{hud.upgrades[u.id]}</small></span>)}</div>
      <div className="sg-weapon-bar">
        <nav className="sg-variant-bar" aria-label="切换本职业武器">{variantsFor(hud.profession).map((a,i)=><button key={a.id} className={hud.variant===a.id?'selected':''} aria-pressed={hud.variant===a.id} disabled={!isActive||screen!=='playing'} onClick={()=>equipVariant(a.id)} title={a.description}><kbd>{i+1}</kbd><WeaponGlyph id={a.family} variant={a.id}/><span>{a.name}</span></button>)}</nav>
        {(SPECIALS.some(s=>s.weapon===hud.weapon&&hud.specials[s.id]>0)||TRAITS.some(t=>hud.enchants[t.id]>0))&&<div className="sg-enchants">{SPECIALS.filter(s => s.weapon === hud.weapon && hud.specials[s.id] > 0).map(s => <span key={s.id} style={{ color: s.color }} title={`${s.name} Lv.${hud.specials[s.id]}：${s.description}`}>{s.icon}<b>{hud.specials[s.id]}</b></span>)}{TRAITS.filter(t => hud.enchants[t.id] > 0).map(t => <span key={t.id} style={{ color: t.color }} title={`${t.name} Lv.${hud.enchants[t.id]}：${t.description}`}>{t.icon}<b>{hud.enchants[t.id]}</b></span>)}</div>}
        {combinations.length>0&&<div className="sg-combos">✦ {combinations.join(' · ')}</div>}
      </div>
      {screen==='playing'&&hud.weaponNotice>0&&<div key={hud.variant} className="sg-weapon-notice" style={{opacity:Math.min(1,hud.weaponNotice*3)}} role="status"><WeaponGlyph id={hud.profession} variant={hud.variant}/><strong>{armamentOf(hud.variant).name}</strong></div>}
      <div className="sg-bottom"><div className="sg-level">Lv.<b>{hud.level}</b></div><div className="sg-xp"><div><span>经验</span><span>{hud.xp} / {hud.need}</span></div><div><i style={{ width: `${Math.min(100, hud.xp / hud.need * 100)}%` }} /></div></div><button className="sg-dash" onClick={doDash} disabled={screen !== 'playing' || !isActive || hud.dashCd > 0}><b>{hud.dashCd > 0 ? hud.dashCd.toFixed(1) : '↗'}</b><span>{hud.dashCd > 0 ? '冷却' : '空格'}</span></button></div>
    </>}
    {stick && screen === 'playing' && <div className="sg-stick" style={{ left: `${stick.x / 8}%`, top: `${stick.y / 6}%` }}><i style={{ transform: `translate(${stick.dx / 8}cqw, ${stick.dy / 8}cqw)` }} /></div>}
    {screen === 'armory' && <div className="sg-overlay"><div className="sg-modal sg-armory"><h2>选择你的职业</h2><p>本局职业固定 · Q/E 或 1–3 切换武器</p><div className="sg-weapon-cards">{WEAPONS.map(w => <button key={w.id} onClick={() => selectProfession(w.id)} aria-label={PROFESSIONS[w.id].name} title={PROFESSIONS[w.id].name} aria-pressed={selectedWeapon === w.id} className={selectedWeapon === w.id ? 'selected' : ''} style={{ '--weapon': w.color, '--light': w.light } as CSSProperties} disabled={!isActive}><WeaponGlyph id={w.id} portrait /><strong>{PROFESSIONS[w.id].shortName}</strong></button>)}</div><div className="sg-weapon-description" style={{ '--weapon': weaponOf(selectedWeapon).color } as CSSProperties}><p>{PROFESSIONS[selectedWeapon].passive.replace('职业天赋：','')}</p></div><div className="sg-flow-cards" role="group" aria-label="选择开局武器流派">{variantsFor(selectedWeapon).map(a=><button key={a.id} onClick={()=>equipVariant(a.id)} className={selectedVariant===a.id?'selected':''} aria-pressed={selectedVariant===a.id} disabled={!isActive}><WeaponGlyph id={a.family} variant={a.id}/><div><strong>{a.name}</strong></div><p>{a.brief}</p></button>)}</div><button className="sg-primary" onClick={start} disabled={!isActive}>携{armamentOf(selectedVariant).name}出发 ↗</button><button className="sg-text-button" onClick={home}>返回首页</button></div></div>}
    {screen === 'upgrade' && <div className="sg-overlay"><div className="sg-modal sg-upgrade"><h2>镌刻新的秘术</h2><div className="sg-cards">{game.current.choices.map((u, i) => <button key={u.id} onClick={() => choose(u.id)} disabled={!isActive} style={{ '--skill': u.color } as CSSProperties}><i>{u.icon}</i><strong>{u.name}</strong><p>{u.description}</p><span className="sg-card-bottom">Lv.{upgradeRank(game.current, u) + 1}<kbd>{i + 1}</kbd></span></button>)}</div><button className="sg-text-button" onClick={reroll} disabled={!isActive || hud.rerolls <= 0}>R 重抽 · 剩余 {hud.rerolls} 次</button></div></div>}
    {screen === 'paused' && <div className="sg-overlay"><div className="sg-modal"><div className="sg-modal-icon">☁</div><h2>团团正在歇歇脚</h2><p>P / Esc 继续</p><button className="sg-primary" onClick={pause} disabled={!isActive}>继续冒险 ↗</button><button className="sg-text-button" onClick={home} disabled={!isActive}>返回首页</button></div></div>}
    {(screen === 'victory' || screen === 'defeat') && <div className="sg-overlay"><div className="sg-modal"><div className="sg-modal-icon">{screen === 'victory' ? '✦' : '❀'}</div><h2>{screen === 'victory' ? '小小英雄，守护成功！' : '今天的团团，也很勇敢'}</h2><p>{screen === 'victory' ? '十分钟的星光，点亮了整座棉花岛。' : '带上这次的经验，下一次会走得更远。'}</p><div className="sg-result"><div><b>{hud.score.toLocaleString()}</b><span>{hud.score > initialBest.current ? '✦ 新的最高分' : '冒险得分'}</span></div><div><b>{timeText(hud.time)}</b><span>守护时间</span></div><div><b>{hud.kills}</b><span>击退魔物</span></div></div><button className="sg-primary" onClick={start} disabled={!isActive}>再冒险一次 ↗</button><button className="sg-text-button" onClick={home} disabled={!isActive}>返回首页</button></div></div>}
    {screen === 'history' && <div className="sg-overlay"><div className="sg-modal sg-history"><h2>团团的冒险手记</h2><p>最近十次冒险，保存在这台设备上。</p><div className="sg-history-list">{history.length ? history.map((entry, i) => <div key={`${entry.date}-${i}`}><span>{String(i + 1).padStart(2, '0')}　{entry.victory ? '守护成功' : '勇敢尝试'}</span><span>{typeof entry.time === 'number' ? timeText(entry.time) : '旧版记录'}</span><b>{entry.score.toLocaleString()} 分</b></div>) : <div className="sg-empty">还没有手记，去收集第一颗星星吧。✦</div>}</div><button className="sg-primary" onClick={home} disabled={!isActive}>返回小岛</button></div></div>}
  </div>;
}
