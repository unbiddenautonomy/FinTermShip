import { describe, expect, it } from 'vitest';
import { coreTermIds, isCore, mainTermIds, talkById, termById } from './content';
import { addDays } from './dates';
import { DRILLS, recordDrill } from './drills';
import { recordRound } from './practice';
import { buildLesson, drillUp } from './lesson';
import { promptFor, seededRng } from './questions';
import { MAX_REVIEWS_PER_DAY, SUM_MS, dueTermIds, fastLimit, finishLesson, graduate, introduce, isKnown, newProgress, recordPractice, review, wordCount } from './scheduler';
import type { Progress, ScoredQuestion } from './types';

/** Rough timings for the minutes estimate: reading an intro card, a match round. */
const INTRO_SECONDS = 20;
const MATCH_SECONDS = 25;
/** A drill question is typed against the clock. */
const DRILL_SECONDS = 15;
/**
 * This learner reads a little slower than the pace the speed rule allows for, and takes a moment
 * to choose. Answers are timed from what is on the screen, so a question that takes longer to
 * read is given longer: a flat time would hide the thing this simulation is here to catch.
 */
const LEARNER_WPM = 200;
const THINK_MS = 3_500;
const SUM_THINK_MS = 7_000;

/**
 * Roughly what the learner has to read: the question's own words and its options. Pick-the-term
 * and fill-the-gap show a sentence about as long as the definition with the term blanked out,
 * which is what the server sends.
 */
function onScreen(q: ScoredQuestion): number {
  const t = termById.get(q.termId);
  const options = q.options.map((o) => termById.get(o)?.term ?? o).join(' ');
  const prompt =
    q.kind === 'calc' || q.kind === 'tf'
      ? q.prompt
      : q.kind === 'talk'
        ? (talkById.get(q.itemId)?.prompt ?? '')
        : q.kind === 'meaning' || q.kind === 'listen'
          ? (t?.term ?? '')
          : t
            ? promptFor(t)
            : '';
  return wordCount(`${prompt} ${options}`);
}

/** How long this learner takes to answer: reading it, then choosing, plus time for a sum. */
function answerMs(q: ScoredQuestion, words: number): number {
  return Math.round((words / LEARNER_WPM) * 60_000) + THINK_MS + (q.kind === 'calc' ? SUM_THINK_MS : 0);
}

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
    /** Time spent answering, from each question's own length. */
    let seconds = 0;
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
          seconds += MATCH_SECONDS;
          continue;
        }
        const correct = rng() < accuracy;
        const words = onScreen(q);
        const ms = answerMs(q, words);
        seconds += ms / 1000;
        if (q.review) {
          p = review(p, q.termId, correct, ms, today, isCore(q.termId), fastLimit(words, q.kind === 'calc' ? SUM_MS : 0));
          reviews++;
        } else p = recordPractice(p, q.termId, correct);
        if (!correct) {
          questions++;
          seconds += ms / 1000;
        }
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
      minutes: Math.round((intros * INTRO_SECONDS + seconds + drillQuestions * DRILL_SECONDS) / 60),
      met: states.length,
      coreMet: coreTermIds().filter((id) => p.terms[id]).length,
      known: states.filter(isKnown).length,
      dueLeft: dueTermIds(p, today).length,
    });
  }
  return out;
}

describe('ten weeks of daily use', () => {
  const days = simulate(70, 0.85, 7);

  it('keeps each day to a steady size', () => {
    for (const d of days) {
      expect(d.newTerms).toBeLessThanOrEqual(20);
      expect(d.reviews).toBeLessThanOrEqual(MAX_REVIEWS_PER_DAY);
      // Timed from each question's own length, the day's median is about 40 minutes and the
      // busiest days, when a full 20 new terms meet a full load of reviews, run to about an hour.
      expect(d.minutes).toBeLessThanOrEqual(65);
    }
  });

  it('finishes the core sweep before going deeper, and meets every term', () => {
    const coreDone = days.find((d) => d.coreMet === coreTermIds().length)!;
    expect(coreDone).toBeDefined();
    // At 20 new terms a day the sweep takes about core terms ÷ 20 days.
    expect(coreDone.day).toBeLessThanOrEqual(Math.ceil(coreTermIds().length / 20) + 1);
    // Phase 3 stays shut without the password, so this learner meets every term outside it.
    expect(days[days.length - 1].met).toBe(mainTermIds().length);
  });

  it('turns most terms into known terms by week 9 and never builds a backlog', () => {
    const last = days[days.length - 1];
    expect(last.known / last.met).toBeGreaterThan(0.6);
    // On a heavy day some reviews can spill past the daily cap (at most 15 in this run, under a fifth of a day's cap); they must clear within two days.
    days.forEach((d, i) => {
      expect(d.dueLeft).toBeLessThanOrEqual(15);
      if (d.dueLeft > 0 && i + 2 < days.length) expect(days[i + 2].dueLeft).toBe(0);
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
      // A catch-up day runs to about an hour at this learner's reading pace.
      expect(d.minutes).toBeLessThanOrEqual(65);
      if (d.dueLeft > 0) expect(d.newTerms).toBeLessThan(20);
    }
    const cleared = back.find((d) => d.dueLeft === 0)!;
    expect(cleared.day).toBeLessThanOrEqual(20);
  });
});
