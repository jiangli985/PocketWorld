import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';
import type { GameCartridgeProps } from '../../types/game';
import { advance, chooseUpgrade, createRun, GAME_HEIGHT, GAME_WIDTH, launch, upgradeChoices } from './engine';
import type { Point, Run, Upgrade } from './engine';
import { PinballAudio } from './audio';
import { render } from './render';
import './shooter.css';

type Screen = 'home' | 'playing' | 'paused' | 'upgrade' | 'victory' | 'gameover';
type RecordEntry = { score: number; victory: boolean; date: string };
type Hud = { score: number; wave: number; turn: number; combo: number; enemies: number; balls: number; elapsed: number; phase: Run['phase'] };
const HIGH_KEY = 'pocketworld:shooter:highscore';
const HISTORY_KEY = 'pocketworld:shooter:history';
const MAX_HISTORY = 10;
const format = (value: number): string => value.toLocaleString('en-US');

function readHighScore(): number {
  try { const value = Number(window.localStorage.getItem(HIGH_KEY)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; }
}
function readHistory(): RecordEntry[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((entry: unknown): entry is RecordEntry => {
      if (typeof entry !== 'object' || !entry) return false;
      const candidate = entry as Partial<RecordEntry>;
      return typeof candidate.score === 'number' && Number.isFinite(candidate.score) && candidate.score >= 0 && typeof candidate.victory === 'boolean' && typeof candidate.date === 'string';
    }).slice(0, MAX_HISTORY);
  } catch { return []; }
}
function save(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* Private browsing/storage denial must not block play. */ }
}
function hudOf(run: Run): Hud {
  return { score: run.score, wave: run.wave, turn: run.turn, combo: run.combo, enemies: run.enemies.length, balls: run.balls.length + run.pending, elapsed: run.elapsed, phase: run.phase };
}
function makeDemo(): Run {
  const run = createRun();
  run.upgrades.split = 1; run.upgrades.chain = 1; run.upgrades.gravity = 1;
  return run;
}
const isolate = (event: SyntheticEvent): void => { event.stopPropagation(); };

export default function ShooterGame({
  width = GAME_WIDTH, height = GAME_HEIGHT, isActive = true, isMuted = false,
  onScoreChange, onGameOver, onExit,
}: GameCartridgeProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runRef = useRef<Run | null>(null);
  if (!runRef.current) runRef.current = createRun();
  const demoRef = useRef<Run | null>(null);
  if (!demoRef.current) demoRef.current = makeDemo();
  const audioRef = useRef<PinballAudio | null>(null);
  if (!audioRef.current) audioRef.current = new PinballAudio();
  const viewRef = useRef<Screen>('home');
  const propsRef = useRef({ isActive, isMuted, onScoreChange, onGameOver, onExit });
  propsRef.current = { isActive, isMuted, onScoreChange, onGameOver, onExit };
  const pointerRef = useRef<number | null>(null);
  const scoreRef = useRef(-1);
  const highRef = useRef(readHighScore());
  const initialHighRef = useRef(highRef.current);
  const resultSentRef = useRef(false);
  const choicesRef = useRef<Upgrade[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [hud, setHud] = useState<Hud>(() => hudOf(runRef.current!));
  const [highScore, setHighScore] = useState(highRef.current);
  const [history, setHistory] = useState<RecordEntry[]>(readHistory);
  const [choices, setChoices] = useState<Upgrade[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const cancelAim = useCallback((): void => {
    const id = pointerRef.current; const canvas = canvasRef.current;
    pointerRef.current = null;
    if (id !== null && canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }, []);
  const setView = useCallback((next: Screen): void => {
    cancelAim(); viewRef.current = next; setScreen(next);
    audioRef.current?.configure(next === 'playing' && propsRef.current.isActive, propsRef.current.isMuted);
  }, [cancelAim]);
  const publish = useCallback((): void => {
    const run = runRef.current!;
    if (run.score > highRef.current) { highRef.current = run.score; setHighScore(run.score); save(HIGH_KEY, String(run.score)); }
    if (scoreRef.current !== run.score) { scoreRef.current = run.score; propsRef.current.onScoreChange?.(run.score, highRef.current); }
  }, []);
  const start = useCallback((): void => {
    if (!propsRef.current.isActive) return;
    runRef.current = createRun(); resultSentRef.current = false; initialHighRef.current = highRef.current;
    scoreRef.current = -1; setChoices([]); choicesRef.current = []; setShowHistory(false);
    setHud(hudOf(runRef.current)); setView('playing'); publish(); audioRef.current?.unlock();
  }, [publish, setView]);
  const home = useCallback((): void => {
    if (!propsRef.current.isActive) return;
    demoRef.current = makeDemo(); setShowHistory(false); setView('home');
  }, [setView]);
  const finish = useCallback((victory: boolean): void => {
    if (resultSentRef.current) return;
    resultSentRef.current = true; publish();
    const run = runRef.current!;
    const next = [{ score: run.score, victory, date: new Date().toISOString() }, ...readHistory()].slice(0, MAX_HISTORY);
    save(HISTORY_KEY, JSON.stringify(next)); setHistory(next); setHud(hudOf(run));
    setView(victory ? 'victory' : 'gameover');
    propsRef.current.onGameOver?.({ score: run.score, highScore: highRef.current, victory });
  }, [publish, setView]);
  const pause = useCallback((): void => {
    if (!propsRef.current.isActive) return;
    if (viewRef.current === 'playing') setView('paused');
    else if (viewRef.current === 'paused') { setView('playing'); audioRef.current?.unlock(); }
  }, [setView]);
  const choose = useCallback((choice: Upgrade): void => {
    if (!propsRef.current.isActive || viewRef.current !== 'upgrade' || !choicesRef.current.some((item) => item.id === choice.id)) return;
    if (chooseUpgrade(runRef.current!, choice.id)) { setHud(hudOf(runRef.current!)); setView('playing'); audioRef.current?.unlock(); }
  }, [setView]);
  const fire = useCallback((): void => {
    if (!propsRef.current.isActive || viewRef.current !== 'playing') return;
    audioRef.current?.unlock();
    if (launch(runRef.current!, runRef.current!.aim)) setHud(hudOf(runRef.current!));
  }, []);
  const exit = useCallback((): void => {
    if (!propsRef.current.isActive || viewRef.current !== 'home') return;
    cancelAim(); audioRef.current?.dispose(); propsRef.current.onExit();
  }, [cancelAim]);

  useEffect(() => {
    if (!isActive && viewRef.current === 'playing') setView('paused');
    if (!isActive) cancelAim();
    audioRef.current?.configure(isActive && viewRef.current === 'playing', isMuted);
  }, [cancelAim, isActive, isMuted, setView]);
  useEffect(() => () => { audioRef.current?.dispose(); }, []);

  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    context.setTransform(canvas.width / GAME_WIDTH, 0, 0, canvas.height / GAME_HEIGHT, 0, 0);
    const current = screen === 'home' ? demoRef.current! : runRef.current!;
    render(context, current, screen === 'playing');
    if (!isActive || (screen !== 'playing' && screen !== 'home')) return undefined;
    let frame = 0; let previous = performance.now(); let lastHud = 0; let alive = true;
    const loop = (now: number): void => {
      if (!alive || !propsRef.current.isActive) return;
      const delta = Math.min((now - previous) / 1000, 0.05); previous = now;
      if (viewRef.current === 'home') {
        let demo = demoRef.current!;
        if (demo.phase === 'aim') {
          const target = [...demo.enemies].sort((a, b) => b.y - a.y)[0];
          if (target) launch(demo, target);
        }
        advance(demo, delta); demo.sounds.length = 0;
        if (demo.phase === 'upgrade' || demo.phase === 'defeat' || demo.phase === 'victory') { demoRef.current = makeDemo(); demo = demoRef.current; }
        render(context, demo, false);
      } else if (viewRef.current === 'playing') {
        const run = runRef.current!; advance(run, delta); publish();
        const sounds = run.sounds.splice(0, run.sounds.length);
        // Avoid playing dozens of overlapping voices on a dense chain reaction.
        for (const event of [...new Set(sounds)].slice(0, 3)) audioRef.current?.play(event);
        render(context, run);
        if (run.phase === 'upgrade') {
          const next = upgradeChoices(run); choicesRef.current = next; setChoices(next);
          setHud(hudOf(run)); setView('upgrade'); return;
        }
        if (run.phase === 'victory' || run.phase === 'defeat') { finish(run.phase === 'victory'); return; }
        if (now - lastHud > 100) { lastHud = now; setHud(hudOf(run)); }
      } else return;
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => { alive = false; window.cancelAnimationFrame(frame); };
  }, [finish, height, isActive, publish, screen, setView, width]);

  useEffect(() => {
    if (!isActive) return undefined;
    const handled = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'p', 'escape', 'enter', 'r', '1', '2', '3']);
    const keydown = (event: KeyboardEvent): void => {
      if (!propsRef.current.isActive) return;
      const key = event.key.toLowerCase(); if (!handled.has(key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.repeat) return;
      const view = viewRef.current;
      if (key === 'p' || key === 'escape') { pause(); return; }
      if (view === 'home' && !showHistory && (key === ' ' || key === 'enter')) { start(); return; }
      if (view === 'playing' && (key === ' ' || key === 'enter')) fire();
      if (view === 'upgrade' && ['1', '2', '3'].includes(key)) { const choice = choicesRef.current[Number(key) - 1]; if (choice) choose(choice); }
      if ((view === 'victory' || view === 'gameover') && key === 'r') start();
      if (view === 'playing' && (key === 'arrowleft' || key === 'arrowright') && runRef.current!.phase === 'aim') {
        runRef.current!.aim = { x: Math.max(45, Math.min(755, runRef.current!.aim.x + (key === 'arrowleft' ? -26 : 26))), y: 170 };
      }
    };
    const keyup = (event: KeyboardEvent): void => { if (handled.has(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); } };
    const blur = (): void => { if (viewRef.current === 'playing') setView('paused'); };
    const visibility = (): void => { if (document.hidden) blur(); };
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); cancelAim();
    };
  }, [cancelAim, choose, fire, isActive, pause, setView, showHistory, start]);

  const eventPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / Math.max(1, rect.width) * GAME_WIDTH, y: (event.clientY - rect.top) / Math.max(1, rect.height) * GAME_HEIGHT };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault(); event.stopPropagation();
    if (!isActive || viewRef.current !== 'playing' || runRef.current!.phase !== 'aim' || pointerRef.current !== null || !event.isPrimary || event.button !== 0) return;
    pointerRef.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
    runRef.current!.aim = eventPoint(event); event.currentTarget.focus(); audioRef.current?.unlock();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.stopPropagation();
    if (isActive && viewRef.current === 'playing' && runRef.current!.phase === 'aim' && (pointerRef.current === event.pointerId || (pointerRef.current === null && event.pointerType === 'mouse'))) runRef.current!.aim = eventPoint(event);
  };
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault(); event.stopPropagation();
    if (pointerRef.current !== event.pointerId) return;
    runRef.current!.aim = eventPoint(event); cancelAim(); fire();
  };
  const run = runRef.current;
  const clock = `${Math.floor(hud.elapsed / 60)}:${String(Math.floor(hud.elapsed % 60)).padStart(2, '0')}`;
  const canvasWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : GAME_WIDTH;
  const canvasHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : GAME_HEIGHT;

  return <div className="pinball-cartridge" style={{ maxWidth: GAME_WIDTH }}
    aria-label="弹球失控网页游戏" data-screen={screen} data-phase={hud.phase} data-score={hud.score} data-wave={hud.wave}
    data-turn={hud.turn} data-enemies={hud.enemies} data-balls={hud.balls} data-elapsed={hud.elapsed.toFixed(3)}
    onPointerDown={isolate} onPointerMove={isolate} onPointerUp={isolate} onPointerCancel={isolate}
    onMouseDown={isolate} onMouseUp={isolate} onMouseMove={isolate} onTouchStart={isolate} onTouchMove={isolate} onTouchEnd={isolate}
    onClick={isolate} onDoubleClick={isolate} onWheel={isolate} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} tabIndex={0}
      aria-label="拖动瞄准并松开发射；也可用左右方向键瞄准，空格发射"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={(event) => { event.stopPropagation(); cancelAim(); }}
      onLostPointerCapture={(event) => { event.stopPropagation(); pointerRef.current = null; }}
      style={{ cursor: screen === 'playing' && hud.phase === 'aim' ? 'crosshair' : 'default' }} />

    {screen === 'home' && <div className="pb-home">
      <div className="pb-home-content">
        <div className="pb-eyebrow"><span className="pb-mark">↗</span><span className="pb-kicker">POCKET ARCADE<br />CARTRIDGE / 03</span></div>
        <h1 className="pb-title">弹球<span>失控</span></h1>
        <div className="pb-subtitle">ONE SHOT. MANY POSSIBILITIES.</div>
        <p className="pb-description">瞄准，发射。<br />让一次碰撞，变成一整场连锁反应。</p>
        <div className="pb-chips"><span className="pb-chip">BEST <strong>{format(highScore)}</strong></span><span className="pb-chip">3 WAVES</span><span className="pb-chip">6 UPGRADES</span></div>
        <div className="pb-actions"><button type="button" className="pb-button pb-button-primary" onClick={start}>开始游戏　↗</button><button type="button" className="pb-button" onClick={exit}>退出</button></div>
        <p className="pb-help">拖动瞄准 · 松开发射 · P 暂停<br />清空三波，打造你的失控构筑。</p>
        <div className="pb-history"><button type="button" className="pb-hud-button" onClick={() => { if (isActive) setShowHistory(true); }}>历史成绩 {history.length}/10</button>{history[0] && <span>最近 {format(history[0].score)} 分</span>}</div>
      </div>
      <div className="pb-demo-label"><i className="pb-dot" />LIVE DEMO<span>程序化弹射 / 无需下载资源</span></div>
    </div>}

    {(screen === 'playing' || screen === 'paused') && <>
      <div className="pb-hud"><div className="pb-hud-side"><span className="pb-stat">SCORE <b>{format(hud.score)}</b></span><span className="pb-stat">BEST {format(highScore)}</span><span className="pb-stat">WAVE <b>{hud.wave}/3</b></span></div><div className="pb-hud-side"><button type="button" className="pb-hud-button" onClick={pause}>{screen === 'paused' ? '继续' : '暂停'} P</button><button type="button" className="pb-hud-button" onClick={home}>退出</button></div></div>
      <div className="pb-bottom"><span className="pb-hint"><b>×{hud.combo}</b> 连击　·　{hud.enemies} 个目标　·　{clock}</span><span className="pb-hint">{hud.phase === 'flight' ? `飞行中 / ${hud.balls} 枚` : `拖动瞄准，松手发射 / ${run.volleySize} 球`}</span></div>
    </>}

    {screen === 'upgrade' && <div className="pb-overlay"><span className="pb-kicker">WAVE {hud.wave} CLEARED / 构筑时刻</span><h2>下一球，会更不一样。</h2><p>三选一强化。选择后进入下一波，弹仓自动装填。</p><div className="pb-cards">{choices.map((item, index) => <button key={item.id} type="button" className="pb-card" style={{ '--accent': item.color } as CSSProperties} onClick={() => choose(item)}><span className="pb-card-icon">{item.icon}</span><span className="pb-card-label">{item.label}</span><strong className="pb-card-name">{item.name}</strong><span className="pb-card-desc">{item.description}</span><span className="pb-card-key">按 {index + 1} 选择 ↗</span></button>)}</div></div>}
    {screen === 'paused' && <div className="pb-overlay"><span className="pb-kicker">PAUSED / 轨道静止</span><h2>喘口气。</h2><p>小球、计时和特效已冻结。按 P 继续。</p><div className="pb-stack"><button type="button" className="pb-button pb-button-primary" onClick={pause}>继续游戏</button><button type="button" className="pb-button" onClick={home}>返回首页</button></div></div>}
    {(screen === 'victory' || screen === 'gameover') && <div className="pb-overlay"><span className="pb-kicker">{screen === 'victory' ? 'THREE WAVES / CLEARED' : 'OUT OF ORBIT / 下次会更好'}</span><h2>{screen === 'victory' ? '漂亮的连锁。' : '防线被突破了。'}</h2><p>{screen === 'victory' ? '三波挑战完成，构筑属于你。' : '敌人触及了警戒线。换个角度，再试一次。'}</p><div className="pb-result-score">{format(run.score)}</div><div className="pb-result-label">最佳连击 ×{run.bestCombo}　{run.score > initialHighRef.current ? '✦ 新纪录' : ''}</div><div className="pb-stack"><button type="button" className="pb-button pb-button-primary" onClick={start}>再来一局　↗</button><button type="button" className="pb-button" onClick={home}>返回首页</button></div></div>}
    {showHistory && screen === 'home' && <div className="pb-overlay"><span className="pb-kicker">LOCAL RECORDS / 最近十局</span><h2>你的弹射记录</h2><p>只保存在当前浏览器，不上传服务器。</p><div style={{ width: '65%', maxHeight: '40%', overflowY: 'auto', marginBottom: '3%' }}>{history.length ? history.map((entry, index) => <div key={`${entry.date}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '.6em', color: '#d6e9d9', fontSize: 'max(9px, 1.5cqw)', borderBottom: '1px solid #29423d' }}><span>{String(index + 1).padStart(2, '0')}　{entry.victory ? '通关' : '挑战'}</span><strong>{format(entry.score)}</strong></div>) : <p>还没有记录。发射第一球吧。</p>}</div><button type="button" className="pb-button" onClick={() => { if (isActive) setShowHistory(false); }}>返回首页</button></div>}
  </div>;
}
