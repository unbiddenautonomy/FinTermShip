import { describe, expect, it } from 'vitest';
import { settleFocus, unitOpen, withFocus } from './choose';
import { coreTermIds, path } from './content';
import { checkAnswer, DRILLS, drillPasses, parseAnswer, recordDrill, snoozeDrill, type DrillQuestion } from './drills';
import { checkPassword } from './gate';
import { drillUp, nextNewTermIds, todayStatus } from './lesson';
import { seededRng } from './questions';
import { graduate, introduce, newProgress } from './scheduler';
import { currentUnit, track } from './track';
import type { Progress } from './types';

const today = '2026-11-07';

function meet(p: Progress, ids: string[]): Progress {
  for (const id of ids) p = graduate(introduce(p, id, today), id, today);
  return p;
}

function pass(p: Progress, unitId: string): Progress {
  return recordDrill(p, unitId, DRILLS[unitId].count, 1000, today);
}

/** The typed form of the answer shown after a miss: "1/6 (about 0.167)" → "1/6". */
function typedForm(q: DrillQuestion): string {
  return q.shown.replace(/^about /, '').replace(/ \(about .*\)$/, '');
}

const allQuestions = Object.entries(DRILLS).flatMap(([unitId, spec]) =>
  Array.from({ length: 300 }, (_, seed) => spec.make(seededRng(seed * 7 + 1)).map((q) => ({ unitId, q }))).flat(),
);

describe('drill questions', () => {
  it('makes full rounds with no repeated prompt', () => {
    for (const [unitId, spec] of Object.entries(DRILLS)) {
      for (let seed = 0; seed < 300; seed++) {
        const qs = spec.make(seededRng(seed));
        expect(qs.length, unitId).toBe(spec.count);
        expect(new Set(qs.map((q) => q.prompt)).size, unitId).toBe(spec.count);
      }
    }
  });

  it('every answer is a real number, explained, and accepted when typed as shown', () => {
    for (const { unitId, q } of allQuestions) {
      expect(Number.isFinite(q.answer), q.prompt).toBe(true);
      expect(q.why.length, q.prompt).toBeGreaterThan(5);
      expect(checkAnswer(q, typedForm(q)), `${unitId}: ${q.prompt} → ${q.shown}`).toBe('right');
      if (q.kind === 'prob') {
        expect(q.answer).toBeGreaterThan(0);
        expect(q.answer).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gets mental sums right', () => {
    const sums = allQuestions.filter(({ q }) => /^[\d,.]+ [×÷+−] [\d,.]+$/.test(q.prompt));
    expect(sums.length).toBeGreaterThan(500);
    for (const { q } of sums) {
      const [a, op, b] = q.prompt.split(' ');
      const x = Number(a.replace(/,/g, ''));
      const y = Number(b.replace(/,/g, ''));
      const want = op === '×' ? x * y : op === '÷' ? x / y : op === '+' ? x + y : x - y;
      expect(q.answer, q.prompt).toBeCloseTo(want, 9);
    }
  });

  it('gets percentages right', () => {
    for (const { q } of allQuestions) {
      const of = q.prompt.match(/^([\d.]+)% of ([\d,]+)$/);
      if (of) expect(q.answer, q.prompt).toBeCloseTo((Number(of[1]) * Number(of[2].replace(/,/g, ''))) / 100, 9);
      const change = q.prompt.match(/^([\d,]+) to ([\d,]+): % change/);
      if (change) {
        const [a, b] = [change[1], change[2]].map((s) => Number(s.replace(/,/g, '')));
        expect(q.answer, q.prompt).toBeCloseTo(((b - a) / a) * 100, 9);
      }
      const frac = q.prompt.match(/^(\d+)\/(\d+) as a decimal$/);
      if (frac) expect(q.answer, q.prompt).toBeCloseTo(Number(frac[1]) / Number(frac[2]), 12);
    }
  });

  it('gets dice, coin and card chances right by counting outcomes', () => {
    const dice: number[][] = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) dice.push([a, b]);
    const binom = (n: number, k: number): number => (k === 0 || k === n ? 1 : binom(n - 1, k - 1) + binom(n - 1, k));
    let checked = 0;
    for (const { q } of allQuestions) {
      let m = q.prompt.match(/^Two dice: chance the total is (\d+)\?$/);
      if (m) expect(q.answer).toBeCloseTo(dice.filter(([a, b]) => a + b === Number(m![1])).length / 36, 12);
      m = q.prompt.match(/^Flip (\d) coins: chance of exactly (\d) heads?\?$/);
      if (m) expect(q.answer).toBeCloseTo(binom(Number(m[1]), Number(m[2])) / 2 ** Number(m[1]), 12);
      m = q.prompt.match(/^Two dice add to (\d+)\. Chance the first shows (\d)\?$/);
      if (m) {
        const hits = dice.filter(([a, b]) => a + b === Number(m![1]));
        expect(q.answer).toBeCloseTo(hits.filter(([a]) => a === Number(m![2])).length / hits.length, 12);
      }
      if (q.prompt === 'Two cards, no replacement: chance both are aces?') expect(q.answer).toBeCloseTo(1 / 221, 12);
      if (q.prompt === 'Two cards, no replacement: chance both are hearts?') expect(q.answer).toBeCloseTo(1 / 17, 12);
      if (q.prompt === 'Roll 3 dice: chance of at least one six?') expect(q.answer).toBeCloseTo(91 / 216, 12);
      if (q.prompt === 'Expected value of the higher of two dice?') expect(q.answer).toBeCloseTo(dice.reduce((s, [a, b]) => s + Math.max(a, b), 0) / 36, 12);
      if (m || q.prompt.startsWith('Two cards') || q.prompt.startsWith('Roll 3')) checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('works Bayes questions out from the counts', () => {
    const bayes = allQuestions.filter(({ q }) => /flagged|signal fires/.test(q.prompt));
    expect(bayes.length).toBeGreaterThan(50);
    for (const { q } of bayes) {
      const [b, h, f] = (q.prompt.match(/\d+(?=%)/g) ?? []).map(Number);
      const want = (b * h) / (b * h + (100 - b) * f);
      expect(q.answer, q.prompt).toBeCloseTo(want, 12);
    }
  });
});

describe('typed answers', () => {
  const sixth: DrillQuestion = { prompt: '', answer: 1 / 6, kind: 'prob', shown: '1/6', why: '' };
  const tiny: DrillQuestion = { prompt: '', answer: 1 / 221, kind: 'prob', shown: '1/221', why: '' };
  const fall: DrillQuestion = { prompt: '', answer: -20, kind: 'pct', shown: '−20%', why: '' };
  const money: DrillQuestion = { prompt: '', answer: 100 / 6, kind: 'num', shown: '₹16.67', why: '' };

  it('accepts a chance as a fraction, a decimal or a percentage', () => {
    for (const ok of ['1/6', '2/12', '0.167', '.1667', '0.17', '16.7%', '17%', ' 1 / 6 ']) expect(checkAnswer(sixth, ok), ok).toBe('right');
    for (const bad of ['0.2', '0.16', '1/5', '16%', '20%']) expect(checkAnswer(sixth, bad), bad).toBe('wrong');
  });

  it("doesn't let a rounded-away answer pass for a small chance", () => {
    expect(checkAnswer(tiny, '0.0045')).toBe('right');
    expect(checkAnswer(tiny, '0.45%')).toBe('right');
    expect(checkAnswer(tiny, '0')).toBe('wrong');
    expect(checkAnswer(tiny, '0.00')).toBe('wrong');
  });

  it('needs the sign on a fall, and reads Indian commas and rupee signs', () => {
    expect(checkAnswer(fall, '−20')).toBe('right');
    expect(checkAnswer(fall, '-20%')).toBe('right');
    expect(checkAnswer(fall, '20')).toBe('wrong');
    expect(checkAnswer(money, '16.67')).toBe('right');
    expect(checkAnswer(money, '₹17')).toBe('right');
    expect(checkAnswer(money, '16')).toBe('wrong');
    const big: DrillQuestion = { prompt: '', answer: 1_000_000, kind: 'num', shown: '10,00,000', why: '' };
    expect(checkAnswer(big, '10,00,000')).toBe('right');
    expect(checkAnswer(big, '1,000,000')).toBe('right');
  });

  it('asks for a decimal when the question does', () => {
    const q: DrillQuestion = { prompt: '3/8 as a decimal', answer: 0.375, kind: 'num', shown: '0.375', why: '', decimalOnly: true };
    expect(checkAnswer(q, '3/8')).toBe('fraction');
    expect(checkAnswer(q, '0.375')).toBe('right');
    expect(checkAnswer(q, '0.38')).toBe('wrong');
  });

  it('flags what it cannot read', () => {
    expect(parseAnswer('abc')).toBeNull();
    expect(parseAnswer('1/0')).toBeNull();
    expect(checkAnswer(sixth, '1..2')).toBe('unreadable');
  });
});

describe('drills on the one track', () => {
  const coreBeforeDrills = path.filter((r) => r.pass === 1 && r.category.order < 6).flatMap((r) => r.terms.map((t) => t.id));

  it('stops at the first drill until it is passed', () => {
    let p = meet(newProgress(), coreBeforeDrills);
    expect(nextNewTermIds(p, 4, today)).toEqual([]);
    expect(currentUnit(p, today)).toBe('k1');
    expect(drillUp(p, today)).toBe('k1');
    expect(todayStatus(p, today).drill).toBe('k1');
    p = recordDrill(p, 'k1', 8, 60_000, today);
    expect(drillUp(p, today)).toBe('k1');
    p = pass(p, 'k1');
    expect(drillUp(p, today)).toBe('k2');
    p = pass(pass(p, 'k2'), 'k3');
    expect(drillUp(p, today)).toBeNull();
    expect(nextNewTermIds(p, 4, today)).toEqual(coreTermIds.filter((id) => !p.terms[id]).slice(0, 4));
  });

  it('counts a round as passed only with enough right inside the time', () => {
    const spec = DRILLS.k1;
    expect(drillPasses('k1', spec.passRight, spec.targetSec * 1000)).toBe(true);
    expect(drillPasses('k1', spec.passRight, spec.targetSec * 1000 + 1)).toBe(false);
    expect(drillPasses('k1', spec.passRight - 1, 1000)).toBe(false);
    const p = recordDrill(recordDrill(newProgress(), 'k1', 9, 140_000, today), 'k1', 10, 100_000, today);
    expect(p.drills?.k1).toMatchObject({ rounds: 2, passed: true, bestRight: 10, bestMs: 100_000 });
  });

  it('lets a stuck learner skip a drill for the rest of the day', () => {
    let p = meet(newProgress(), coreBeforeDrills);
    p = snoozeDrill(p, 'k1', today);
    expect(drillUp(p, today)).toBe('k2');
    p = snoozeDrill(snoozeDrill(p, 'k2', today), 'k3', today);
    expect(drillUp(p, today)).toBeNull();
    expect(nextNewTermIds(p, 2, today)).toEqual(path.find((r) => r.unit.id === 'd1')!.terms.slice(0, 2).map((t) => t.id));
    // Tomorrow the drill is back on the path (reviews from today's terms come first).
    expect(currentUnit(p, '2026-11-08')).toBe('k1');
  });

  it('opens advanced drills once the core drills are passed', () => {
    let p = newProgress();
    expect(unitOpen(p, 'k1')).toBe(true);
    expect(unitOpen(p, 'k4')).toBe(false);
    p = pass(pass(pass(p, 'k1'), 'k2'), 'k3');
    expect(unitOpen(p, 'k4')).toBe(true);
  });

  it('keeps a picked drill up next until it is passed', () => {
    let p = withFocus(newProgress(), 'k3');
    expect(currentUnit(p, today)).toBe('k3');
    expect(drillUp(p, today)).toBe('k3');
    p = settleFocus(p);
    expect(p.focus).toBe('k3');
    p = settleFocus(pass(p, 'k3'));
    expect(p.focus).toBeUndefined();
    expect(drillUp(p, today)).toBeNull();
  });
});

describe('quant switch', () => {
  const on = (p: Progress): Progress => ({ ...p, settings: { ...p.settings, quantFirst: true } });

  it('takes the password, and only the password', () => {
    expect(checkPassword('007')).toBe(true);
    expect(checkPassword(' 007 ')).toBe(true);
    expect(checkPassword('7')).toBe(false);
    expect(checkPassword('0070')).toBe(false);
    expect(checkPassword('')).toBe(false);
  });

  it('puts the quant areas first, core before advanced, and opens them', () => {
    const p = on(newProgress());
    const order = track(p).map((r) => r.unit.id);
    expect(order.slice(0, 9)).toEqual(['k1', 'k2', 'k3', 'q1', 'q2', 'o1', 'o2', 's1', 's2']);
    expect(order.indexOf('k6')).toBeLessThan(order.indexOf('b1'));
    expect(order).toHaveLength(path.length);
    for (const id of ['k4', 'q3', 'o4', 's5']) expect(unitOpen(p, id), id).toBe(true);
    expect(unitOpen(p, 'b3')).toBe(false);
    expect(drillUp(p, today)).toBe('k1');
  });

  it('teaches quant terms first once the first drills are passed', () => {
    let p = on(newProgress());
    p = pass(pass(pass(p, 'k1'), 'k2'), 'k3');
    expect(nextNewTermIds(p, 4, today)).toEqual(path.find((r) => r.unit.id === 'q1')!.terms.slice(0, 4).map((t) => t.id));
  });

  it('goes back to the usual order when switched off, keeping what was learned', () => {
    const p = { ...on(pass(newProgress(), 'k1')), settings: { ...newProgress().settings, quantFirst: false } };
    expect(track(p)[0].unit.id).toBe('b1');
    expect(p.drills?.k1?.passed).toBe(true);
    expect(unitOpen(p, 'q3')).toBe(false);
  });
});
