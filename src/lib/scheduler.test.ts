import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  currentStreak,
  dueTermIds,
  fastLimit,
  finishLesson,
  graduate,
  intervalFor,
  introduce,
  MAX_REVIEWS_PER_DAY,
  newLeftToday,
  newProgress,
  SUM_MS,
  peakLoadAhead,
  review,
  tomorrowLoad,
} from './scheduler';
import { pathTermIds } from './content';
import type { Progress } from './types';

const today = '2026-11-04';

describe('intervals', () => {
  it('follows the ladder and shortens core terms by 20%', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => intervalFor(s, false))).toEqual([1, 3, 7, 16, 35, 120]);
    expect([1, 2, 3, 4, 5, 6].map((s) => intervalFor(s, true))).toEqual([1, 2, 6, 13, 28, 96]);
  });
});

describe('a new term', () => {
  it('is introduced at step 0, due today, and counted as new', () => {
    const p = introduce(newProgress(), 'bid', today);
    expect(p.terms.bid.step).toBe(0);
    expect(p.terms.bid.due).toBe(today);
    expect(p.days[today].newTerms).toBe(1);
    expect(dueTermIds(p, today)).toEqual(['bid']);
  });

  it('graduates to step 1, due tomorrow', () => {
    const p = graduate(introduce(newProgress(), 'bid', today), 'bid', today);
    expect(p.terms.bid.step).toBe(1);
    expect(p.terms.bid.due).toBe(addDays(today, 1));
    expect(dueTermIds(p, today)).toEqual([]);
  });
});

describe('reviews', () => {
  const start = graduate(introduce(newProgress(), 'bid', today), 'bid', today);
  const tomorrow = addDays(today, 1);

  it('moves up a step on a fast correct answer', () => {
    const p = review(start, 'bid', true, 3000, tomorrow, false);
    expect(p.terms.bid.step).toBe(2);
    expect(p.terms.bid.due).toBe(addDays(tomorrow, 3));
  });

  it('keeps the step on a slow correct answer', () => {
    const p = review(start, 'bid', true, 15000, tomorrow, false);
    expect(p.terms.bid.step).toBe(1);
    expect(p.terms.bid.due).toBe(addDays(tomorrow, 1));
  });

  it('gives a long question the time it takes to read', () => {
    // Forty words is an ordinary pick-the-term question: eleven seconds of reading before any thinking.
    const long = fastLimit(40);
    expect(long).toBeGreaterThan(15_000);
    expect(review(start, 'bid', true, 14_000, tomorrow, false, long).terms.bid.step).toBe(2);
    // The same answer is still slow for a question with nothing to read.
    expect(review(start, 'bid', true, 14_000, tomorrow, false, fastLimit(2)).terms.bid.step).toBe(1);
    // A worked sum gets time for the sum on top of reading it.
    expect(fastLimit(24, SUM_MS)).toBeGreaterThan(fastLimit(24) + 7_000);
  });

  it('drops two steps on a wrong answer, never below 1, and flags trouble after 3 misses', () => {
    let p = start;
    for (let i = 0; i < 4; i++) p = review(p, 'bid', true, 1000, tomorrow, false);
    expect(p.terms.bid.step).toBe(5);
    p = review(p, 'bid', false, 1000, tomorrow, false);
    expect(p.terms.bid.step).toBe(3);
    expect(p.terms.bid.due).toBe(addDays(tomorrow, 1));
    p = review(p, 'bid', false, 1000, tomorrow, false);
    p = review(p, 'bid', false, 1000, tomorrow, false);
    expect(p.terms.bid.step).toBe(1);
    expect(p.terms.bid.trouble).toBe(true);
  });

  it('a term always answered right is seen on days 1, 4, 11, 27, 62 and 182', () => {
    let p = start;
    let day = tomorrow;
    const seen = [day];
    for (let i = 0; i < 5; i++) {
      p = review(p, 'bid', true, 1000, day, false);
      day = p.terms.bid.due;
      seen.push(day);
    }
    expect(seen).toEqual([1, 4, 11, 27, 62, 182].map((d) => addDays(today, d)));
  });
});

describe('daily new terms', () => {
  /** A learner with `n` terms booked for review on `day`. */
  function booked(n: number, day: string): Progress {
    const p = newProgress();
    for (const id of pathTermIds().slice(0, n)) {
      p.terms[id] = { step: 2, due: day, lapses: 0, trouble: false, seen: 2, correct: 2, wrong: 0, introduced: today };
    }
    return p;
  }

  it('gives the full daily goal when tomorrow is light', () => {
    expect(newLeftToday(booked(20, addDays(today, 1)), today)).toBe(20);
  });

  it('holds new terms back when tomorrow is already near the review cap', () => {
    const p = booked(MAX_REVIEWS_PER_DAY - 6, addDays(today, 1));
    expect(tomorrowLoad(p, today)).toBe(MAX_REVIEWS_PER_DAY - 6);
    expect(newLeftToday(p, today)).toBe(6);
    expect(newLeftToday(booked(MAX_REVIEWS_PER_DAY + 5, addDays(today, 1)), today)).toBe(0);
  });

  it("counts some of today's reviews as coming back tomorrow", () => {
    expect(tomorrowLoad(booked(50, today), today)).toBe(10);
  });

  it('also holds new terms back when a day later this week is already full', () => {
    const p = booked(MAX_REVIEWS_PER_DAY - 4, addDays(today, 3));
    expect(tomorrowLoad(p, today)).toBe(0);
    expect(peakLoadAhead(p, today)).toBe(MAX_REVIEWS_PER_DAY - 4);
    expect(newLeftToday(p, today)).toBe(4);
    // Past the look-ahead, the same pile doesn't hold today back.
    expect(newLeftToday(booked(MAX_REVIEWS_PER_DAY - 4, addDays(today, 7)), today)).toBe(20);
  });
});

describe('streak', () => {
  it('grows on consecutive days and resets after a gap', () => {
    let p = finishLesson(newProgress(), today, 10);
    expect(p.streak).toBe(1);
    p = finishLesson(p, today, 10);
    expect(p.streak).toBe(1);
    p = finishLesson(p, addDays(today, 1), 10);
    expect(p.streak).toBe(2);
    expect(currentStreak(p, addDays(today, 2))).toBe(2);
    expect(currentStreak(p, addDays(today, 3))).toBe(0);
    p = finishLesson(p, addDays(today, 4), 10);
    expect(p.streak).toBe(1);
    expect(p.xp).toBe(40);
  });
});
