/**
 * Term names from the server. The app ships with the syllabus's skeleton only (areas, units and
 * how many terms each has). At sign-in it asks for the names of the terms the learner has
 * reached, and every lesson, round or case brings the names of the terms it shows
 * (src/lib/modes/roundApi.ts). Nothing else: the app never holds the whole list.
 */
import { termById } from './content';
import { call } from './modes/roundApi';
import type { Progress } from './types';

/** Fetch the names of every term this account has reached. Resolves to null, or a sentence saying why not. */
export async function loadTerms(): Promise<string | null> {
  if (import.meta.env.DEV) {
    await import('./syllabus');
    return null;
  }
  try {
    await call('terms', {});
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Something went wrong.';
  }
}

let asking: Promise<unknown> | null = null;
let lastMissing = '';

/**
 * Ask again when the progress has met terms the app has no name for: progress synced from another
 * device, say. Asks once for each new set of missing terms, so a term the server won't name
 * doesn't make the app ask over and over.
 */
export function wantTerms(p: Progress): void {
  const missing = Object.keys(p.terms).filter((id) => !termById.has(id));
  const key = missing.sort().join('|');
  if (!missing.length || asking || key === lastMissing) return;
  lastMissing = key;
  asking = loadTerms().finally(() => {
    asking = null;
  });
}

/** Forget what was asked (signing in as someone else). */
export function resetTermAsks(): void {
  lastMissing = '';
}

/** Letters a search needs before it asks the server (worker/terms.ts, SEARCH_MIN). */
export const SEARCH_MIN = 3;

/**
 * Find terms by name among all of them, not only the ones the app knows. The names that come
 * back join what the app knows, so the glossary shows them. Resolves to whether more matched
 * than came back.
 */
export async function searchAll(q: string): Promise<{ more: boolean }> {
  if (q.replace(/[^a-z0-9]/gi, '').length < SEARCH_MIN) return { more: false };
  // `npm run dev` already knows every term.
  if (import.meta.env.DEV) return { more: false };
  const out = await call<{ more?: boolean }>('search', { q });
  return { more: !!out.more };
}
