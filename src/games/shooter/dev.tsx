import React, { useState } from 'react';
import ShooterGame from './index';
import './dev.css';

export default function ShooterSandbox(): React.ReactElement {
  const [muted, setMuted] = useState(false), [active, setActive] = useState(true);
  const [mounted, setMounted] = useState(true), [score, setScore] = useState(0), [best, setBest] = useState(0);
  const [result, setResult] = useState('');
  const leave = (): void => { const url = new URL(location.href); url.searchParams.delete('dev'); location.assign(url.href); };
  return <main className="shooter-sandbox-page"><header><span>POCKETWORLD · CARTRIDGE LAB</span><nav><button onClick={() => setMuted(v => !v)}>{muted ? '恢复声音' : '静音'}</button><button onClick={() => setActive(v => !v)}>{active ? '停用卡带' : '激活卡带'}</button><button onClick={() => setMounted(v => !v)}>{mounted ? '卸载卡带' : '重新装载'}</button><button onClick={leave}>进入房间</button></nav></header><div className="shooter-sandbox-frame">{mounted ? <ShooterGame isMuted={muted} isActive={active} onExit={leave} onScoreChange={(current, high) => { setScore(current); setBest(high); }} onGameOver={r => setResult(r.victory ? '守护成功' : '本次冒险结束')} /> : <p>卡带已卸载，动画、监听和音频应已释放。</p>}</div><footer aria-live="polite">得分 {score} · 最佳 {best}{result ? ` · ${result}` : ''}</footer></main>;
}
