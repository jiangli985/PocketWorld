const outfits = {
  everyday: { next: 'snowflower', hint: '换上雪花裙装' },
  snowflower: { next: 'cloudhoodie', hint: '换上云朵连帽衫' },
  cloudhoodie: { next: 'everyday', hint: '换回日常装' },
} as const;
export type ResidentOutfit = keyof typeof outfits;

export function readOutfit(value?: string | null): ResidentOutfit {
  return isOutfit(value) ? value : 'everyday';
}

function isOutfit(value?: string | null): value is ResidentOutfit {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(outfits, value);
}

export const nextOutfit = (current: ResidentOutfit) => outfits[current].next;
export const outfitHint = (current: ResidentOutfit = 'everyday') => outfits[current].hint;

const STORAGE_KEY = 'pocketworld:wardrobe:outfit';

export function previewOutfit(search: string): ResidentOutfit | null {
  const value = new URLSearchParams(search).get('outfit');
  return isOutfit(value) ? value : null;
}

export function initialOutfit(): ResidentOutfit {
  if (typeof window === 'undefined') return 'everyday';
  const preview = previewOutfit(window.location.search);
  if (preview) return preview;
  try {
    return readOutfit(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'everyday';
  }
}

export function rememberOutfit(outfit: ResidentOutfit) {
  try { window.localStorage.setItem(STORAGE_KEY, outfit); } catch { /* Keep the selection for this visit. */ }
  if (!previewOutfit(window.location.search)) return;
  const url = new URL(window.location.href);
  url.searchParams.set('outfit', outfit);
  try { window.history.replaceState(window.history.state, '', url); } catch { /* Embedded previews can restrict history updates. */ }
}
