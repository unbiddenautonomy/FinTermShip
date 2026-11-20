/**
 * Open everything (Settings, the admin's switch) opens every area and phase 3, and makes the
 * modes and practice rounds treat every term as met, as if the learner had learnt them all.
 * Only the modes see that: the path still teaches each term (lessons work as before), and the
 * Exchange, the counts and the saved progress stay the learner's own.
 */
import { addDays } from './dates';
import { path } from './content';
import type { Progress, TermState } from './types';

/** A term the learner hasn't met, as the modes see it while everything is open: learnt, not due. */
const assumed = (today: string): TermState => ({ step: 1, due: addDays(today, 1), seen: 0, correct: 0, wrong: 0, lapses: 0, trouble: false, introduced: today });

/** Progress as the modes see it: with Open everything on, every term the app knows is met. */
export function asIfAllMet(p: Progress, today: string): Progress {
  if (!p.settings?.openAll) return p;
  let terms: Record<string, TermState> | null = null;
  for (const r of path) {
    for (const t of r.terms) {
      if (p.terms[t.id]) continue;
      terms ??= { ...p.terms };
      terms[t.id] = assumed(today);
    }
  }
  return terms ? { ...p, terms } : p;
}

/**
 * Progress a mode handed back, made from `asIfAllMet`, with the terms it only assumed taken out,
 * so they are never saved as met. A mode never meets a term itself (only a lesson does), so a
 * term the learner's own progress hasn't got is one of those.
 */
export function withoutAssumed(p: Progress, own: Progress): Progress {
  if (!own.settings?.openAll) return p;
  const extra = Object.keys(p.terms).filter((id) => !own.terms[id]);
  if (!extra.length) return p;
  const terms = { ...p.terms };
  for (const id of extra) delete terms[id];
  return { ...p, terms };
}
