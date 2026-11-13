/**
 * Lesson plans the new modes hand to the shared Lesson screen. Each mode picks terms its own
 * way, but every question is one the syllabus already has, and every answer goes through
 * recordAnswer, so the shared record is the only thing that changes.
 */
import metro from '../../data/modes/metro.json';
import { unitOpen } from '../choose';
import { categories, termById } from '../content';
import type { LessonPlan } from '../lesson';
import { nextNewTermIds } from '../lesson';
import { matchQuestion, meaningQuestion, reviewQuestion, shuffle, termQuestion, type Rng } from '../questions';
import { dueTermIds, isDueOn, newLeftToday } from '../scheduler';
import type { Progress, Question, Term } from '../types';
import { interchangesAt } from './transfer';

type Stop = { term: string } | { depot: string; kind: string; game?: string };
export interface Line {
  id: string;
  name: string;
  order: number;
  phase?: number;
  units: { id: string; name: string; core: boolean; from: number; to: number }[];
  stops: Stop[];
}
export const lines = metro.lines as Line[];
export const lineById = new Map(lines.map((l) => [l.id, l]));

const isDue = (p: Progress, id: string, today: string) => isDueOn(p.terms[id], today);

/** One question per term, the one Path would ask at the term's step. Due terms count as reviews. */
export function buildDefend(p: Progress, termIds: string[], today: string, rng: Rng): LessonPlan | null {
  const known = new Set(Object.keys(p.terms));
  const qs: Question[] = [];
  for (const id of termIds) {
    const t = termById.get(id);
    const s = p.terms[id];
    if (!t || !s) continue;
    qs.push({ ...reviewQuestion(t, Math.max(1, s.step), rng, known), review: isDue(p, id, today) } as Question);
  }
  if (!qs.length) return null;
  return { kind: 'review', newIds: [], reviewIds: termIds.filter((id) => isDue(p, id, today)), questions: qs };
}

/** Recall Exchange: a rally on one sector, up to five due terms back to back, weakest first. */
export function buildRally(p: Progress, areaId: string, today: string, rng: Rng): LessonPlan | null {
  const area = new Set(categories.find((c) => c.id === areaId)?.terms.map((t) => t.id) ?? []);
  const ids = dueTermIds(p, today).filter((id) => area.has(id)).slice(0, 5);
  return ids.length ? buildDefend(p, ids, today, rng) : null;
}

/** Teaching questions for new terms: the card, then the meaning, then the term from its definition. */
function teach(fresh: Term[], known: Set<string>, rng: Rng): Question[] {
  const qs: Question[] = [];
  for (const t of fresh) qs.push({ kind: 'intro', termId: t.id }, meaningQuestion(t, rng));
  for (const t of shuffle(fresh, rng)) qs.push(termQuestion(t, rng, false, known));
  return qs;
}

/** Recall Exchange listings: the next new terms on the learner's track, within today's shared limit. */
export function buildListing(p: Progress, today: string, rng: Rng, count = 3): LessonPlan | null {
  const n = Math.min(count, newLeftToday(p, today));
  const ids = n > 0 ? nextNewTermIds(p, n, today) : [];
  if (!ids.length) return null;
  const fresh = ids.map((id) => termById.get(id)!).filter(Boolean);
  const known = new Set([...Object.keys(p.terms), ...ids]);
  return { kind: 'new', newIds: ids, reviewIds: [], questions: teach(fresh, known, rng) };
}

export interface Ride {
  plan: LessonPlan;
  /** Stops covered, as indexes into the line's stops. */
  from: number;
  to: number;
  /** The depot or interchange the ride stopped at, if any. */
  endsAt?: { depot: string } | { interchange: string } | { locked: string };
}

export const RIDE_STOPS = 5;

/**
 * Term Lines: ride a few stops along a line from a station, in syllabus order. A ride starts at a
 * met station or at the frontier, never past it (see canRideFrom).
 * New terms are taught (within today's shared limit), met terms get the question Path would ask,
 * and a station that is an interchange with a met term on another line adds a Transfer puzzle.
 * The ride ends at a depot (a game, drill or case), at the end of the line, after RIDE_STOPS stops,
 * or when today's new terms run out.
 */
export function buildRide(p: Progress, lineId: string, from: number, today: string, rng: Rng, maxStops = RIDE_STOPS): Ride | null {
  const line = lineById.get(lineId);
  if (!line) return null;
  if ('term' in (line.stops[from] ?? {}) && !canRideFrom(p, lineId, from)) return null;
  let newLeft = newLeftToday(p, today);
  const fresh: Term[] = [];
  const met: Term[] = [];
  const transfers: [string, string][] = [];
  let i = from;
  let endsAt: Ride['endsAt'];
  for (; i < line.stops.length && fresh.length + met.length < maxStops; i++) {
    const stop = line.stops[i];
    if ('depot' in stop) {
      if (i === from) continue;
      endsAt = { depot: stop.depot };
      break;
    }
    const t = termById.get(stop.term);
    if (!t) continue;
    if (p.terms[t.id]) met.push(t);
    else if (!unitOpen(p, t.unit)) {
      endsAt = { locked: t.unit };
      break;
    } else if (newLeft > 0) {
      fresh.push(t);
      newLeft--;
    } else break;
    const twin = interchangesAt(t.id).find((id) => p.terms[id]);
    if (twin && transfers.length < 2) transfers.push([t.id, twin]);
  }
  if (!fresh.length && !met.length) return null;
  const known = new Set([...Object.keys(p.terms), ...fresh.map((t) => t.id)]);
  const qs: Question[] = [];
  // Stops in order: a new station is taught, a met one is asked the way Path would ask it.
  for (const t of [...line.stops.slice(from, i)].flatMap((s) => ('term' in s ? [termById.get(s.term)!] : []))) {
    if (fresh.includes(t)) qs.push({ kind: 'intro', termId: t.id }, meaningQuestion(t, rng));
    else if (met.includes(t)) qs.push({ ...reviewQuestion(t, Math.max(1, p.terms[t.id].step), rng, known), review: isDue(p, t.id, today) } as Question);
  }
  for (const t of shuffle(fresh, rng)) qs.push(termQuestion(t, rng, false, known));
  for (const [a, b] of transfers) qs.push(matchQuestion([termById.get(a)!, termById.get(b)!], rng));
  if (transfers.length && !endsAt) endsAt = { interchange: transfers[transfers.length - 1][1] };
  return {
    plan: { kind: fresh.length ? 'new' : 'review', newIds: fresh.map((t) => t.id), reviewIds: met.filter((t) => isDue(p, t.id, today)).map((t) => t.id), questions: qs },
    from,
    to: i - 1,
    endsAt,
  };
}

/**
 * Where the line goes on from: the first station not yet met, in the order Path teaches them.
 * -1 when every open station is met (a locked stretch waits for its area to open).
 */
export function frontier(p: Progress, lineId: string): number {
  const line = lineById.get(lineId);
  if (!line) return -1;
  const i = line.stops.findIndex((s) => 'term' in s && !p.terms[s.term]);
  if (i < 0) return -1;
  const t = termById.get((line.stops[i] as { term: string }).term);
  return t && unitOpen(p, t.unit) ? i : -1;
}

/**
 * Can a ride start at this station? Any station already met can be revisited, and new ones are
 * met in order from the frontier, as Path teaches them. Jumping past the frontier would skip terms
 * the later ones build on, so it isn't offered; picking a unit in Path is the way to aim ahead.
 */
export function canRideFrom(p: Progress, lineId: string, stop: number): boolean {
  const line = lineById.get(lineId);
  const s = line?.stops[stop];
  if (!s || !('term' in s)) return false;
  return !!p.terms[s.term] || stop === frontier(p, lineId);
}

/** Due stations on a line, in line order. */
export function dueStops(p: Progress, lineId: string, today: string): string[] {
  const line = lineById.get(lineId);
  if (!line) return [];
  return line.stops.flatMap((s) => ('term' in s && isDue(p, s.term, today) ? [s.term] : []));
}

/** Revisit a line: its due stations, up to REVISIT_MAX, each asked the way Path would ask it. */
export const REVISIT_MAX = 8;
export function buildRevisit(p: Progress, lineId: string, today: string, rng: Rng): LessonPlan | null {
  const ids = dueStops(p, lineId, today).slice(0, REVISIT_MAX);
  return ids.length ? buildDefend(p, ids, today, rng) : null;
}
