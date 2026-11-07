import { describe, expect, it } from 'vitest';
import { applyTest, areaCoreTermIds, buildPractice, buildTest, canTakeTest, focusQueue, settleFocus, TEST_PASS, unitOpen, withFocus } from './choose';
import { termIdsOfUnit } from './content';
import { buildLesson, nextNewTermIds } from './lesson';
import { seededRng } from './questions';
import { dayStats, graduate, introduce, newProgress } from './scheduler';
import type { Progress } from './types';

const today = '2026-11-07';

function meet(p: Progress, ids: string[]): Progress {
  for (const id of ids) p = graduate(introduce(p, id, today), id, today);
  return p;
}

describe('locks', () => {
  it('keeps core units open and advanced units locked until the area core is met', () => {
    let p = newProgress();
    expect(unitOpen(p, 'o1')).toBe(true);
    expect(unitOpen(p, 'q2')).toBe(true);
    expect(unitOpen(p, 'o3')).toBe(false);
    p = meet(p, areaCoreTermIds('options'));
    expect(unitOpen(p, 'o3')).toBe(true);
    expect(unitOpen(p, 'q3')).toBe(false);
  });

  it('opens an area when its test is passed', () => {
    const core = areaCoreTermIds('quant');
    const right = core.slice(0, Math.ceil(core.length * TEST_PASS));
    const p = applyTest(newProgress(), 'quant', right, core.length, today);
    expect(p.tests?.quant?.passed).toBe(true);
    expect(unitOpen(p, 'q5')).toBe(true);
    expect(unitOpen(p, 'o5')).toBe(false);
  });
});

describe('picking a unit', () => {
  it('teaches a picked core unit next, ahead of the usual order', () => {
    const p = withFocus(newProgress(), 'q1');
    expect(nextNewTermIds(p, 4)).toEqual(termIdsOfUnit('q1').slice(0, 4));
    const plan = buildLesson(p, today, seededRng(1))!;
    expect(plan.newIds).toEqual(termIdsOfUnit('q1').slice(0, 4));
  });

  it('brings in the earlier units of the same area first', () => {
    let p = applyTest(newProgress(), 'options', areaCoreTermIds('options').slice(0, 18), 22, today);
    p = withFocus(p, 'o5');
    const queue = focusQueue(p);
    const missedCore = areaCoreTermIds('options').filter((id) => !p.terms[id]);
    expect(queue.slice(0, missedCore.length)).toEqual(missedCore);
    expect(queue).toEqual(expect.arrayContaining([...termIdsOfUnit('o3'), ...termIdsOfUnit('o4'), ...termIdsOfUnit('o5')]));
    expect(queue.slice(-termIdsOfUnit('o5').length)).toEqual(termIdsOfUnit('o5'));
    // Nothing from other areas is pulled in.
    expect(queue.every((id) => !termIdsOfUnit('b1').includes(id))).toBe(true);
  });

  it('ignores a pick on a locked unit', () => {
    const p = withFocus(newProgress(), 'o5');
    expect(focusQueue(p)).toEqual([]);
    expect(nextNewTermIds(p, 4)).toEqual(termIdsOfUnit('b1').slice(0, 4));
  });

  it('drops the pick once the unit is fully met', () => {
    let p = withFocus(newProgress(), 'd1');
    p = meet(p, termIdsOfUnit('d1').slice(0, -1));
    expect(settleFocus(p).focus).toBe('d1');
    p = meet(p, termIdsOfUnit('d1'));
    expect(settleFocus(p).focus).toBeUndefined();
  });
});

describe('practice', () => {
  it('needs at least two met terms', () => {
    expect(buildPractice(newProgress(), 'b1', seededRng(2))).toBeNull();
  });

  it('only asks about met terms and never moves the review schedule', () => {
    const met = termIdsOfUnit('b1').slice(0, 6);
    const p = meet(newProgress(), met);
    const plan = buildPractice(p, 'b1', seededRng(3))!;
    expect(plan.kind).toBe('practice');
    expect(plan.newIds).toEqual([]);
    expect(plan.questions.some((q) => q.kind === 'match')).toBe(true);
    for (const q of plan.questions) {
      expect(q.kind).not.toBe('intro');
      if (q.kind === 'match') q.termIds.forEach((id) => expect(met).toContain(id));
      else if (q.kind !== 'intro') {
        expect(met).toContain(q.termId);
        expect(q.review).toBe(false);
      }
    }
  });
});

describe('area test', () => {
  it('asks one question on every core term of the area', () => {
    const plan = buildTest('trading', seededRng(4));
    const core = areaCoreTermIds('trading');
    expect(plan.kind).toBe('test');
    expect(plan.questions.length).toBe(core.length);
    const asked = plan.questions.map((q) => ('termId' in q ? q.termId : ''));
    expect(new Set(asked)).toEqual(new Set(core));
    expect(plan.questions.every((q) => q.kind !== 'intro' && q.kind !== 'match' && !q.review)).toBe(true);
  });

  it('counts right answers as learned, spread over the next days, without using the daily new-term goal', () => {
    const core = areaCoreTermIds('india');
    const p = applyTest(newProgress(), 'india', core.slice(0, 10), core.length, today);
    expect(p.tests?.india).toMatchObject({ date: today, right: 10, total: core.length, passed: false });
    expect(unitOpen(p, 'i3')).toBe(false);
    const credited = core.slice(0, 10).map((id) => p.terms[id]);
    expect(credited.every((s) => s.step === 3)).toBe(true);
    const dues = new Set(credited.map((s) => s.due));
    expect(dues.size).toBeGreaterThan(3);
    expect([...dues].every((d) => d >= '2026-11-11' && d <= '2026-11-17')).toBe(true);
    expect(dayStats(p, today).newTerms).toBe(0);
    expect(core.slice(10).every((id) => !p.terms[id])).toBe(true);
  });

  it('can be retaken the next day, but not the same day, and not once the area is open', () => {
    const core = areaCoreTermIds('desk');
    const failed = applyTest(newProgress(), 'desk', [], core.length, today);
    expect(canTakeTest(failed, 'desk', today)).toBe(false);
    expect(canTakeTest(failed, 'desk', '2026-11-08')).toBe(true);
    const passed = applyTest(newProgress(), 'desk', core, core.length, today);
    expect(canTakeTest(passed, 'desk', '2026-11-08')).toBe(false);
  });

  it('keeps terms already met as they were', () => {
    const core = areaCoreTermIds('micro');
    const p0 = meet(newProgress(), core.slice(0, 2));
    const p = applyTest(p0, 'micro', core, core.length, today);
    expect(p.terms[core[0]]).toEqual(p0.terms[core[0]]);
    expect(p.terms[core[5]].step).toBe(3);
  });
});
