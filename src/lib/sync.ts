/**
 * Merging two copies of progress, say from a phone and a laptop, so neither
 * loses work. The merge keeps the further-along copy of each piece: the term
 * seen more often, the higher score, the later test, every ticked step.
 * Settings carry no dates, so they come from the second copy (`b`). A reset
 * or a restored backup marks a new start (`epoch`), and the newer start wins.
 *
 * The same function runs in the browser and in the Worker, and merging is
 * order-free for everything except settings, focus and the streak, so two
 * devices that sync in any order end up with the same progress.
 */
import type { DayStats, DrillRecord, Progress, TermState } from './types';

function byKey<T>(a: Record<string, T> | undefined, b: Record<string, T> | undefined, pick: (x: T, y: T) => T): Record<string, T> {
  const out: Record<string, T> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = k in out ? pick(out[k], v) : v;
  return out;
}

const later = (x: string | null | undefined, y: string | null | undefined) => ((x ?? '') >= (y ?? '') ? (x ?? null) : (y ?? null));
const max = (x: number | undefined, y: number | undefined) => (x === undefined ? y : y === undefined ? x : Math.max(x, y));
const min = (x: number | undefined, y: number | undefined) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));

function term(x: TermState, y: TermState): TermState {
  if (x.seen !== y.seen) return x.seen > y.seen ? x : y;
  return x.due >= y.due ? x : y;
}

function day(x: DayStats, y: DayStats): DayStats {
  return { xp: Math.max(x.xp, y.xp), newTerms: Math.max(x.newTerms, y.newTerms), reviews: Math.max(x.reviews, y.reviews), lessons: Math.max(x.lessons, y.lessons) };
}

function drill(x: DrillRecord, y: DrillRecord): DrillRecord {
  const out: DrillRecord = {
    rounds: Math.max(x.rounds, y.rounds),
    passed: x.passed || y.passed,
    bestRight: Math.max(x.bestRight, y.bestRight),
    last: later(x.last, y.last) ?? x.last,
  };
  const best = max(x.best, y.best);
  const bestMs = min(x.bestMs, y.bestMs);
  const snoozed = later(x.snoozed, y.snoozed);
  if (best !== undefined) out.best = best;
  if (bestMs !== undefined) out.bestMs = bestMs;
  if (snoozed) out.snoozed = snoozed;
  return out;
}

const union = (x: string[] | undefined, y: string[] | undefined) => [...new Set([...(x ?? []), ...(y ?? [])])].sort();

export function mergeProgress(a: Progress, b: Progress): Progress {
  // A reset or a restored backup starts over: the newer start wins outright, so old devices can't bring the old progress back.
  if ((a.epoch ?? 0) !== (b.epoch ?? 0)) return (a.epoch ?? 0) > (b.epoch ?? 0) ? a : b;
  const aLater = (a.lastActiveDay ?? '') > (b.lastActiveDay ?? '');
  const out: Progress = {
    ...a,
    ...b,
    version: 1,
    terms: byKey(a.terms, b.terms, term),
    settings: { ...a.settings, ...b.settings },
    xp: Math.max(a.xp, b.xp),
    streak: aLater ? a.streak : b.streak,
    lastActiveDay: later(a.lastActiveDay, b.lastActiveDay),
    days: byKey(a.days, b.days, day),
    lastBackup: later(a.lastBackup, b.lastBackup),
  };
  const unlocked = union(a.unlocked, b.unlocked);
  if (unlocked.length) out.unlocked = unlocked;
  if (a.tests || b.tests) out.tests = byKey(a.tests, b.tests, (x, y) => (x.date >= y.date ? x : y));
  if (a.drills || b.drills) out.drills = byKey(a.drills, b.drills, drill);
  if (a.phase3Key || b.phase3Key) out.phase3Key = true;
  if (a.projects || b.projects) out.projects = byKey(a.projects, b.projects, (x, y) => ({ done: [...new Set([...x.done, ...y.done])].sort((m, n) => m - n), reviewed: x.reviewed || y.reviewed }));
  if (a.mocks || b.mocks)
    out.mocks = byKey(a.mocks, b.mocks, (x, y) => {
      const best = x.best / x.total >= y.best / y.total ? x : y;
      return { ...best, tries: Math.max(x.tries, y.tries) };
    });
  return out;
}

/** Same progress, ignoring key order: used to skip needless saves and uploads. */
export function sameProgress(a: Progress, b: Progress): boolean {
  return stable(a) === stable(b);
}

function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .sort()
      .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x);
}
