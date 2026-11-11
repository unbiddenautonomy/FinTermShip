import { describe, expect, it } from 'vitest';
import { coreTermIds, isCore, mainTermIds } from './content';
import { addDays } from './dates';
import { DRILLS, recordDrill } from './drills';
import { recordRound } from './practice';
import { buildLesson, drillUp } from './lesson';
import { seededRng } from './questions';
import { MAX_REVIEWS_PER_DAY, dueTermIds, finishLesson, graduate, introduce, isKnown, newProgress, recordPractice, review } from './scheduler';
import type { Progress } from './types';

/** Rough timings for the minutes estimate: reading an intro card, answering a question. */
const INTRO_SECONDS = 20;
const QUESTION_SECONDS = 9;
/** A drill question is typed against the clock. */
const DRILL_SECONDS = 15;

interface Day {
  day: number;
  lessons: number;
  newTerms: number;
  reviews: number;
  questions: number;
  minutes: number;
  met: number;
  coreMet: number;
  known: number;
  dueLeft: number;
}

/**
 * Plays the app the way a learner would: each day, keep starting lessons until
 * the app has nothing left for today, answering with the given accuracy.
 * Mirrors Lesson.tsx: intros introduce, scored reviews move the ladder, other
 * questions are practice, and a missed question is asked once more.
 */
function simulate(days: number, accuracy: number, seed: number, skipped: number[] = []): Day[] {
  let p: Progress = newProgress();
  const rng = seededRng(seed);
  const start = '2026-11-09';
  const out: Day[] = [];
  for (let d = 0; d < days; d++) {
    const today = addDays(start, d);
    let lessons = 0;
    let newTerms = 0;
    let reviews = 0;
    let questions = 0;
    let intros = 0;
    let drillQuestions = 0;
    for (let guard = 0; guard < 60 && !skipped.includes(d + 1); guard++) {
      // On the one track a drill, game or case comes up in turn; this learner passes it first time.
      const drill = drillUp(p, today);
      if (drill) {
        const spec = DRILLS[drill];
        if (spec) {
          p = recordDrill(p, drill, spec.passRight, spec.targetSec * 900, today);
          drillQuestions += spec.count;
        } else {
          // A game or desk case: about as long as a drill, passed first time.
          p = recordRound(p, drill, 3, true, today);
          drillQuestions += 10;
        }
        p = finishLesson(p, today, 10);
        lessons++;
        continue;
      }
      const plan = buildLesson(p, today, rng);
      if (!plan) break;
      for (const q of plan.questions) {
        if (q.kind === 'intro') {
          p = introduce(p, q.termId, today);
          intros++;
          continue;
        }
        questions++;
        if (q.kind === 'match') {
          for (const id of q.termIds) p = recordPractice(p, id, rng() < accuracy);
          continue;
        }
        const correct = rng() < accuracy;
        if (q.review) {
          p = review(p, q.termId, correct, 6000, today, isCore(q.termId));
          reviews++;
        } else p = recordPractice(p, q.termId, correct);
        if (!correct) questions++;
      }
      for (const id of plan.newIds) p = graduate(p, id, today);
      newTerms += plan.newIds.length;
      p = finishLesson(p, today, 10);
      lessons++;
    }
    const states = Object.values(p.terms);
    out.push({
      day: d + 1,
      lessons,
      newTerms,
      reviews,
      questions,
      minutes: Math.round((intros * INTRO_SECONDS + questions * QUESTION_SECONDS + drillQuestions * DRILL_SECONDS) / 60),
      met: states.length,
      coreMet: coreTermIds.filter((id) => p.terms[id]).length,
      known: states.filter(isKnown).length,
      dueLeft: dueTermIds(p, today).length,
    });
  }
  return out;
}

describe('eight weeks of daily use', () => {
  const days = simulate(56, 0.85, 7);

  it('keeps each day to a steady size', () => {
    for (const d of days) {
      expect(d.newTerms).toBeLessThanOrEqual(20);
      expect(d.reviews).toBeLessThanOrEqual(MAX_REVIEWS_PER_DAY);
      // The busiest days, when a full 20 new terms meet a full load of reviews, run a little over 40 minutes, and a game or case can come on top.
      expect(d.minutes).toBeLessThanOrEqual(50);
    }
  });

  it('finishes the core sweep before going deeper, and meets every term', () => {
    const coreDone = days.find((d) => d.coreMet === coreTermIds.length)!;
    expect(coreDone).toBeDefined();
    // At 20 new terms a day the sweep takes about core terms ÷ 20 days.
    expect(coreDone.day).toBeLessThanOrEqual(Math.ceil(coreTermIds.length / 20) + 1);
    // Phase 3 stays shut without the password, so this learner meets every term outside it.
    expect(days[days.length - 1].met).toBe(mainTermIds.length);
  });

  it('turns most terms into known terms by week 8 and never builds a backlog', () => {
    const last = days[days.length - 1];
    expect(last.known / last.met).toBeGreaterThan(0.6);
    // On a heavy day a few reviews can spill past the daily cap; they must be small and clear the next day.
    days.forEach((d, i) => {
      expect(d.dueLeft).toBeLessThanOrEqual(5);
      if (d.dueLeft > 0 && i + 1 < days.length) expect(days[i + 1].dueLeft).toBe(0);
    });
  });

  it('prints the daily load', () => {
    const rows = days.filter((d) => d.day <= 21 || d.day % 7 === 0);
    console.table(rows);
  });
});

describe('coming back after a week away', () => {
  const days = simulate(35, 0.8, 11, [9, 10, 11, 12, 13, 14, 15]);

  it('spreads the pile-up over a few days and pauses new terms until it clears', () => {
    const back = days.slice(15);
    for (const d of back) {
      expect(d.reviews).toBeLessThanOrEqual(MAX_REVIEWS_PER_DAY);
      // The busiest days, when a full 20 new terms meet a full load of reviews, run a little over 40 minutes.
      expect(d.minutes).toBeLessThanOrEqual(45);
      if (d.dueLeft > 0) expect(d.newTerms).toBeLessThan(20);
    }
    const cleared = back.find((d) => d.dueLeft === 0)!;
    expect(cleared.day).toBeLessThanOrEqual(20);
  });
});
