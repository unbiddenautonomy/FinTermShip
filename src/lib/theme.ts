import { seasonFor } from './seasons';

/**
 * Light (ivory), seasonal, dark, or follow the device. Kept on this device only (each phone or
 * laptop can look different), and applied as data-theme on <html>, which the
 * colour tokens in index.css read. index.html applies it before first paint.
 *
 * Seasonal also sets data-season on <html> from the date (src/lib/seasons.ts). The
 * last season worked out is kept too, so index.html can paint it straight away;
 * the app works it out again on start and whenever the tab comes back into view.
 */
export type Theme = 'system' | 'light' | 'seasonal' | 'dark';
export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'dark', label: 'Dark' },
];
const KEY = 'fintermship-theme';
const SEASON_KEY = 'fintermship-season';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    // White was replaced by Seasonal, which falls back to the same plain white.
    if (t === 'white') return 'seasonal';
    return t === 'light' || t === 'seasonal' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme, now: Date = new Date()): void {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  const season = t === 'seasonal' ? seasonFor(now) : null;
  if (season) root.dataset.season = season;
  else delete root.dataset.season;
  try {
    if (season) localStorage.setItem(SEASON_KEY, season);
    else localStorage.removeItem(SEASON_KEY);
  } catch {
    // Storage blocked: index.html just paints plain white first.
  }
}

/** Re-apply the saved theme, so a seasonal look moves on with the date. */
export function refreshTheme(): void {
  const t = getTheme();
  if (t === 'seasonal') {
    try {
      localStorage.setItem(KEY, 'seasonal');
    } catch {
      // Storage blocked.
    }
  }
  applyTheme(t);
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
