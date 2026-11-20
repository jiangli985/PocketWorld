export type ResidentOutfit = 'everyday' | 'snowflower';

const STORAGE_KEY = 'pocketworld:wardrobe:outfit';

export function previewOutfit(search: string): ResidentOutfit | null {
  const value = new URLSearchParams(search).get('outfit');
  return value === 'everyday' || value === 'snowflower' ? value : null;
}

export function initialOutfit(): ResidentOutfit {
  if (typeof window === 'undefined') return 'everyday';
  const preview = previewOutfit(window.location.search);
  if (preview) return preview;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'snowflower' ? 'snowflower' : 'everyday';
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

export const outfitHint = (snowflower: boolean) => snowflower ? '换回日常装' : '换上雪花裙装';
