import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GameCartridgeProps } from '../../types/game';
import { createRun, frontGap, stepRun } from './engine';
import { loadAssets, type SkiAssets } from './assets';
import { renderGame } from './renderer';
import { emptyInput, TRAILS, type GamePhase, type SkiInput, type TrailId } from './model';
import { SkiSound } from './sound';
import './ski.css';

const HIGH_KEY = 'pocketworld:mario:highscore';
type IconName = 'coin' | 'flag' | 'cup' | 'pause' | 'jump' | 'tuck' | 'sound' | 'snow' | 'arrow';
function SkiIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    coin: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10m-3-8h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5"/></>,
    flag: <><path d="M5 21V4m0 1c5-5 9 5 14 0v10c-5 5-9-5-14 0"/></>,
    cup: <><path d="M7 4h10v5a5 5 0 0 1-10 0Zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 1v5m-4 2h8"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    jump: <><path d="m5 11 7-7 7 7M12 4v14M5 21h14"/></>,
    tuck: <><circle cx="15" cy="5" r="2"/><path d="m12 9-4 4 6 2-4 4m2-10 5 4 4 1M3 21h18"/></>,
    sound: <><path d="M10 5 5 9H2v6h3l5 4Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    snow: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7m-12-3 3.3 3 3.3-3m-6.6 16 3.3-3 3.3 3"/></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`ski-icon ski-icon-${name}`}>{paths[name]}</svg>;
}
function storedHigh() {
  try { const value = Number(localStorage.getItem(HIGH_KEY)); return Number.isFinite(value) ? Math.max(0, value) : 0; }
  catch { return 0; }
}
function snapshot(state: ReturnType<typeof createRun>) {
  return { score: state.score, distance: Math.floor(state.distance), coins: state.coins, flips: state.flips,
    combo: state.combo, gap: Math.max(0, Math.round(frontGap(state) / 10)), message: state.messageTime > 0 ? state.message : '',
    partner: state.player.partner, crashed: state.player.crashTime > 0,
    boosting: state.player.boostTime > 0, boost: state.player.boostTime / 0.9, coinFlash: state.coinFlash > 0 };
}

export default function MarioGame({ isActive = true, isMuted = false, onExit, onScoreChange, onGameOver }: GameCartridgeProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef(createRun('valley'));
  const input = useRef<SkiInput>(emptyInput());
  const held = useRef(new Set<string>());
  const sound = useRef<SkiSound | null>(null);
  const latest = useRef({ onExit, onScoreChange, onGameOver, isActive });
  latest.current = { onExit, onScoreChange, onGameOver, isActive };
  const [phase, setPhase] = useState<GamePhase>('home');
  const phaseRef = useRef(phase);
  const [assets, setAssets] = useState<SkiAssets | null>(null);
  const [loading, setLoading] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scale, setScale] = useState(1);
  const [compact, setCompact] = useState(false);
  const [touchUI, setTouchUI] = useState(() => matchMedia('(any-pointer: coarse)').matches);
  const [hidden, setHidden] = useState(document.hidden);
  const [localMuted, setLocalMuted] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [high, setHigh] = useState(storedHigh);
  const highRef = useRef(high);
  const startingHigh = useRef(high);
  const reported = useRef(false);
  const revealed = useRef(false);
  const [showResults, setShowResults] = useState(false);
  const [hud, setHud] = useState(() => snapshot(run.current));
  const menu = useRef<HTMLDivElement>(null);
  const escape = useRef(() => {});
  const muted = isMuted || localMuted;

  const clearInput = useCallback(() => { held.current.clear(); input.current = emptyInput(); }, []);
  const go = useCallback((next: GamePhase) => {
    clearInput(); phaseRef.current = next; setPhase(next);
    if (next === 'home' || next === 'select') sound.current?.stop();
  }, [clearInput]);
  const pause = useCallback(() => { if (phaseRef.current === 'playing') go('paused'); }, [go]);
  const publish = useCallback(() => {
    const score = run.current.score;
    const best = Math.max(highRef.current, score);
    if (best !== highRef.current) {
      highRef.current = best; setHigh(best);
      try { localStorage.setItem(HIGH_KEY, String(best)); } catch { /* Session records still work without storage. */ }
    }
    setHud(snapshot(run.current));
    latest.current.onScoreChange?.(score, best);
  }, []);
  const start = (trail: TrailId) => {
    if (loading || !latest.current.isActive) return;
    sound.current?.stop(); sound.current?.setPaused(false); sound.current?.unlock();
    run.current = createRun(trail); reported.current = false; startingHigh.current = highRef.current;
    revealed.current = false; setShowResults(false);
    publish(); go('playing'); container.current?.focus();
  };
  const resume = () => {
    if (!isActive || hidden) return;
    sound.current?.setPaused(false); sound.current?.unlock(); go('playing'); container.current?.focus();
  };

  useEffect(() => {
    const audio = new SkiSound(); sound.current = audio;
    return () => { audio.dispose(); sound.current = null; };
  }, []);
  useEffect(() => { sound.current?.setMuted(muted); }, [muted]);
  useEffect(() => { sound.current?.setPaused(!isActive || hidden || phase === 'paused'); }, [isActive, hidden, phase]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAssets(attempt > 0).then(value => {
      if (cancelled) return;
      setAssets(value); setAssetError(Boolean(value.errors.length)); setLoading(false);
    }).catch(() => { if (!cancelled) { setAssetError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    const query = matchMedia('(any-pointer: coarse)');
    const change = () => setTouchUI(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const resize = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setScale(Math.min(width / 800, height / 600)); setCompact(width < 550);
    });
    if (container.current) resize.observe(container.current);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const visibility = () => { setHidden(document.hidden); if (document.hidden) pause(); };
    const blur = () => { clearInput(); pause(); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', blur);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur); };
  }, [pause, clearInput]);
  useEffect(() => { if (!isActive) { pause(); clearInput(); } }, [isActive, pause, clearInput]);
  useEffect(() => {
    if (phase !== 'playing') menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [phase, loading, showResults]);

  useEffect(() => {
    if (!isActive || hidden) return;
    const jumpKeys = ['Space', 'KeyW', 'ArrowUp'];
    const keys = [...jumpKeys, 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'];
    const sync = () => {
      input.current.jump = jumpKeys.some(key => held.current.has(key)) || held.current.has('touch-jump');
      input.current.tuck = held.current.has('KeyS') || held.current.has('ArrowDown') || held.current.has('touch-tuck');
      input.current.tilt = Number(held.current.has('KeyD') || held.current.has('ArrowRight')) - Number(held.current.has('KeyA') || held.current.has('ArrowLeft'));
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) escape.current();
        return;
      }
      if (phaseRef.current !== 'playing' || !keys.includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat && jumpKeys.includes(event.code) && !input.current.jump) input.current.jumpPressed = true;
      held.current.add(event.code); sync();
    };
    const keyup = (event: KeyboardEvent) => {
      if (!keys.includes(event.code)) return;
      if (phaseRef.current === 'playing') { event.preventDefault(); event.stopImmediatePropagation(); }
      held.current.delete(event.code); sync();
    };
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); clearInput(); };
  }, [isActive, hidden, clearInput, pause]);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const draw = () => renderGame(context, run.current, assets, { phase, reducedMotion: reduced });
    draw();
    if (!isActive || hidden || phase === 'paused' || phase === 'select' || loading) return;
    let frame = 0, previous = 0, accumulator = 0, sinceHud = 0;
    const animate = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      if (phaseRef.current === 'playing') {
        accumulator += dt;
        while (accumulator >= 1 / 120) {
          stepRun(run.current, input.current, 1 / 120, reduced);
          input.current.jumpPressed = false;
          accumulator -= 1 / 120;
          for (const event of run.current.events) {
            sound.current?.playEvent(event);
          }
          if (run.current.over) {
            publish();
            if (!reported.current) {
              reported.current = true;
              latest.current.onGameOver?.({ score: run.current.score, highScore: highRef.current, victory: false });
            }
            go('over'); break;
          }
        }
        sinceHud += dt;
        if (sinceHud >= 0.1) { publish(); sinceHud = 0; }
      } else if (phase === 'home') run.current.time += dt;
      else if (phase === 'over') {
        run.current.caughtTime = Math.min(2, run.current.caughtTime + dt); run.current.time += dt;
        if (run.current.caughtTime >= 1.3 && !revealed.current) { revealed.current = true; setShowResults(true); }
      }
      draw();
      if (phaseRef.current === phase && !(phase === 'over' && run.current.caughtTime >= 2)) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [phase, isActive, hidden, assets, reduced, loading, publish, go]);

  const touch = (kind: 'jump' | 'tuck', down: boolean) => {
    if (phaseRef.current !== 'playing' || !isActive) return;
    const key = `touch-${kind}`;
    if (down) {
      if (kind === 'jump' && !input.current.jump) input.current.jumpPressed = true;
      held.current.add(key);
    } else held.current.delete(key);
    input.current.jump = ['touch-jump', 'Space', 'KeyW', 'ArrowUp'].some(value => held.current.has(value));
    input.current.tuck = ['touch-tuck', 'KeyS', 'ArrowDown'].some(value => held.current.has(value));
  };
  const returnHome = () => { run.current = createRun('valley'); go('home'); };
  const exit = () => { sound.current?.stop(); latest.current.onExit(); };
  escape.current = () => {
    const current = phaseRef.current;
    if (current === 'playing') pause();
    else if (current === 'paused') resume();
    else if (current === 'home') exit();
    else returnHome();
  };
  const trail = TRAILS.find(value => value.id === run.current.trail)!;

  return <div ref={container} className={`ski-game${compact ? ' ski-compact' : ''}${touchUI ? ' ski-touch-ui' : ''}`} tabIndex={-1} aria-label="奶娃滑雪大冒险" onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}>
    <div className="ski-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      <canvas ref={canvas} width={800} height={600} aria-label="奶娃在雪道滑行，后方豆包群正在追赶" />
      {phase === 'home' && <div className="ski-settings">
        <button type="button" disabled={isMuted} aria-label={muted ? '打开游戏声音' : '关闭游戏声音'} aria-pressed={muted} onClick={() => setLocalMuted(value => !value)}><SkiIcon name="sound"/><span>{muted ? '静音' : '声音'}</span></button>
        <button type="button" aria-pressed={reduced} onClick={() => setReduced(value => !value)}><SkiIcon name="snow"/><span>{reduced ? '轻柔' : '动态'}</span></button>
      </div>}
      {phase === 'home' && <div className="ski-home ski-wood" ref={menu}>
        <h1>奶娃滑雪大冒险</h1>
        <p className="ski-tagline">雪板一踩，烦恼拜拜。</p>
        <p className="ski-record"><SkiIcon name="cup"/>最高纪录 <strong>{high.toLocaleString()}</strong><small>分</small></p>
        <div className="ski-home-actions"><button className="ski-primary" disabled={loading || !isActive} onClick={() => { sound.current?.unlock(); go('select'); }}>{loading ? '正在准备雪板…' : '出发滑雪'}<SkiIcon name="arrow"/></button>
          <button className="ski-quiet" onClick={exit}>退出到电脑</button></div>
        <p className="ski-home-help">{touchUI ? '轻按跳跃 · 长按翻转 · 松手落地' : 'W / 空格 跳跃 · 长按翻转 · S 收身'}</p>
      </div>}
      {phase === 'select' && <div className="ski-select ski-menu-surface ski-wood" ref={menu}>
        <h2>挑一条雪道</h2><p>今天的快乐，从这里出发。</p>
        <div className="ski-trails">{TRAILS.map((item, index) => <button key={item.id} disabled={!isActive} className={`ski-trail ski-trail-${item.id}`} onClick={() => start(item.id)}>
          <span className="ski-trail-landscape" aria-hidden="true"><svg viewBox="0 0 150 110"><path d="M0 103 48 25 74 63 106 13 150 96V110H0Z" fill={item.mountain}/><path d="m48 25 18 28-17-7-13 12Zm58-12 22 39-20-8-12 8-7-11Z" fill={item.snow}/><path d="M0 98Q56 68 150 91V110H0Z" fill={item.snow}/></svg></span>
          <span><strong>{item.name}</strong><small>{['开阔缓坡', '林间穿行', '追着极光'][index]}</small></span><span className="ski-route-level">{['悠闲', '进阶', '挑战'][index]}<SkiIcon name="arrow"/></span>
        </button>)}</div>
        <button className="ski-quiet" onClick={returnHome}>返回首页</button>
      </div>}
      {(phase === 'playing' || phase === 'paused') && <>
        <div className="ski-hud"><div className="ski-score"><span className="ski-stat-label"><SkiIcon name="flag"/>滑行距离</span><strong>{hud.distance.toLocaleString()}<small>米</small></strong><span className="ski-score-total">得分 <b>{hud.score.toLocaleString()}</b></span></div>
          <div className="ski-rewards"><div className={`ski-coin-count${hud.coinFlash && !reduced ? ' is-collected' : ''}`} aria-label={`金币 ${hud.coins} 枚`}><SkiIcon name="coin"/><strong>{hud.coins.toLocaleString()}</strong></div><div className={`ski-combo${hud.combo > 1 ? ' is-active' : ''}`} aria-label={`连击倍率 ${Math.max(1, hud.combo)} 倍`}><span>连击</span><strong>×{Math.max(1, hud.combo)}</strong></div></div>
          <button className="ski-pause-button" disabled={phase === 'paused'} onClick={pause} aria-label="暂停游戏"><SkiIcon name="pause"/><span>暂停</span></button>
        </div>
        <div className="ski-run-info">{hud.boosting && <strong className="ski-boost-status"><SkiIcon name="arrow"/>翻滚加速<i style={{ width: `${hud.boost * 100}%` }}/></strong>}{hud.partner && <strong title="未受到伤害或负面效果时可一直骑乘">牛来{hud.partner === 'slide' ? '滑行' : '护航'} <b>∞</b></strong>}<span className={`ski-chase${hud.gap < 10 ? ' is-danger' : ''}`} aria-label={`豆包在后方 ${hud.gap} 米`}>{hud.gap < 10 ? '豆包贴贴警告！' : '豆包'} <b>{hud.gap} 米</b></span></div>
        <p className={`ski-action-message${hud.boosting ? ' is-boosted' : ''}`} aria-live="polite">{hud.crashed ? '摔了个雪饼！轻按跳跃起身' : hud.message}</p>
      </>}
      {phase === 'playing' && <div className="ski-controls">
        <button className="ski-touch ski-tuck" aria-label="收身" onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); touch('tuck', true); }} onPointerUp={() => touch('tuck', false)} onPointerCancel={() => touch('tuck', false)} onLostPointerCapture={() => touch('tuck', false)}><SkiIcon name="tuck"/><span>收身</span></button>
        <button className="ski-touch ski-jump" aria-label={hud.crashed ? '快起身' : '跳跃'} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); touch('jump', true); }} onPointerUp={() => touch('jump', false)} onPointerCancel={() => touch('jump', false)} onLostPointerCapture={() => touch('jump', false)}><SkiIcon name="jump"/><span>{hud.crashed ? '快起身' : '跳跃'}</span></button>
      </div>}
      {phase === 'paused' && <div className="ski-shade"><div className="ski-pause ski-menu-surface ski-wood" ref={menu} role="dialog" aria-label="游戏暂停" aria-modal="true"><SkiIcon name="pause"/><h2>雪板歇一歇</h2><p>{isActive && !hidden ? '豆包也按下了暂停。' : '回到游戏后，点击继续。'}</p><button className="ski-primary" disabled={!isActive || hidden} onClick={resume}>继续滑雪<SkiIcon name="arrow"/></button><button className="ski-quiet" onClick={returnHome}>返回首页</button></div></div>}
      {phase === 'over' && showResults && <div className="ski-shade ski-results-shade"><div className="ski-results ski-menu-surface ski-wood" ref={menu} role="dialog" aria-label="本局结算" aria-modal="true"><h2>{hud.score > startingHigh.current ? '新纪录，雪地留名！' : '被豆包抱走啦！'}</h2><p className="ski-result-caption">本次滑行</p><strong className="ski-final-distance">{hud.distance.toLocaleString()}<small>米</small></strong><dl><div><dt><SkiIcon name="coin"/>金币</dt><dd>{hud.coins.toLocaleString()}<small>枚</small></dd></div><div><dt><SkiIcon name="cup"/>最高纪录</dt><dd>{high.toLocaleString()}<small>分</small></dd></div></dl><p className="ski-result-score">本次得分 {hud.score.toLocaleString()}<span>翻转 {hud.flips} 次</span></p><button className="ski-primary" disabled={!isActive} onClick={() => start(run.current.trail)}>再滑一次<SkiIcon name="arrow"/></button><button className="ski-quiet" onClick={returnHome}>返回首页</button></div></div>}
      {assetError && (phase === 'home' || phase === 'select') && <div className="ski-load-note" role="status">部分画面未载入，已启用备用绘制。<button onClick={() => setAttempt(value => value + 1)} disabled={loading}>重试加载</button></div>}
    </div>
  </div>;
}
