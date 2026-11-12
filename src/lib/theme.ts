/**
 * Light (ivory), white, dark, or follow the device. Kept on this device only (each phone or
 * laptop can look different), and applied as data-theme on <html>, which the
 * colour tokens in index.css read. index.html applies it before first paint.
 */
export type Theme = 'system' | 'light' | 'white' | 'dark';
export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'white', label: 'White' },
  { id: 'dark', label: 'Dark' },
];
const KEY = 'fintermship-theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'white' || t === 'dark' ? t : 'system';
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

const TEXTURE_KEY = 'fintermship-texture';

/** The paper and brushed-copper texture: on unless turned off on this device. */
export function getTexture(): boolean {
  try {
    return localStorage.getItem(TEXTURE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTexture(on: boolean): void {
  try {
    if (on) localStorage.removeItem(TEXTURE_KEY);
    else localStorage.setItem(TEXTURE_KEY, 'off');
  } catch {
    // Storage blocked: the choice still holds until the app closes.
  }
  if (on) delete document.documentElement.dataset.texture;
  else document.documentElement.dataset.texture = 'off';
}
