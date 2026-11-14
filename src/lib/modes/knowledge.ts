/**
 * The knowledge layer every mode shares. Path, Term Lines, Call It, Recall Exchange, Headline
 * Desk and Finnections all read the same per-term record (Progress.terms) and write to it only through
 * recordAnswer, so what you know is the same whichever mode you open.
 */
import { categories, isCore, isPhase3Area } from '../content';
import { addDays, daysBetween } from '../dates';
import { phase3Open } from '../phase3';
import { intervalFor, isDueOn, isKnownOn, KNOWN_STEP, MAX_STEP, recordPractice, review } from '../scheduler';
import type { Progress, Question, TermState } from '../types';

import { MODES, type ModeId } from './ids';
export { MODES, type ModeId };

/** Where the app opens: the learner's choice in Settings (any mode), or Path. A mode the admin switched off for everyone falls back to Path. */
export function landingMode(p: Progress, off: readonly string[] = []): ModeId {
  const m = p.settings.landing;
  return m && MODES.includes(m) && !off.includes(m) ? m : 'path';
}

/**
 * How much a right answer proves.
 * weak: can be guessed half the time (a true/false claim).
 * medium: recognising the meaning among options.
 * strong: producing or using the term (name it, fill the gap, a sum, desk talk).
 */
export type Evidence = 'weak' | 'medium' | 'strong';

export function evidenceOf(kind: Question['kind'] | 'claim' | 'transfer'): Evidence {
  switch (kind) {
    case 'tf':
    case 'claim':
      return 'weak';
    case 'meaning':
    case 'listen':
    case 'match':
    case 'transfer':
      return 'medium';
    default:
      return 'strong';
  }
}

export interface ModeRecord {
  sessions: number;
  answers: number;
  right: number;
  /** Day of the latest session (YYYY-MM-DD). */
  last?: string;
  /** Call It: longest run of right calls. */
  bestRun?: number;
  /** Recall Exchange, first version: the average-strength index. Kept so old records still sync; no longer shown. */
  indexHigh?: number;
  history?: Record<string, number>;
  /** Recall Exchange: the index (0 to 1000) at its latest reading each day, and its highest. */
  closes?: Record<string, number>;
  top?: number;
  /** Recall Exchange: every price at the latest visit, and at the latest visit on an earlier day, for each stock's change. */
  marks?: Marks;
  prevMarks?: Marks;
  /** Headline Desk and Finnections: the level rounds are played at, good rounds in a row towards the next, and the day each item was last played. */
  level?: number;
  good?: number;
  seen?: Record<string, string>;
}

export interface Marks {
  day: string;
  prices: Record<string, number>;
}

export type ModeRecords = Partial<Record<ModeId, ModeRecord>>;

const emptyRecord = (): ModeRecord => ({ sessions: 0, answers: 0, right: 0 });

export function modeRecord(p: Progress, mode: ModeId): ModeRecord {
  return p.modes?.[mode] ?? emptyRecord();
}

function withMode(p: Progress, mode: ModeId, change: (r: ModeRecord) => ModeRecord): Progress {
  return { ...p, modes: { ...(p.modes ?? {}), [mode]: change(modeRecord(p, mode)) } };
}

export interface Answer {
  termId: string;
  correct: boolean;
  ms: number;
  evidence: Evidence;
  mode: ModeId;
  /**
   * True when the answer can't stand as the term's review: the term is being taught in this
   * session, the question is a match round or the retry of a missed question, or the learner
   * chose a practice round, which never moves the schedule.
   */
  practice?: boolean;
}

/**
 * The one way any mode, Path included, reports an answer.
 * The first medium or strong answer on a due term is its scheduled review; anything else is practice and the
 * ladder doesn't move. Because a review always books the next date for tomorrow or later,
 * a term can move on the ladder at most once a day, whichever modes are used.
 * Weak evidence (a true/false call) never moves the ladder; only strong evidence can make a term Known.
 * Path's answers are not tallied separately: answerSources works out Path's share.
 */
export function recordAnswer(p: Progress, a: Answer, today: string): Progress {
  const s = p.terms[a.termId];
  if (!s) return p;
  let out: Progress;
  if (a.evidence === 'weak' && !a.practice) {
    // A true/false call can be guessed half the time, so it never stands as a review. A right call
    // is practice. A wrong one flags the term: it comes back tomorrow for a proper review, without
    // losing its step, so one unlucky call can't undo what the learner has shown.
    out = recordPractice(p, a.termId, a.correct);
    const tomorrow = addDays(today, 1);
    if (!a.correct && s.due > tomorrow) out = { ...out, terms: { ...out.terms, [a.termId]: { ...out.terms[a.termId], due: tomorrow } } };
  } else if (!a.practice && isDueOn(s, today)) {
    const core = isCore(a.termId);
    out = review(p, a.termId, a.correct, a.ms, today, core);
    const next = out.terms[a.termId];
    if (a.correct && a.evidence !== 'strong' && s.step < KNOWN_STEP && next.step >= KNOWN_STEP) {
      const step = KNOWN_STEP - 1;
      out = { ...out, terms: { ...out.terms, [a.termId]: { ...next, step, due: addDays(today, Math.max(1, intervalFor(step, core))) } } };
    }
  } else {
    out = recordPractice(p, a.termId, a.correct);
  }
  if (a.mode === 'path') return out;
  return withMode(out, a.mode, (r) => ({ ...r, answers: r.answers + 1, right: r.right + (a.correct ? 1 : 0) }));
}

/** Close a session in a mode. The shared streak and XP are handled by finishLesson, as for Path. */
export function finishModeSession(p: Progress, mode: ModeId, today: string, extra: Partial<ModeRecord> = {}): Progress {
  return withMode(p, mode, (r) => {
    const out: ModeRecord = { ...r, sessions: r.sessions + 1, last: today };
    if (extra.bestRun !== undefined) out.bestRun = Math.max(r.bestRun ?? 0, extra.bestRun);
    if (extra.level !== undefined) out.level = extra.level;
    if (extra.good !== undefined) out.good = extra.good;
    if (extra.seen !== undefined) out.seen = extra.seen;
    return out;
  });
}

/** Full price of a term held cleanly at a ladder step (step 0, met today, is 5). */
function heldAt(step: number): number {
  return step <= 0 ? 5 : 100 * Math.pow(step / MAX_STEP, 0.7);
}

/** A met term never trades below this, however long it sits overdue: it was learned once. */
export const STRENGTH_FLOOR = 5;
/** Overdue strength halves at most this often, so a young term isn't wiped out within days. */
export const MIN_HALF_LIFE = 3;

/**
 * Strength, 0 to 100: how firmly a term is held today. Nothing new is stored; it is read from
 * the ladder step, the term's record and the due date.
 * - The step sets the full price. A shaky record (wrong answers among the right ones) takes up
 *   to half the gap to the step below off it, so two terms on the same step can differ.
 * - It holds until the term falls due, then halves for each review interval it sits overdue
 *   (never faster than every MIN_HALF_LIFE days), and never drops below STRENGTH_FLOOR.
 */
export function strength(s: TermState | undefined, today: string, core = false): number {
  if (!s) return 0;
  if (s.step === 0) return STRENGTH_FLOOR;
  const top = heldAt(s.step);
  const below = heldAt(s.step - 1);
  const answered = s.correct + s.wrong;
  const accuracy = answered ? s.correct / answered : 1;
  const held = top - ((1 - accuracy) * (top - below)) / 2;
  const overdue = Math.max(0, daysBetween(s.due, today));
  const halfLife = Math.max(MIN_HALF_LIFE, intervalFor(s.step, core));
  return Math.max(STRENGTH_FLOOR, Math.round(held * Math.pow(2, -overdue / halfLife)));
}

/** Term ids the learner can reach now: everything outside phase 3, and phase 3 once it is open. */
export function openTermIds(p: Progress): string[] {
  const open3 = phase3Open(p);
  return categories.filter((c) => open3 || !isPhase3Area(c.id)).flatMap((c) => c.terms.map((t) => t.id));
}

export interface Kpis {
  /** Terms at step 4 or above and not due, of all open terms. */
  known: number;
  open: number;
  /** Met terms due for a review today (or overdue): the due stations on Lines and the falling stocks on the Exchange. */
  due: number;
  /** Met terms neither Known nor Due. known + due + learning = met. */
  learning: number;
  /** Average strength of every met term, 0 to 100. */
  strength: number;
  /** Terms met, of all open terms. */
  met: number;
  coverage: number;
}

/** The four shared numbers. Every mode shows exactly these, read from the same record. */
export function kpis(p: Progress, today: string): Kpis {
  const open = openTermIds(p);
  let known = 0;
  let due = 0;
  let met = 0;
  let total = 0;
  for (const id of open) {
    const s = p.terms[id];
    if (!s) continue;
    met++;
    if (isDueOn(s, today)) due++;
    else if (isKnownOn(s, today)) known++;
    total += strength(s, today, isCore(id));
  }
  return {
    known,
    open: open.length,
    due,
    learning: met - known - due,
    strength: met ? Math.round((total / met) * 10) / 10 : 0,
    met,
    coverage: open.length ? met / open.length : 0,
  };
}

/** Coverage and strength by area, for the Progress screen, the metro lines and the Exchange sectors. */
export function areaKpis(p: Progress, today: string) {
  const open3 = phase3Open(p);
  return categories
    .filter((c) => c.terms.length > 0 && (open3 || !isPhase3Area(c.id)))
    .map((c) => {
      let met = 0;
      let known = 0;
      let due = 0;
      let total = 0;
      for (const t of c.terms) {
        const s = p.terms[t.id];
        if (!s) continue;
        met++;
        if (isDueOn(s, today)) due++;
        else if (isKnownOn(s, today)) known++;
        total += strength(s, today, isCore(t.id));
      }
      return { id: c.id, name: c.name, terms: c.terms.length, met, known, due, strength: met ? Math.round((total / met) * 10) / 10 : 0 };
    });
}

export interface AnswerSource {
  mode: ModeId;
  answers: number;
  right: number;
  /** Sessions finished; not kept for Path, whose lessons, drills and tests are counted elsewhere. */
  sessions?: number;
  last?: string;
}

/**
 * Where the learner's answers came from. The other modes keep their own tallies; Path's share
 * is everything else in the term record, so Path needs no new field and old progress still adds up.
 */
export function answerSources(p: Progress): AnswerSource[] {
  let answers = 0;
  let right = 0;
  for (const s of Object.values(p.terms)) {
    answers += s.correct + s.wrong;
    right += s.correct;
  }
  const others = MODES.filter((m) => m !== 'path').map((m) => {
    const r = modeRecord(p, m);
    return { mode: m, answers: r.answers, right: r.right, sessions: r.sessions, last: r.last };
  });
  const pathAnswers = Math.max(0, answers - others.reduce((n, o) => n + o.answers, 0));
  const pathRight = Math.min(pathAnswers, Math.max(0, right - others.reduce((n, o) => n + o.right, 0)));
  return [{ mode: 'path', answers: pathAnswers, right: pathRight }, ...others];
}
