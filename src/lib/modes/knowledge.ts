/**
 * The knowledge layer every mode shares. Path, Term Lines, Call It and Recall Exchange
 * all read the same per-term record (Progress.terms) and write to it only through
 * recordAnswer, so what you know is the same whichever mode you open.
 */
import { categories, isCore, isPhase3Area } from '../content';
import { addDays, daysBetween } from '../dates';
import { phase3Open } from '../phase3';
import { dueTermIds, intervalFor, isKnown, KNOWN_STEP, MAX_STEP, recordPractice, review, reviewsLeftToday } from '../scheduler';
import type { Progress, Question, TermState } from '../types';

export type ModeId = 'path' | 'lines' | 'callit' | 'exchange';
export const MODES: ModeId[] = ['path', 'lines', 'callit', 'exchange'];

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
  /** Recall Exchange: highest index reached, and the index once a day for the chart. */
  indexHigh?: number;
  history?: Record<string, number>;
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
}

/**
 * The one way any mode reports an answer.
 * A term that is due today gets a scheduled review; otherwise the answer is practice and the
 * ladder doesn't move. Because a review always books the next date for tomorrow or later,
 * a term can move on the ladder at most once a day, whichever modes are used.
 * Weak evidence never steps a term up; only strong evidence can make a term Known.
 */
export function recordAnswer(p: Progress, a: Answer, today: string): Progress {
  const s = p.terms[a.termId];
  if (!s) return p;
  let out: Progress;
  if (s.step > 0 && s.due <= today) {
    const core = isCore(a.termId);
    // A weak right answer counts like a slow one: it holds the step and reschedules.
    out = review(p, a.termId, a.correct, a.evidence === 'weak' ? Number.POSITIVE_INFINITY : a.ms, today, core);
    const next = out.terms[a.termId];
    if (a.correct && a.evidence !== 'strong' && s.step < KNOWN_STEP && next.step >= KNOWN_STEP) {
      const step = KNOWN_STEP - 1;
      out = { ...out, terms: { ...out.terms, [a.termId]: { ...next, step, due: addDays(today, Math.max(1, intervalFor(step, core))) } } };
    }
  } else {
    out = recordPractice(p, a.termId, a.correct);
  }
  return withMode(out, a.mode, (r) => ({ ...r, answers: r.answers + 1, right: r.right + (a.correct ? 1 : 0) }));
}

/** Close a session in a mode. The shared streak and XP are handled by finishLesson, as for Path. */
export function finishModeSession(p: Progress, mode: ModeId, today: string, extra: Partial<ModeRecord> = {}): Progress {
  return withMode(p, mode, (r) => {
    const out: ModeRecord = { ...r, sessions: r.sessions + 1, last: today };
    if (extra.bestRun !== undefined) out.bestRun = Math.max(r.bestRun ?? 0, extra.bestRun);
    return out;
  });
}

/**
 * Strength, 0 to 100: how firmly a term is held today. It comes from the ladder step and
 * holds until the term falls due, then halves for each review interval it sits overdue.
 * Nothing new is stored; it is read from the step and the due date.
 */
export function strength(s: TermState | undefined, today: string, core = false): number {
  if (!s) return 0;
  const base = s.step === 0 ? 5 : 100 * Math.pow(s.step / MAX_STEP, 0.7);
  const overdue = Math.max(0, daysBetween(s.due, today));
  const interval = Math.max(1, intervalFor(s.step, core));
  return Math.round(base * Math.pow(2, -overdue / interval));
}

/** Term ids the learner can reach now: everything outside phase 3, and phase 3 once it is open. */
export function openTermIds(p: Progress): string[] {
  const open3 = phase3Open(p);
  return categories.filter((c) => open3 || !isPhase3Area(c.id)).flatMap((c) => c.terms.map((t) => t.id));
}

export interface Kpis {
  /** Terms at step 4 or above, of all open terms. */
  known: number;
  open: number;
  /** Terms due today, up to what the daily cap still allows. */
  due: number;
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
  let met = 0;
  let total = 0;
  for (const id of open) {
    const s = p.terms[id];
    if (!s) continue;
    met++;
    if (isKnown(s)) known++;
    total += strength(s, today, isCore(id));
  }
  const openSet = new Set(open);
  const due = Math.min(dueTermIds(p, today).filter((id) => openSet.has(id)).length, reviewsLeftToday(p, today));
  return {
    known,
    open: open.length,
    due,
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
      let total = 0;
      for (const t of c.terms) {
        const s = p.terms[t.id];
        if (!s) continue;
        met++;
        if (isKnown(s)) known++;
        total += strength(s, today, isCore(t.id));
      }
      return { id: c.id, name: c.name, terms: c.terms.length, met, known, strength: met ? Math.round(total / met) : 0 };
    });
}
