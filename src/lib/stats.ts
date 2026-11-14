/** Numbers for the Progress screen. Everything here is read from Progress; nothing is stored. */
import { categories, isPhase3Area, practiceKind, unitById } from './content';
import { addDays, daysBetween } from './dates';
import { phase3Open } from './phase3';
import { isKnown, isKnownOn } from './scheduler';
import type { PracticeKind, Progress } from './types';

export interface AreaStat {
  id: string;
  name: string;
  total: number;
  met: number;
  known: number;
  right: number;
  wrong: number;
}

/**
 * Each term area the learner can see: how many terms are met and known, and how often answers on them were right.
 * With `today`, Known leaves out terms due for review, as the KPI strip does.
 */
export function areaStats(p: Progress, today?: string): AreaStat[] {
  const open3 = phase3Open(p);
  return categories
    .filter((c) => c.terms.length > 0 && (open3 || !isPhase3Area(c.id)))
    .map((c) => {
      const s = { id: c.id, name: c.name, total: c.terms.length, met: 0, known: 0, right: 0, wrong: 0 };
      for (const t of c.terms) {
        const st = p.terms[t.id];
        if (!st) continue;
        s.met++;
        if (today ? isKnownOn(st, today) : isKnown(st)) s.known++;
        s.right += st.correct;
        s.wrong += st.wrong;
      }
      return s;
    });
}

/** Share of answers right, or null when there are none yet. */
export const accuracy = (right: number, wrong: number): number | null => (right + wrong ? right / (right + wrong) : null);

export interface WeekStat {
  /** First day of the week (YYYY-MM-DD). */
  start: string;
  /** Terms first met that week. */
  added: number;
  /** Terms met by the end of that week. */
  total: number;
  xp: number;
}

/** The last `weeks` weeks, oldest first, each ending on a day `today` is a multiple of 7 days after. */
export function weeklyStats(p: Progress, today: string, weeks = 12): WeekStat[] {
  const first = addDays(today, -(weeks * 7 - 1));
  const out: WeekStat[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(first, i * 7), added: 0, total: 0, xp: 0 }));
  let before = 0;
  for (const s of Object.values(p.terms)) {
    const d = daysBetween(first, s.introduced);
    if (d < 0) before++;
    else if (d < weeks * 7) out[Math.floor(d / 7)].added++;
  }
  for (const [day, s] of Object.entries(p.days)) {
    const d = daysBetween(first, day);
    if (d >= 0 && d < weeks * 7) out[Math.floor(d / 7)].xp += s.xp;
  }
  let run = before;
  for (const w of out) w.total = run += w.added;
  return out;
}

export interface PracticeBest {
  unitId: string;
  name: string;
  kind: PracticeKind;
  passed: boolean;
  rounds: number;
  bestRight: number;
  bestMs?: number;
  best?: number;
  last: string;
}

/** Every drill, game and case played, passed ones first, then by name. */
export function practiceBests(p: Progress): PracticeBest[] {
  return Object.entries(p.drills ?? {})
    .filter(([id]) => unitById.has(id) && practiceKind(id))
    .map(([id, r]) => ({ unitId: id, name: unitById.get(id)!.name, kind: practiceKind(id)!, passed: r.passed, rounds: r.rounds, bestRight: r.bestRight, bestMs: r.bestMs, best: r.best, last: r.last }))
    .sort((a, b) => Number(b.passed) - Number(a.passed) || a.name.localeCompare(b.name));
}

/** Headline counts. */
export function totals(p: Progress, today?: string) {
  const states = Object.values(p.terms);
  const right = states.reduce((n, s) => n + s.correct, 0);
  const wrong = states.reduce((n, s) => n + s.wrong, 0);
  return {
    met: states.length,
    known: states.filter((s) => (today ? isKnownOn(s, today) : isKnown(s))).length,
    mastered: states.filter((s) => s.step >= 6).length,
    right,
    wrong,
    daysPractised: Object.values(p.days).filter((d) => d.lessons > 0).length,
  };
}
