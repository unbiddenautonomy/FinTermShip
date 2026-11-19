import { addDays, daysBetween } from './dates';
import type { DayStats, Progress, TermState } from './types';

/** Days until the next review after reaching each step (index = step). */
export const INTERVALS = [0, 1, 3, 7, 16, 35, 120];
export const MAX_STEP = INTERVALS.length - 1;
export const KNOWN_STEP = 4;
/** Core terms come back 20% sooner. */
export const CORE_FACTOR = 0.8;
/** Time to choose, once the question has been read: inside this, a right answer is a confident one. */
export const CHOOSE_MS = 6_000;
/** Reading pace used to work out how long a question takes to take in. */
export const READ_WPM = 220;
/** Time a worked sum takes on top of reading it. */
export const SUM_MS = 8_000;

export const TROUBLE_LAPSES = 3;
export const MAX_REVIEWS_PER_DAY = 80;

/** Words in a piece of text, for working out how long it takes to read. */
export const wordCount = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * How long a confident answer takes: time to read what is on the screen, plus a few seconds to
 * choose, plus anything else the question asks for (a sum). A flat limit held back anyone
 * reading at an ordinary pace, because the longest formats are the ones used at the higher steps.
 */
export function fastLimit(words = 0, extra = 0): number {
  return CHOOSE_MS + Math.round((words / READ_WPM) * 60_000) + extra;
}

export function intervalFor(step: number, core: boolean): number {
  const base = INTERVALS[Math.max(0, Math.min(step, MAX_STEP))];
  if (base === 0) return 0;
  return core ? Math.max(1, Math.round(base * CORE_FACTOR)) : base;
}

export function newProgress(): Progress {
  return {
    version: 1,
    terms: {},
    settings: { newPerDay: 20, voice: true },
    xp: 0,
    streak: 0,
    lastActiveDay: null,
    days: {},
    lastBackup: null,
  };
}

export function dayStats(p: Progress, today: string): DayStats {
  return p.days[today] ?? { xp: 0, newTerms: 0, reviews: 0, lessons: 0 };
}

function withDay(p: Progress, today: string, change: Partial<DayStats>): Progress {
  const cur = dayStats(p, today);
  const next: DayStats = {
    xp: cur.xp + (change.xp ?? 0),
    newTerms: cur.newTerms + (change.newTerms ?? 0),
    reviews: cur.reviews + (change.reviews ?? 0),
    lessons: cur.lessons + (change.lessons ?? 0),
  };
  return { ...p, days: { ...p.days, [today]: next } };
}

/** First time a term is shown: it sits at step 0, due today. */
export function introduce(p: Progress, termId: string, today: string): Progress {
  if (p.terms[termId]) return p;
  const state: TermState = {
    step: 0,
    due: today,
    seen: 0,
    correct: 0,
    wrong: 0,
    lapses: 0,
    trouble: false,
    introduced: today,
  };
  return withDay({ ...p, terms: { ...p.terms, [termId]: state } }, today, { newTerms: 1 });
}

/** Tally an answer without moving the term on the ladder (used for practice inside a lesson). */
export function recordPractice(p: Progress, termId: string, correct: boolean): Progress {
  const s = p.terms[termId];
  if (!s) return p;
  const next = { ...s, seen: s.seen + 1, correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) };
  return { ...p, terms: { ...p.terms, [termId]: next } };
}

/** Finish learning a newly met term: it moves to step 1 and comes back tomorrow. */
export function graduate(p: Progress, termId: string, today: string): Progress {
  const s = p.terms[termId];
  if (!s || s.step !== 0) return p;
  const next = { ...s, step: 1, due: addDays(today, 1) };
  return { ...p, terms: { ...p.terms, [termId]: next } };
}

/**
 * Apply a scheduled review answer.
 * Fast and correct: up one step. Slow correct: same step, rescheduled.
 * Wrong: down two steps (never below 1) and back tomorrow.
 */
export function review(
  p: Progress,
  termId: string,
  correct: boolean,
  ms: number,
  today: string,
  core: boolean,
  /** What a confident answer takes for this question; the caller works it out with fastLimit. */
  limit: number = fastLimit(),
): Progress {
  const s = p.terms[termId];
  if (!s) return p;
  let step = s.step;
  let lapses = s.lapses;
  let due: string;
  if (correct) {
    if (ms < limit || step === 0) step = Math.min(MAX_STEP, step + 1);
    due = addDays(today, Math.max(1, intervalFor(step, core)));
  } else {
    step = Math.max(1, step - 2);
    lapses += 1;
    due = addDays(today, 1);
  }
  const next: TermState = {
    ...s,
    step,
    due,
    lapses,
    trouble: s.trouble || lapses >= TROUBLE_LAPSES,
    seen: s.seen + 1,
    correct: s.correct + (correct ? 1 : 0),
    wrong: s.wrong + (correct ? 0 : 1),
  };
  const out = { ...p, terms: { ...p.terms, [termId]: next } };
  return withDay(out, today, { reviews: 1 });
}

/**
 * A term is due once its review date arrives. That includes a term left at step 0 when its
 * first lesson was not finished: its first review finishes it. Every mode uses this one test.
 */
export function isDueOn(s: TermState | undefined, today: string): boolean {
  return !!s && s.due <= today;
}

/** Terms due on or before today, oldest due first, then lowest step. A lesson fetches their cards as it starts. */
export function dueTermIds(p: Progress, today: string): string[] {
  return Object.entries(p.terms)
    .filter(([, s]) => isDueOn(s, today))
    .sort((a, b) => (a[1].due === b[1].due ? a[1].step - b[1].step : a[1].due < b[1].due ? -1 : 1))
    .map(([id]) => id);
}

/** Reviews still allowed today, after the daily cap. */
export function reviewsLeftToday(p: Progress, today: string): number {
  return Math.max(0, MAX_REVIEWS_PER_DAY - dayStats(p, today).reviews);
}

/** Reviews due today that the daily cap will not reach. */
export function reviewOverflow(p: Progress, today: string): number {
  return Math.max(0, dueTermIds(p, today).length - reviewsLeftToday(p, today));
}

/** Share of today's reviews assumed to be missed or slow, and so back tomorrow. */
export const BACK_TOMORROW_SHARE = 0.2;

/**
 * Reviews tomorrow already looks set to hold: terms booked for it, today's
 * reviews the cap won't reach, and a share of today's reviews coming back.
 */
export function tomorrowLoad(p: Progress, today: string): number {
  const tomorrow = addDays(today, 1);
  let booked = 0;
  let waiting = 0;
  for (const s of Object.values(p.terms)) {
    if (s.due <= today) waiting++;
    else if (s.due <= tomorrow) booked++;
  }
  const reachable = Math.min(waiting, reviewsLeftToday(p, today));
  return booked + (waiting - reachable) + Math.ceil(reachable * BACK_TOMORROW_SHARE);
}

/** How many days ahead the new-term cap looks: a new term comes back tomorrow, then again 2 to 3 days after. */
export const LOOK_AHEAD_DAYS = 4;

/**
 * The heaviest review day coming up, from tomorrow to LOOK_AHEAD_DAYS out.
 * Each day holds the terms booked for it, plus a share of the day before
 * coming back, plus anything the day before couldn't fit under the cap.
 */
export function peakLoadAhead(p: Progress, today: string): number {
  const booked = new Map<string, number>();
  for (const s of Object.values(p.terms)) booked.set(s.due, (booked.get(s.due) ?? 0) + 1);
  let load = tomorrowLoad(p, today);
  let peak = load;
  for (let k = 2; k <= LOOK_AHEAD_DAYS; k++) {
    const done = Math.min(load, MAX_REVIEWS_PER_DAY);
    load = (booked.get(addDays(today, k)) ?? 0) + (load - done) + Math.ceil(done * BACK_TOMORROW_SHARE);
    peak = Math.max(peak, load);
  }
  return peak;
}

/**
 * New terms still allowed today. Each new term comes back for review tomorrow
 * and again a few days later, so new terms stop once any of the next few days
 * would pass the daily review cap. When more reviews are due today than the cap
 * can clear, new terms also slow down by one for each review left over, so a
 * backlog cannot snowball.
 */
export function newLeftToday(p: Progress, today: string): number {
  const base = Math.max(0, p.settings.newPerDay - dayStats(p, today).newTerms);
  const room = MAX_REVIEWS_PER_DAY - peakLoadAhead(p, today);
  return Math.max(0, Math.min(base - reviewOverflow(p, today), room));
}

/** Close a lesson: XP, lesson count and the streak. */
export function finishLesson(p: Progress, today: string, xp: number): Progress {
  let streak = p.streak;
  if (p.lastActiveDay !== today) {
    const gap = p.lastActiveDay ? daysBetween(p.lastActiveDay, today) : Infinity;
    streak = gap === 1 ? streak + 1 : 1;
  }
  const out = { ...p, xp: p.xp + xp, streak, lastActiveDay: today };
  return withDay(out, today, { xp, lessons: 1 });
}

/** Streak shown on Home: it lapses if yesterday was missed. */
export function currentStreak(p: Progress, today: string): number {
  if (!p.lastActiveDay) return 0;
  return daysBetween(p.lastActiveDay, today) <= 1 ? p.streak : 0;
}

export function isKnown(s: TermState | undefined): boolean {
  return !!s && s.step >= KNOWN_STEP;
}

/**
 * Known today: high enough on the ladder and not waiting on a review. A known term that falls due
 * counts as Due until it is reviewed, so every met term is exactly one of Learning, Due or Known,
 * and the KPI strip, the metro stations and the Exchange's blue chips always add up the same way.
 */
export function isKnownOn(s: TermState | undefined, today: string): boolean {
  return isKnown(s) && !isDueOn(s, today);
}
