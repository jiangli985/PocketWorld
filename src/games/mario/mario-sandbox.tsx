import { useCallback, useState } from 'react';
import type { GameCartridgeProps } from '../../types/game';
import MarioGame from './index';
import { openFishingStorage } from './storage';
import './mario-sandbox.css';

type TripResult = Parameters<NonNullable<GameCartridgeProps['onGameOver']>>[0];

export function roomHref(href: string) {
  const url = new URL(href);
  url.searchParams.delete('dev');
  return url.href;
}

function readHighScore() {
  // The game owns persistence; the host only reads the record before the first score callback.
  return openFishingStorage(() => window.localStorage).highScore;
}

function enterRoom() {
  window.location.assign(roomHref(window.location.href));
}

export default function MarioSandbox() {
  const [muted, setMuted] = useState(false);
  const [active, setActive] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(readHighScore);
  const [result, setResult] = useState<TripResult | null>(null);

  const onScoreChange = useCallback((score: number, highScore: number) => {
    setScore(score);
    setHighScore(highScore);
  }, []);
  const onGameOver = useCallback((result: TripResult) => {
    onScoreChange(result.score, result.highScore);
    setResult(result);
  }, [onScoreChange]);

  function toggleMount() {
    if (mounted) {
      setScore(0);
      setResult(null);
    } else {
      setHighScore(readHighScore());
    }
    setMounted(!mounted);
  }

  return (
    <main className="mario-sandbox">
      <header className="mario-sandbox-header">
        <h1>潮汐小馆 · 调试宿主</h1>
        <div className="mario-sandbox-controls" role="group" aria-label="调试控制">
          <button type="button" disabled={!mounted} onClick={() => setMuted(value => !value)}>{muted ? '恢复声音' : '静音'}</button>
          <button type="button" disabled={!mounted} onClick={() => setActive(value => !value)}>{active ? '停用' : '激活'}</button>
          <button type="button" onClick={toggleMount}>{mounted ? '卸载' : '重装'}</button>
          <button type="button" onClick={enterRoom}>进入房间</button>
        </div>
      </header>
      <div className="mario-sandbox-stage">
        {mounted ? (
          <MarioGame
            width={800}
            height={600}
            isMuted={muted}
            isActive={active}
            onExit={enterRoom}
            onScoreChange={onScoreChange}
            onGameOver={onGameOver}
          />
        ) : <p role="status">卡带已卸载。重装将从本机进度开始。</p>}
      </div>
      <dl className="mario-sandbox-stats" aria-live="polite">
        <div><dt>本趟营业额</dt><dd>{mounted ? score : '—'}</dd></div>
        <div><dt>最高分</dt><dd>{highScore}</dd></div>
        <div><dt>最近收工</dt><dd>{result ? `${result.victory ? '达成目标' : '未达成目标'} · ${result.score} 金币` : '—'}</dd></div>
      </dl>
    </main>
  );
}
