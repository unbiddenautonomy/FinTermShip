import { describe, expect, it } from 'vitest';
import { buildPractice } from './choose';
import { categories, EASY_TERM_COUNT, isEasy, termById } from './content';
import { applyEasyQuiz, buildEasyQuiz, EASY_QUIZ, EASY_REVIEWS, EASY_ROUND, easyLeft, skipEasyQuiz, wantsEasyQuiz } from './easy';
import { deckTermIds } from './modes/claims';
import { recordAnswer } from './modes/knowledge';
import { rideRoute } from './modes/plans';
import { seededRng } from './questions';
import { dueTermIds, isDone, isDueOn, isKnownOn, MAX_STEP, newProgress } from './scheduler';
import { mergeProgress } from './sync';
import type { Progress, TermState } from './types';
import { weakSpots } from './weak';

const today = '2026-11-20';
const easyIds = categories.flatMap((c) => c.terms.filter((t) => t.easy).map((t) => t.id));
const hardIds = categories.flatMap((c) => c.terms.filter((t) => !t.easy).map((t) => t.id));
const state = (over: Partial<TermState> = {}): TermState => ({ step: 2, due: today, seen: 3, correct: 3, wrong: 0, lapses: 0, trouble: false, introduced: '2026-11-01', ...over });
const withTerms = (entries: [string, Partial<TermState>][]): Progress => ({ ...newProgress(), terms: Object.fromEntries(entries.map(([id, s]) => [id, state(s)])) });

describe('easy terms', () => {
  it('tags the everyday terms Nachi agreed, and the app knows how many there are', () => {
    expect(easyIds).toHaveLength(63);
    expect(EASY_TERM_COUNT).toBe(63);
    for (const id of ['lakh', 'crore', 'pnl', 'nse', 'sebi', 'bull-market', 'fomo']) expect(isEasy(id)).toBe(true);
    expect(isEasy('delta')).toBe(false);
  });

  it('asks every easy term once, in rounds, one meaning question each, and nothing else', () => {
    let p = newProgress();
    const asked: string[] = [];
    for (let round = 0; round < 5; round++) {
      const plan = buildEasyQuiz(p, seededRng(round));
      if (!plan) break;
      expect(plan.kind).toBe('test');
      expect(plan.categoryId).toBe(EASY_QUIZ);
      expect(plan.questions.length).toBeLessThanOrEqual(EASY_ROUND);
      expect(plan.questions.every((q) => q.kind === 'meaning' && q.options.length === 4)).toBe(true);
      const ids = plan.questions.map((q) => ('termId' in q ? q.termId : ''));
      asked.push(...ids);
      // Get the first half right.
      p = applyEasyQuiz(p, ids, ids.slice(0, 10), today, plan.questions.length < EASY_ROUND);
    }
    expect([...asked].sort()).toEqual([...easyIds].sort());
    expect(buildEasyQuiz(p, seededRng(9))).toBeNull();
    expect(easyLeft(p)).toEqual([]);
  });

  it('a right answer is done for good: known, never due, out of practice, decks, rides and weak spots', () => {
    const p0 = withTerms([['bid', { wrong: 3, lapses: 1, trouble: true }]]);
    const p = applyEasyQuiz(p0, ['lakh', 'crore', 'bid', 'ask', 'volume'], ['lakh', 'crore', 'bid'], today, false);
    for (const id of ['lakh', 'crore', 'bid']) {
      const s = p.terms[id];
      expect(isDone(s)).toBe(true);
      expect(s.step).toBe(MAX_STEP);
      expect(isKnownOn(s, today)).toBe(true);
      expect(isDueOn(s, '2030-01-01')).toBe(false);
    }
    // A term already met keeps its record, plus the quiz's answer, and one more move so a sync keeps it.
    expect(p.terms.bid.wrong).toBe(3);
    expect(p.terms.bid.correct).toBe(4);
    expect(p.terms.bid.moves).toBe(1);
    expect(p.terms.ask).toBeUndefined();
    expect(p.easyQuiz).toEqual({ missed: ['ask', 'volume'] });
    expect(wantsEasyQuiz(p)).toBe(true);
    expect(dueTermIds(p, '2035-01-01')).toEqual([]);
    expect(weakSpots(p)).not.toContain('bid');
    expect(buildPractice(p, 'b1', seededRng(1))).toBeNull();
    expect(deckTermIds(p, today, seededRng(1), 12)).toEqual([]);
    const route = rideRoute(p, 'basics', termById.get('lakh')!.stop!);
    expect(route?.metIds ?? []).not.toContain('lakh');
    expect(route?.metIds ?? []).not.toContain('crore');
  });

  it('the last round, or a skip, ends the quiz; a sync keeps both devices’ answers', () => {
    const a = applyEasyQuiz(newProgress(), ['lakh', 'crore'], ['lakh'], today, true);
    expect(a.easyQuiz).toEqual({ missed: ['crore'], done: today });
    expect(wantsEasyQuiz(a)).toBe(false);
    const b = applyEasyQuiz(newProgress(), ['nse', 'bse'], ['bse'], today, false);
    const merged = mergeProgress(a, b);
    expect(merged.easyQuiz).toEqual({ missed: ['crore', 'nse'], done: today });
    expect(isDone(merged.terms.lakh) && isDone(merged.terms.bse)).toBe(true);
    const skipped = skipEasyQuiz(b, today);
    expect(wantsEasyQuiz(skipped)).toBe(false);
    expect(skipped.easyQuiz?.missed).toEqual(['nse']);
  });

  it(`a missed or skipped easy term gets ${EASY_REVIEWS} reviews, right or wrong, then is done`, () => {
    let p = withTerms([['crore', { step: 1, due: today }]]);
    p = recordAnswer(p, { termId: 'crore', correct: false, evidence: 'medium', mode: 'path' }, today);
    expect(isDone(p.terms.crore)).toBe(false);
    expect(p.terms.crore.easy).toBe(1);
    const next = p.terms.crore.due;
    p = recordAnswer(p, { termId: 'crore', correct: true, evidence: 'medium', mode: 'path' }, next);
    expect(isDone(p.terms.crore)).toBe(true);
    expect(isKnownOn(p.terms.crore, next)).toBe(true);
    // Practice and later answers leave it alone; a missed true-or-false call doesn't bring it back.
    p = recordAnswer(p, { termId: 'crore', correct: false, evidence: 'weak', mode: 'callit' }, next);
    expect(isDone(p.terms.crore)).toBe(true);
    expect(isDueOn(p.terms.crore, '2030-01-01')).toBe(false);
  });

  it('leaves other terms on the usual ladder', () => {
    const id = hardIds[0];
    let p = withTerms([[id, { step: 1, due: today }]]);
    p = recordAnswer(p, { termId: id, correct: true, evidence: 'strong', mode: 'path' }, today);
    p = recordAnswer(p, { termId: id, correct: true, evidence: 'strong', mode: 'path' }, p.terms[id].due);
    expect(p.terms[id].easy).toBeUndefined();
    expect(isDone(p.terms[id])).toBe(false);
    expect(p.terms[id].step).toBe(3);
  });
});
