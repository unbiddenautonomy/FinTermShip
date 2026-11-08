/**
 * The games on the track, by unit. Each game unit names its game in the term
 * files ("game": "payoff"); this file says how big a round is, how to pass,
 * what the score counts, and how a learner's record reads.
 */
import { BACKTEST, BACKTEST_POINTS } from './backtest';
import { unitById } from './content';
import { FERMI } from './fermi';
import { GREEKS, rupees } from './greeks';
import { GUESS } from './guess';
import { KELLY } from './kelly';
import { MM, points } from './market';
import { MEETING, MEETING_QUESTIONS } from './meeting';
import { PAIR_CALLS, PAIRS } from './pairs';
import { PAYOFF } from './payoff';
import { SIGNAL } from './signal';
import type { DrillRecord, GameId } from './types';

export interface GameSpec {
  /** What one round is, e.g. "9 turns". */
  size: string;
  /** The pass rule, starting in lower case. */
  rule: string;
  /** A short description for the unit sheet. */
  about: string;
  /** How a turn works, in a line for the unit sheet. */
  how: string;
  /** What the score on the results screen counts, and the most it can be. */
  score: { label: string; short: string; max: number };
  /** One line on the learner's record. */
  record: (rec: DrillRecord | undefined) => string;
}

/** "Passed · best 6/8" style records for games scored out of a total. */
const outOf = (max: number, fresh: string) => (rec: DrillRecord | undefined) =>
  rec?.passed ? `Passed · best ${rec.bestRight}/${max}` : rec ? `Best ${rec.bestRight}/${max}` : fresh;

export const GAMES: Record<GameId, GameSpec> = {
  market: {
    size: `${MM.turns} turns`,
    rule: `pass by quoting near fair value, keeping the spread to ${MM.maxWidth} points and ending within ${MM.flatAtEnd} lots of flat`,
    about:
      'Quote a bid and an ask on the total of three dice while traders deal with you. Some of them already know the next die. Make money from the spread without getting picked off, and keep your position under control.',
    how: 'Each turn you set a bid and an ask, and see who trades with you. The review at the end shows where the money went.',
    score: { label: 'checks met', short: 'Checks', max: 3 },
    record: (rec) => {
      if (rec?.passed) return rec.best !== undefined ? `Passed · best ${points(rec.best)} pts` : 'Passed';
      if (rec) return `${rec.rounds} game${rec.rounds === 1 ? '' : 's'} played`;
      return 'Trading game';
    },
  },
  payoff: {
    size: `${PAYOFF.targets} targets`,
    rule: `pass by building ${PAYOFF.passSolved} of ${PAYOFF.targets} target payoffs without asking for the answer`,
    about:
      'You see the payoff the desk wants at expiry. Buy and sell calls, puts and futures until your line sits on top of it: single options first, then straddles and spreads, then condors and trades built from parity.',
    how: 'Add and take away legs until your line sits on the target, then check it. After a miss you can ask to see the answer.',
    score: { label: 'solved', short: 'Solved', max: PAYOFF.targets },
    record: outOf(PAYOFF.targets, 'Options game'),
  },
  greeks: {
    size: `${GREEKS.items} books`,
    rule: `pass with ${GREEKS.passRight} of ${GREEKS.items} PnL calls right`,
    about:
      "A book's delta, gamma, vega and theta in rupees, then a move in Nifty, in IV and in time. Call the PnL before you see how it splits. It starts with an instant move and ends with a weekend.",
    how: 'Pick the PnL from four amounts, then see how much came from delta, gamma, vega and theta.',
    score: { label: 'right', short: 'Right', max: GREEKS.items },
    record: outOf(GREEKS.items, 'Options game'),
  },
  kelly: {
    size: `${KELLY.flipsPerCoin * 3} flips`,
    rule: `pass by sizing ${KELLY.sizedNeeded} of 20 bets near Kelly on the coins with an edge, sitting out ${KELLY.outNeeded} of 10 flips of the coin without one, and never betting over twice Kelly`,
    about:
      'Three biased coins, ten flips each, and ₹1 lakh to start. Before each flip, pick how much of your bankroll to bet. Bet too little and you leave growth behind; bet too much and a losing streak wrecks you.',
    how: 'Pick a share of your bankroll before each flip. After each coin you see how your bets compare with Kelly.',
    score: { label: 'checks met', short: 'Checks', max: 3 },
    record: (rec) => {
      if (rec?.passed) return rec.best !== undefined ? `Passed · best ${rupees(rec.best, false)}` : 'Passed';
      if (rec) return `Best ${rec.bestRight}/3 checks`;
      return 'Sizing game';
    },
  },
  guess: {
    size: `${GUESS.items} charts`,
    rule: `pass with ${GUESS.passHits} of ${GUESS.items} close enough: correlation within ${GUESS.corrTol}, vol within ${Math.round(GUESS.volTol * 100)}%`,
    about:
      'Guess the correlation from a scatter, the annual volatility from a price chart, and which of two return series has fat tails. Quants are expected to read these by eye before they run the numbers.',
    how: 'Slide to your guess or tap a series, then lock it in. The answer is worked out from the very points on screen.',
    score: { label: 'close enough', short: 'Hits', max: GUESS.items },
    record: outOf(GUESS.items, 'Chart game'),
  },
  fermi: {
    size: `${FERMI.items} questions`,
    rule: `pass with ${FERMI.passHits} of ${FERMI.items} estimates within 3 times the answer, a minute each`,
    about:
      'Estimate a size or a count in a minute: seconds in a session, litres in a pool, UPI payments in a month. Scored by how many powers of ten you are off, like the estimation round in quant interviews.',
    how: 'Turn the dial to your estimate before the minute runs out. Each answer shows how to work it out, with a source for facts.',
    score: { label: 'within 3×', short: 'Hits', max: FERMI.items },
    record: outOf(FERMI.items, 'Estimation game'),
  },
  meeting: {
    size: `${MEETING.clips} clips`,
    rule: `pass with ${MEETING.passRight} of ${MEETING_QUESTIONS} questions right, half a minute each`,
    about:
      'Short clips from a morning meeting, a research review, a risk call, the F&O desk, the execution desk and more. Read or listen to each one, then say what the people meant: what the PM wants done, why risk is worried, what a phrase means here.',
    how: 'Read or listen to each clip, then answer its two questions. The notes at the end list the phrases you heard.',
    score: { label: 'right', short: 'Right', max: MEETING_QUESTIONS },
    record: outOf(MEETING_QUESTIONS, 'Listening game'),
  },
  backtest: {
    size: `${BACKTEST.cases} reports`,
    rule: `pass with ${BACKTEST.passPoints} of ${BACKTEST_POINTS} points, one for finding each flaw and one for naming it`,
    about:
      'Six backtest reports that look too good, each with exactly one flaw: look-ahead, survivorship, missing costs, overfitting, data snooping, a small sample, bad data, or returns that are just the market. Find the line that gives it away, then name it.',
    how: 'Tap the line in the write-up that gives the flaw away, then pick its name. Each answer ends with what a reviewer would say.',
    score: { label: 'points', short: 'Points', max: BACKTEST_POINTS },
    record: outOf(BACKTEST_POINTS, 'Research game'),
  },
  signal: {
    size: `${SIGNAL.items} items`,
    rule: `pass with ${SIGNAL.passRight} of ${SIGNAL.items} right`,
    about:
      'Grids of in-sample Sharpe ratios over 25 settings of a signal. Some are pure noise, some have a real edge, and some hide a lucky lone peak. Take a setting live or bin the signal, then see the truth behind the grid. Plus how high luck reaches after many tries, and how fast an edge decays.',
    how: 'Tap a setting and take it live, or bin the signal. Then the lab shows the true Sharpe of every setting.',
    score: { label: 'right', short: 'Right', max: SIGNAL.items },
    record: outOf(SIGNAL.items, 'Research game'),
  },
  pairs: {
    size: `${PAIR_CALLS} weekly calls`,
    rule: `pass with ${PAIRS.passRight} of ${PAIR_CALLS} weekly calls by the rules, and every stop taken`,
    about: `Trade the z-score of three pairs of similar stocks, week by week: enter at ±${PAIRS.entry}, close near 0, stop at ±${PAIRS.stop}. One pair breaks partway through and never comes back.`,
    how: 'Each week, pick long the spread, flat or short the spread. Each call is checked against the rules from the position you hold.',
    score: { label: 'by the rules', short: 'Calls', max: PAIR_CALLS },
    record: outOf(PAIR_CALLS, 'Trading game'),
  },
};

/** The game a unit plays, or null for a unit that isn't a game. Older game units without a name play the market game. */
export function gameOf(unitId: string): GameId | null {
  const u = unitById.get(unitId);
  return u?.kind === 'game' ? (u.game ?? 'market') : null;
}

export function gameSpec(unitId: string): GameSpec | undefined {
  const g = gameOf(unitId);
  return g ? GAMES[g] : undefined;
}
