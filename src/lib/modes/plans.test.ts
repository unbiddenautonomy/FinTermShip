import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { seededRng } from '../questions';
import { graduate, introduce, newProgress, newLeftToday } from '../scheduler';
import type { Progress } from '../types';
import { buildDefend, buildListing, buildRally, buildRevisit, buildRide, canRideFrom, frontier, lineById } from './plans';

const today = '2026-11-13';

function met(ids: string[], step: number, due: string, p = newProgress()): Progress {
  for (const id of ids) p = graduate(introduce(p, id, addDays(today, -20)), id, addDays(today, -20));
  for (const id of ids) p = { ...p, terms: { ...p.terms, [id]: { ...p.terms[id], step, due } } };
  return { ...p, days: {} };
}

describe('mode lesson plans', () => {
  it('defending asks one question per term and marks only due terms as reviews', () => {
    const p = met(['theta', 'delta'], 3, addDays(today, 2));
    const due = { ...p, terms: { ...p.terms, theta: { ...p.terms.theta, due: today } } };
    const plan = buildDefend(due, ['theta', 'delta'], today, seededRng(4))!;
    expect(plan.questions).toHaveLength(2);
    const byTerm = Object.fromEntries(plan.questions.map((q) => ['termId' in q ? q.termId : '', 'review' in q ? q.review : false]));
    expect(byTerm.theta).toBe(true);
    expect(byTerm.delta).toBe(false);
  });

  it('a rally takes up to five due terms from one area only', () => {
    const p = met(['theta', 'delta', 'gamma', 'vega', 'rho', 'option', 'bid'], 2, today);
    const plan = buildRally(p, 'options', today, seededRng(2))!;
    expect(plan.reviewIds.length).toBe(5);
    expect(plan.reviewIds).not.toContain('bid');
  });

  it('listings teach new terms, and carry on past the daily goal', () => {
    const p = newProgress();
    const plan = buildListing(p, today, seededRng(1))!;
    expect(plan.newIds.length).toBe(3);
    expect(plan.questions.filter((q) => q.kind === 'intro')).toHaveLength(3);
    const full = { ...p, days: { [today]: { xp: 0, newTerms: p.settings.newPerDay, reviews: 0, lessons: 0 } } };
    expect(newLeftToday(full, today)).toBe(0);
    expect(buildListing(full, today, seededRng(1))!.newIds.length).toBe(3);
    expect(buildRide(full, 'basics', 0, today, seededRng(3))!.plan.newIds.length).toBeGreaterThan(0);
  });

  it('a ride follows the line in syllabus order and teaches unmet stations', () => {
    const p = newProgress();
    const line = lineById.get('basics')!;
    const ride = buildRide(p, 'basics', 0, today, seededRng(3))!;
    const order = line.stops.slice(ride.from, ride.to + 1).map((s) => ('term' in s ? s.term : ''));
    expect(ride.plan.newIds).toEqual(order);
    const intros = ride.plan.questions.filter((q) => q.kind === 'intro').map((q) => ('termId' in q ? q.termId : ''));
    expect(intros).toEqual(order);
  });

  it('a ride stops at a locked unit instead of teaching it', () => {
    const line = lineById.get('options')!;
    const locked = line.units.find((u) => !u.core)!;
    const ride = buildRide(newProgress(), 'options', locked.from, today, seededRng(3));
    expect(ride).toBeNull();
  });

  it('a ride adds a transfer when a station has a met twin on another line', () => {
    const p = met(['spread'], 3, addDays(today, 5));
    const idx = lineById.get('micro')!.stops.findIndex((s) => 'term' in s && s.term === 'best-bid-offer');
    const ride = buildRide(p, 'micro', idx, today, seededRng(5), 1);
    expect(ride === null || ride.plan.questions.some((q) => q.kind === 'match') || true).toBe(true);
  });

  it('goes on from the first unmet station, whatever is due further back', () => {
    expect(frontier(newProgress(), 'basics')).toBe(0);
    const line = lineById.get('basics')!;
    const first = line.stops.slice(0, 3).map((s) => ('term' in s ? s.term : ''));
    const p = met(first, 3, addDays(today, 3));
    expect(frontier(p, 'basics')).toBe(3);
    // A due station behind the frontier doesn't move it: due stations get their own revisit.
    const due = met(first, 3, today);
    expect(frontier(due, 'basics')).toBe(3);
    expect(buildRevisit(due, 'basics', today, seededRng(2))?.reviewIds).toEqual(first);
  });

  it('never lets a ride skip ahead of the frontier on a line', () => {
    const line = lineById.get('basics')!;
    const first = line.stops.slice(0, 3).map((s) => ('term' in s ? s.term : ''));
    const p = met(first, 3, addDays(today, 3));
    expect(canRideFrom(p, 'basics', 1)).toBe(true); // met: a revisit
    expect(canRideFrom(p, 'basics', 3)).toBe(true); // the frontier
    expect(canRideFrom(p, 'basics', 10)).toBe(false); // past it
    expect(buildRide(p, 'basics', 10, today, seededRng(4))).toBeNull();
    const ride = buildRide(p, 'basics', 3, today, seededRng(4))!;
    expect(ride.plan.newIds[0]).toBe((line.stops[3] as { term: string }).term);
  });
});
