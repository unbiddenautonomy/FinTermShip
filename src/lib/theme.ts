/**
 * Light, dark or follow the device. Kept on this device only (each phone or
 * laptop can look different), and applied as data-theme on <html>, which the
 * colour tokens in index.css read. index.html applies it before first paint.
 */
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const KEY = 'fintermship-theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage blocked: the choice still holds until the app closes.
  }
  applyTheme(t);
}
