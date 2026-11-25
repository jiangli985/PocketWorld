import React, { useEffect, useRef, useState } from 'react';
import {
  DUST_TONES,
  PROMPT_KEYCAP_GAP,
  PROMPT_KEYCAP_SIZE,
  PROMPT_SHORTCUT_GAP,
  createDustPromptState,
  dustKeycapOpacity,
  layoutPromptShortcuts,
  setDustTargets,
  splitPromptLines,
  stepDustPrompt,
  type DustPoint,
} from './dustPromptEngine';

const CANVAS_HEIGHT = 116;
const TEXT_CENTER_Y = 34;
const FONT_FAMILY = "'Avenir Next', 'PingFang SC', 'Microsoft YaHei', sans-serif";
type PromptKeycap = DustPoint & { key: string };

function createDustSprites(): HTMLCanvasElement[] {
  return DUST_TONES.map(hex => {
    const sprite = document.createElement('canvas');
    sprite.width = 24;
    sprite.height = 24;
    const ctx = sprite.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(12, 12, 0.5, 12, 12, 11.5);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.38, hex);
      grad.addColorStop(0.68, `${hex}66`);
      grad.addColorStop(1, `${hex}00`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 24, 24);
    }
    return sprite;
  });
}

function sampleGlyphs(
  text: string,
  width: number,
  height: number,
): { points: DustPoint[]; shadow: HTMLCanvasElement | null; core: HTMLCanvasElement | null; keycaps: PromptKeycap[] } {
  const trimmed = text.trim();
  const empty = { points: [], shadow: null, core: null, keycaps: [] };
  if (!trimmed || width <= 0 || height <= 0) return empty;

  const scale = 3;
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(width * scale);
  offscreen.height = Math.ceil(height * scale);
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) return empty;

  const fontSize = width < 480 ? 15 : 18;
  const font = `600 ${fontSize}px ${FONT_FAMILY}`;
  ctx.scale(scale, scale);
  ctx.font = font;

  const padX = Math.min(180, Math.max(40, Math.round(width * 0.18)));
  const innerWidth = Math.max(150, width - padX * 2);
  const measure = (value: string) => ctx.measureText(value).width;
  const shortcuts = layoutPromptShortcuts(trimmed, measure, innerWidth);
  const keycaps: PromptKeycap[] = [];
  const glyphs: (DustPoint & { label: string })[] = [];
  if (shortcuts.length) {
    const lineHeight = PROMPT_KEYCAP_SIZE + 5;
    const startY = Math.max(PROMPT_KEYCAP_SIZE / 2 + 1, TEXT_CENTER_Y - ((shortcuts.length - 1) * lineHeight) / 2);
    shortcuts.forEach((row, index) => {
      const rowWidth = row.reduce((total, item) => total + item.width, 0) + (row.length - 1) * PROMPT_SHORTCUT_GAP;
      const y = startY + index * lineHeight;
      let left = (width - rowWidth) / 2;
      for (const { key, label, width: itemWidth } of row) {
        keycaps.push({ key, x: left + PROMPT_KEYCAP_SIZE / 2 - width / 2, y });
        const labelLeft = left + PROMPT_KEYCAP_SIZE + PROMPT_KEYCAP_GAP;
        glyphs.push({ label, x: (labelLeft + left + itemWidth) / 2, y });
        left += itemWidth + PROMPT_SHORTCUT_GAP;
      }
    });
  } else {
    const lines = splitPromptLines(trimmed, measure, innerWidth);
    const lineHeight = fontSize * 1.38;
    const startY = TEXT_CENTER_Y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((label, index) => glyphs.push({ label, x: width / 2, y: startY + index * lineHeight }));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  for (const { label, x, y } of glyphs) ctx.fillText(label, x, y);
  // Gather dust into the keycap as well. The bevel covers the inset mask as it settles.
  const maskSize = PROMPT_KEYCAP_SIZE - 4;
  ctx.beginPath();
  for (const { x, y } of keycaps) ctx.roundRect(x + (width - maskSize) / 2, y - maskSize / 2, maskSize, maskSize, 4);
  ctx.fill();

  const data = ctx.getImageData(0, 0, offscreen.width, offscreen.height).data;
  const points: DustPoint[] = [];
  const step = 2;
  for (let py = 0; py < offscreen.height; py += step) {
    for (let px = 0; px < offscreen.width; px += step) {
      const alpha = data[(py * offscreen.width + px) * 4 + 3];
      if (alpha >= 112) {
        points.push({ x: px / scale, y: py / scale });
      }
    }
  }

  const shadow = document.createElement('canvas');
  shadow.width = offscreen.width;
  shadow.height = offscreen.height;
  const sctx = shadow.getContext('2d');
  if (sctx) {
    sctx.scale(scale, scale);
    sctx.font = font;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.shadowColor = 'rgba(5, 10, 16, 0.96)';
    sctx.shadowBlur = 6;
    sctx.fillStyle = 'rgba(5, 10, 16, 0.65)';
    for (const { label, x, y } of glyphs) sctx.fillText(label, x, y);
  }

  const core = document.createElement('canvas');
  core.width = offscreen.width;
  core.height = offscreen.height;
  const cctx = core.getContext('2d');
  if (cctx) {
    cctx.scale(scale, scale);
    cctx.font = font;
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';
    cctx.fillStyle = '#fff9ec';
    for (const { label, x, y } of glyphs) cctx.fillText(label, x, y);
  }

  return { points, shadow, core, keycaps };
}

export const DustPrompt: React.FC<{ text: string; reducedMotion?: boolean }> = ({
  text,
  reducedMotion = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keycapLayerRef = useRef<HTMLDivElement>(null);
  const [keycaps, setKeycaps] = useState<PromptKeycap[]>([]);
  const keycapMotion = useRef({ targeted: false, opacity: 0 });
  const stateRef = useRef(createDustPromptState());
  const shadowRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<HTMLCanvasElement | null>(null);
  const spritesRef = useRef<HTMLCanvasElement[] | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const widthRef = useRef<number>(840);
  const propsRef = useRef({ text, reducedMotion });
  propsRef.current = { text, reducedMotion };

  const startLoop = () => {
    if (rafRef.current) return;
    lastTimeRef.current = 0;

    const tick = (now: number) => {
      const state = stateRef.current;
      const canvas = canvasRef.current;
      const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 1 / 60;
      lastTimeRef.current = now;

      stepDustPrompt(state, dt, propsRef.current.reducedMotion);
      const motion = keycapMotion.current;
      const previousOpacity = motion.opacity;
      motion.opacity = dustKeycapOpacity(previousOpacity, state.settleProgress, motion.targeted, dt, propsRef.current.reducedMotion);
      if (keycapLayerRef.current) keycapLayerRef.current.style.opacity = String(motion.opacity);
      if (!motion.targeted && previousOpacity > 0 && motion.opacity === 0) setKeycaps([]);

      if (canvas) {
        const ctx = canvas.getContext('2d');
        const width = widthRef.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

          if (shadowRef.current && state.settleProgress > 0.02) {
            ctx.save();
            ctx.globalAlpha = state.settleProgress * 0.48;
            ctx.drawImage(shadowRef.current, 0, 0, width, CANVAS_HEIGHT);
            ctx.restore();
          }

          if (coreRef.current && state.settleProgress > 0.55) {
            ctx.save();
            ctx.globalAlpha = ((state.settleProgress - 0.55) / 0.45) * 0.28;
            ctx.drawImage(coreRef.current, 0, 0, width, CANVAS_HEIGHT);
            ctx.restore();
          }

          const sprites = spritesRef.current ?? (spritesRef.current = createDustSprites());
          for (const p of state.particles) {
            if (p.alpha <= 0.01) continue;
            const settled = p.mode === 'converge' && Math.abs(p.tx - p.x) < 0.6 && Math.abs(p.ty - p.y) < 0.6;
            const shimmer = p.mode === 'converge' && !settled && !propsRef.current.reducedMotion
              ? Math.sin(p.age * 3.1 + p.tx * 0.13) * 0.08
              : 0;
            const drawRadius = p.size * (p.mode === 'disperse' ? 1.55 : 1.32);
            const sprite = sprites[p.tone] ?? sprites[0];
            ctx.globalAlpha = p.alpha * (settled ? 0.94 + Math.sin(p.age * 3.2) * 0.06 : 0.86 + Math.sin(p.age * 4.4) * 0.14);
            ctx.drawImage(
              sprite,
              p.x + shimmer - drawRadius,
              p.y - drawRadius,
              drawRadius * 2,
              drawRadius * 2,
            );
          }
          ctx.globalAlpha = 1;
        }
      }

      if (state.active || motion.opacity > 0) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
        shadowRef.current = null;
        coreRef.current = null;
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  };

  const syncPrompt = (value: string, width: number, reduce: boolean) => {
    const state = stateRef.current;
    const motion = keycapMotion.current;
    const { points, shadow, core, keycaps } = sampleGlyphs(value, width, CANVAS_HEIGHT);
    motion.targeted = keycaps.length > 0;
    if (motion.targeted || motion.opacity === 0) setKeycaps(keycaps);
    if (motion.targeted && state.text !== value.trim()) {
      motion.opacity = reduce ? 1 : 0;
      if (keycapLayerRef.current) keycapLayerRef.current.style.opacity = String(motion.opacity);
    }
    if (value.trim() || !state.particles.length) {
      shadowRef.current = shadow;
      coreRef.current = core;
    }
    setDustTargets(state, value, points, width / 2, TEXT_CENTER_Y, reduce);
    if (state.active || motion.opacity > 0) startLoop();
  };

  useEffect(() => {
    const syncLayout = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const measured = Math.max(280, Math.min(1040, Math.round(container.clientWidth || window.innerWidth - 24)));
      widthRef.current = measured;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(measured * dpr);
      canvas.height = Math.round(CANVAS_HEIGHT * dpr);
      canvas.style.width = `${measured}px`;
      canvas.style.height = `${CANVAS_HEIGHT}px`;

      syncPrompt(propsRef.current.text, measured, propsRef.current.reducedMotion);
    };

    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => {
      window.removeEventListener('resize', syncLayout);
    };
  }, []);

  useEffect(() => {
    syncPrompt(text, widthRef.current, reducedMotion);
  }, [text, reducedMotion]);

  useEffect(() => () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  return (
    <div ref={containerRef} className="orbital-dust-prompt">
      <canvas ref={canvasRef} className="orbital-dust-canvas" aria-hidden="true" />
      <div ref={keycapLayerRef} className="orbital-dust-keycaps" aria-hidden="true">
        {keycaps.map(({ key, x, y }) => <kbd key={key} className="orbital-dust-keycap" aria-hidden="true"
          style={{ left: `calc(50% + ${x}px)`, top: y }}>{key}</kbd>)}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{text}</p>
    </div>
  );
};
