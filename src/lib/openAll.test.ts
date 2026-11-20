import { describe, expect, it } from 'vitest';
import { buildPractice } from './choose';
import { path, termIdsOfUnit } from './content';
import { buildLesson } from './lesson';
import { recordAnswer } from './modes/knowledge';
import { buildRide, canRideFrom, lines } from './modes/plans';
import { roundStatus } from './modes/roundPick';
import { asIfAllMet, withoutAssumed } from './openAll';
import { seededRng } from './questions';
import { introduce, newProgress } from './scheduler';
import type { Progress } from './types';

const today = '2026-11-20';
const open = (p: Progress): Progress => ({ ...p, settings: { ...p.settings, openAll: true } });
const allIds = path.flatMap((r) => r.terms.map((t) => t.id));

describe('open everything', () => {
  it('changes nothing while the switch is off', () => {
    const p = newProgress();
    expect(asIfAllMet(p, today)).toBe(p);
  });

  it('makes every term met for the modes, keeping the learner’s own terms as they are', () => {
    const own = open(introduce(newProgress(), allIds[0], today));
    const view = asIfAllMet(own, today);
    expect(Object.keys(view.terms).sort()).toEqual([...allIds].sort());
    expect(view.terms[allIds[0]]).toBe(own.terms[allIds[0]]);
    // Assumed terms are not due, so they don't pile up as reviews.
    expect(view.terms[allIds[1]].due > today).toBe(true);
    // The learner's own record is untouched.
    expect(Object.keys(own.terms)).toEqual([allIds[0]]);
  });

  it('opens Headline Desk and Finnections, and every station on every line', () => {
    const view = asIfAllMet(open(newProgress()), today);
    expect(roundStatus(newProgress(), 'headline').open).toBe(false);
    expect(roundStatus(view, 'headline').open).toBe(true);
    expect(roundStatus(view, 'finnections').open).toBe(true);
    for (const l of lines) {
      const stops = l.stops.map((s, i) => ('term' in s ? i : -1)).filter((i) => i >= 0);
      expect(stops.every((i) => canRideFrom(view, l.id, i))).toBe(true);
    }
    expect(buildRide(view, lines[0].id, lines[0].stops.findIndex((s) => 'term' in s), today, seededRng(1))).not.toBeNull();
  });

  it('lets a unit with nothing met be practised', () => {
    const unit = path.find((r) => r.terms.length >= 4)!.unit.id;
    expect(buildPractice(open(newProgress()), unit, seededRng(2))).toBeNull();
    const plan = buildPractice(asIfAllMet(open(newProgress()), today), unit, seededRng(2))!;
    expect(plan.questions.length).toBeGreaterThan(0);
    expect(plan.questions.every((q) => q.kind === 'match' || termIdsOfUnit(unit).includes(q.termId))).toBe(true);
  });

  it('keeps lessons teaching new terms from the learner’s own progress', () => {
    const plan = buildLesson(open(newProgress()), today, seededRng(3))!;
    expect(plan.newIds.length).toBeGreaterThan(0);
  });

  it('never saves an assumed term, and keeps answers on the learner’s own terms', () => {
    const own = open(introduce(newProgress(), allIds[0], today));
    let back = asIfAllMet(own, today);
    back = recordAnswer(back, { termId: allIds[5], correct: true, evidence: 'strong', mode: 'callit' }, today);
    back = recordAnswer(back, { termId: allIds[0], correct: true, evidence: 'strong', mode: 'callit' }, today);
    const saved = withoutAssumed(back, own);
    expect(Object.keys(saved.terms)).toEqual([allIds[0]]);
    expect(saved.modes?.callit?.answers).toBe(2);
  });
});
