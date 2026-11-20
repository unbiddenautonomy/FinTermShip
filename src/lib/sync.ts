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
import type { Marks, ModeId, ModeRecord, ModeRecords } from './modes/knowledge';
import type { DayStats, DrillRecord, Progress, TermState } from './types';

function byKey<T>(a: Record<string, T> | undefined, b: Record<string, T> | undefined, pick: (x: T, y: T) => T): Record<string, T> {
  const out: Record<string, T> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = k in out ? pick(out[k], v) : v;
  return out;
}

const later = (x: string | null | undefined, y: string | null | undefined) => ((x ?? '') >= (y ?? '') ? (x ?? null) : (y ?? null));
const max = (x: number | undefined, y: number | undefined) => (x === undefined ? y : y === undefined ? x : Math.max(x, y));
const min = (x: number | undefined, y: number | undefined) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));

/**
 * The copy further along. `moves` counts the times a term's schedule has been moved and only
 * ever goes up, so more moves means more of the learner's work. Nothing else can stand in for
 * it: practice raises the number of answers without moving the schedule, a lapse pulls the next
 * date earlier rather than later, and the step goes both ways.
 *
 * Copies with the same count either agree or were both moved while the devices were apart, and
 * a copy saved before `moves` existed has none, counted as 0. Both fall back to the same tests:
 * a lapse wins, because being asked again is the safe way to be wrong; then the later next date,
 * which means more steps climbed; then more answers. The last test keeps the merge order-free.
 */
function term(x: TermState, y: TermState): TermState {
  const mx = x.moves ?? 0;
  const my = y.moves ?? 0;
  if (mx !== my) return mx > my ? x : y;
  if (x.lapses !== y.lapses) return x.lapses > y.lapses ? x : y;
  if (x.due !== y.due) return x.due > y.due ? x : y;
  if (x.seen !== y.seen) return x.seen > y.seen ? x : y;
  return stable(x) >= stable(y) ? x : y;
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
  if (a.modes || b.modes) out.modes = mergeModes(a.modes ?? {}, b.modes ?? {});
  if (a.easyQuiz || b.easyQuiz) {
    // Terms missed on either device stay missed, and the quiz is done once either finished or skipped it.
    const done = later(a.easyQuiz?.done, b.easyQuiz?.done);
    out.easyQuiz = { missed: union(a.easyQuiz?.missed, b.easyQuiz?.missed), ...(done ? { done } : {}) };
  }
  return out;
}

/** Per-mode records from two devices: counts and records take the larger, the index history keeps every day (the higher reading if both have one) and the days items were played keep the later day, so the merge is order-free. */
function mergeModes(a: ModeRecords, b: ModeRecords): ModeRecords {
  const out: ModeRecords = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<ModeId>) {
    const x = a[id];
    const y = b[id];
    if (!x || !y) {
      out[id] = (x ?? y)!;
      continue;
    }
    const r: ModeRecord = { sessions: Math.max(x.sessions, y.sessions), answers: Math.max(x.answers, y.answers), right: Math.max(x.right, y.right) };
    const last = later(x.last ?? null, y.last ?? null);
    if (last) r.last = last;
    const bestRun = max(x.bestRun, y.bestRun);
    if (bestRun !== undefined) r.bestRun = bestRun;
    const indexHigh = max(x.indexHigh, y.indexHigh);
    if (indexHigh !== undefined) r.indexHigh = indexHigh;
    if (x.history || y.history) r.history = byKey(x.history, y.history, Math.max);
    if (x.closes || y.closes) r.closes = byKey(x.closes, y.closes, Math.max);
    const top = max(x.top, y.top);
    if (top !== undefined) r.top = top;
    const marks = laterMarks(x.marks, y.marks);
    if (marks) r.marks = marks;
    const prevMarks = laterMarks(x.prevMarks, y.prevMarks);
    if (prevMarks) r.prevMarks = prevMarks;
    if (x.seen || y.seen) r.seen = byKey(x.seen, y.seen, (m, n) => (m >= n ? m : n));
    const { level, good } = levelOf(x, y);
    if (level !== undefined) r.level = level;
    if (good !== undefined) r.good = good;
    out[id] = r;
  }
  return out;
}

/**
 * The level Headline Desk and Finnections play at, and the run of good rounds towards the next.
 * They follow the copy that played most recently, because a round can move the level either way;
 * on the same day the further-along copy wins, so the merge is order-free. A copy from before
 * levels were kept has none, and the one that has a level is used.
 */
function levelOf(x: ModeRecord, y: ModeRecord): Pick<ModeRecord, 'level' | 'good'> {
  if (x.level === undefined || y.level === undefined) {
    const held = x.level === undefined ? y : x;
    return { level: held.level, good: held.good };
  }
  const xDay = x.last ?? '';
  const yDay = y.last ?? '';
  const fresh = xDay !== yDay ? (xDay > yDay ? x : y) : x.level !== y.level ? (x.level > y.level ? x : y) : (x.good ?? 0) >= (y.good ?? 0) ? x : y;
  return { level: fresh.level, good: fresh.good };
}

/** The later of two price snapshots; on the same day, a fixed pick so the merge is order-free. */
function laterMarks(x: Marks | undefined, y: Marks | undefined): Marks | undefined {
  if (!x || !y) return x ?? y;
  if (x.day !== y.day) return x.day > y.day ? x : y;
  return stable(x) >= stable(y) ? x : y;
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
