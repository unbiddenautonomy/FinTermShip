import { describe, expect, it } from 'vitest';
import { applyTest, settleFocus, unitOpen, withFocus } from './choose';
import { isPhase3Area, isPracticeUnit, mainTermIds, path, pathTermIds, termById, termIdsOfUnit } from './content';
import { addDays } from './dates';
import { DRILLS, recordDrill } from './drills';
import { todayStatus } from './lesson';
import { buildPhase3Test, canTakePhase3Test, PHASE3, PHASE3_PREREQS, PHASE3_TEST_SIZE, phase3Open, phase3UnitIds, reachableTermIds, withPhase3Key } from './phase3';
import { recordRound } from './practice';
import { seededRng } from './questions';
import { newProgress } from './scheduler';
import { currentUnit } from './track';
import type { Progress, TermState } from './types';

const today = '2026-11-08';

/** Mark terms as met, well back on the ladder so none are due today. */
function meet(p: Progress, ids: string[]): Progress {
  const terms = { ...p.terms };
  for (const id of ids) {
    const s: TermState = { step: 4, due: addDays(today, 30), seen: 3, correct: 3, wrong: 0, lapses: 0, trouble: false, introduced: '2026-09-01' };
    terms[id] = s;
  }
  return { ...p, terms };
}

/** Pass every drill, game and case on the main track. */
function passPractice(p: Progress, ids: string[]): Progress {
  for (const id of ids) {
    const spec = DRILLS[id];
    p = spec ? recordDrill(p, id, spec.passRight, spec.targetSec * 900, today) : recordRound(p, id, 9, true, today);
  }
  return p;
}

const mainPractice = path.filter((r) => r.pass !== 3 && isPracticeUnit(r.unit.id)).map((r) => r.unit.id);
const passTest = (p: Progress, right: number) => applyTest(p, PHASE3, PHASE3_PREREQS.slice(0, right), PHASE3_TEST_SIZE, today);
const opened = () => passTest(withPhase3Key(newProgress()), 16);

describe('phase 3 on the track', () => {
  it('comes last, as pass 3, with no core units and outside the main term count', () => {
    const rows = path.filter((r) => r.pass === 3);
    expect(rows.length).toBeGreaterThan(0);
    expect(path.slice(-rows.length)).toEqual(rows);
    expect(rows.every((r) => isPhase3Area(r.category.id) && !r.unit.core)).toBe(true);
    const strategyTerms = rows.flatMap((r) => r.terms.map((t) => t.id));
    expect(strategyTerms.some((id) => mainTermIds().includes(id))).toBe(false);
    expect(mainTermIds().length + strategyTerms.length).toBe(pathTermIds().length);
  });

  it('stays shut until both the password and the readiness test are done', () => {
    let p = newProgress();
    expect(unitOpen(p, 'y1')).toBe(false);
    // Finishing everything else, or the quant switch, doesn't open it.
    p = passPractice(meet(p, mainTermIds()), mainPractice);
    p = { ...p, settings: { ...p.settings, quantFirst: true } };
    expect(unitOpen(p, 'y1')).toBe(false);
    // The test alone (somehow passed without the password) isn't enough, nor is the password alone.
    expect(phase3Open(passTest(newProgress(), PHASE3_TEST_SIZE))).toBe(false);
    expect(phase3Open(withPhase3Key(newProgress()))).toBe(false);
    expect(phase3Open(opened())).toBe(true);
    expect(phaseUnitsOpen(opened())).toBe(true);
  });

  it('asks for the password first, then allows one try at the test a day', () => {
    expect(canTakePhase3Test(newProgress(), today)).toBe(false);
    const keyed = withPhase3Key(newProgress());
    expect(canTakePhase3Test(keyed, today)).toBe(true);
    const failed = passTest(keyed, 15);
    expect(phase3Open(failed)).toBe(false);
    expect(canTakePhase3Test(failed, today)).toBe(false);
    expect(canTakePhase3Test(failed, addDays(today, 1))).toBe(true);
    expect(canTakePhase3Test(opened(), addDays(today, 1))).toBe(false);
  });
});

function phaseUnitsOpen(p: Progress): boolean {
  return phase3UnitIds.every((id) => unitOpen(p, id));
}

describe('the readiness test', () => {
  it('draws 20 questions from what the strategies build on, all outside phase 3', () => {
    for (const id of PHASE3_PREREQS) {
      expect(termById.has(id), id).toBe(true);
      expect(mainTermIds().includes(id), id).toBe(true);
    }
    for (let seed = 1; seed <= 20; seed++) {
      const plan = buildPhase3Test(seededRng(seed));
      expect(plan.kind).toBe('test');
      expect(plan.categoryId).toBe(PHASE3);
      expect(plan.questions).toHaveLength(PHASE3_TEST_SIZE);
      const ids = plan.questions.map((q) => ('termId' in q ? q.termId : ''));
      expect(new Set(ids).size).toBe(PHASE3_TEST_SIZE);
      expect(ids.every((id) => PHASE3_PREREQS.includes(id))).toBe(true);
    }
  });

  it('opens phase 3 at 16 of 20 and makes the first strategy unit the pick', () => {
    const p = opened();
    expect(p.tests?.[PHASE3]).toMatchObject({ right: 16, total: 20, passed: true });
    expect(p.focus).toBe(phase3UnitIds[0]);
    // Terms answered right count as learned, as in an area test.
    expect(p.terms[PHASE3_PREREQS[0]]?.step).toBe(3);
    const failed = passTest(withPhase3Key(newProgress()), 15);
    expect(failed.focus).toBeUndefined();
  });

  it('leaves an existing pick alone', () => {
    const p = applyTest(withFocus(withPhase3Key(newProgress()), 'q1'), PHASE3, PHASE3_PREREQS.slice(0, 16), PHASE3_TEST_SIZE, today);
    expect(phase3Open(p)).toBe(true);
    expect(p.focus).toBe('q1');
  });
});

describe('learning phase 3', () => {
  it('keeps a strategy pick moving through phase 3, case by case, until it ends', () => {
    let p = opened();
    const seen: string[] = [];
    for (let guard = 0; guard < 60 && p.focus; guard++) {
      const unit = p.focus;
      seen.push(unit);
      p = isPracticeUnit(unit) ? recordRound(p, unit, 9, true, today) : meet(p, termIdsOfUnit(unit));
      p = settleFocus(p);
    }
    expect(seen).toEqual(phase3UnitIds);
    expect(p.focus).toBeUndefined();
  });

  it('counts strategy terms as new work only once phase 3 is open', () => {
    const done = passPractice(meet(newProgress(), mainTermIds()), mainPractice);
    expect(todayStatus(done, today).newAvailable).toBe(0);
    expect(currentUnit(done, today)).toBeNull();
    const open = { ...done, phase3Key: true, unlocked: [PHASE3] };
    expect(reachableTermIds(open)).toEqual(pathTermIds());
    expect(todayStatus(open, today).newAvailable).toBe(pathTermIds().length - mainTermIds().length);
    // With everything else done, the track carries on into phase 3.
    expect(currentUnit(open, today)).toBe(phase3UnitIds[0]);
  });
});
