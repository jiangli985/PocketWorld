import type { RodLevel } from './catalog.ts';

export const ROD_ART = {
  1: { length: 22, width: 1, shaft: '#d59c68', grip: '#79503c', metal: '#e8ba77', reel: false, bend: 4 },
  2: { length: 24, width: 1.25, shaft: '#75d0ba', grip: '#2e5e63', metal: '#c6ebd5', reel: true, bend: 6 },
  3: { length: 26, width: 1.6, shaft: '#d77d69', grip: '#613537', metal: '#ffd89a', reel: true, bend: 7 },
} as const;

export function drawRodDisplay(canvas: HTMLCanvasElement, level: RodLevel) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { shaft, grip, metal, reel, length } = ROD_ART[level];
  context.clearRect(0, 0, canvas.width, canvas.height);
  const tip = 15 - (length - 22) * 3;
  for (let y = tip; y < 57; y++) {
    const x = 21 - Math.floor((y - tip) / 5);
    context.fillStyle = '#191a26';
    context.fillRect(x - 1, y, 4, 1);
    context.fillStyle = y >= 46 ? grip : y % 11 < 2 ? metal : shaft;
    context.fillRect(x, y, y >= 37 ? 2 : 1, 1);
  }
  if (reel) {
    const x = 21 - Math.floor((47 - tip) / 5);
    context.fillStyle = grip;
    context.fillRect(x + 1, 46, 7, 7);
    context.fillStyle = metal;
    context.fillRect(x + 2, 47, 4, 4);
    context.fillStyle = shaft;
    context.fillRect(x + 6, 50, 3, 2);
  }
  context.fillStyle = metal;
  context.fillRect(21 - Math.floor((56 - tip) / 5), 57, 3, 1);
}
