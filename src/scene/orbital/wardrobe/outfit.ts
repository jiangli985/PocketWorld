export const outfitNames = {
  everyday: '日常装',
  ribbon: '蝴蝶结外套',
} as const;
export type ResidentOutfit = keyof typeof outfitNames;
export const outfitChoices = Object.keys(outfitNames) as ResidentOutfit[];

export function readOutfit(value?: string | null): ResidentOutfit {
  return isOutfit(value) ? value : 'everyday';
}

export function isOutfit(value?: string | null): value is ResidentOutfit {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(outfitNames, value);
}

const STORAGE_KEY = 'pocketworld:wardrobe:outfit';

export function previewOutfit(search: string): ResidentOutfit | null {
  const value = new URLSearchParams(search).get('outfit');
  if (value === 'snowflower' || value === 'cloudhoodie') return 'everyday';
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
