export type ScreenPoint = { x: number; y: number; z: number };
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** Fit a whole-pixel 4:3 display inside the projected screen, never over its bezel. */
export function fitComputerDisplay(corners: readonly ScreenPoint[], viewport: { width: number; height: number }): ScreenRect | null {
  if (corners.length !== 4 || corners.some(p => ![p.x, p.y, p.z].every(Number.isFinite) || p.z < -1 || p.z > 1)) return null;
  const [tl, tr, bl, br] = corners;
  const left = Math.ceil(Math.max(0, tl.x, bl.x)), right = Math.floor(Math.min(viewport.width, tr.x, br.x));
  const top = Math.ceil(Math.max(0, tl.y, tr.y)), bottom = Math.floor(Math.min(viewport.height, bl.y, br.y));
  const width = Math.floor(Math.min(right - left, (bottom - top) * 4 / 3) / 4) * 4;
  if (width < 64) return null;
  const height = width * 3 / 4;
  return { left: Math.round(left + (right - left - width) / 2), top: Math.round(top + (bottom - top - height) / 2), width, height };
}
