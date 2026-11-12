export interface Term {
  id: string;
  term: string;
  aliases?: string[];
  /** How to say it out loud, shown to the learner. */
  said?: string;
  /** Text handed to text-to-speech when the written term reads badly. */
  speak?: string;
  unit: string;
  short: string;
  definition: string;
  examples: string[];
  fill: string;
  confusables: string[];
  wrong: string[];
  note?: string;
  formula?: string;
  difficulty: number;
  asOf?: string;
  source?: string;
  /** Worked numbers. The right option is always written first and shuffled at runtime. */
  calcs?: Calc[];
  /** True or false statements that test a common misreading. */
  tf?: TrueFalse[];
}

export interface Calc {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface TrueFalse {
  s: string;
  a: boolean;
  why?: string;
}

export interface Unit {
  id: string;
  name: string;
  core: boolean;
  /**
   * Units without terms are practice on the same track: 'drill' units are timed
   * rounds of generated questions, 'game' units are games, and 'case'
   * units are desk cases of linked decisions.
   */
  kind?: 'terms' | PracticeKind;
  /** Which game a 'game' unit plays. */
  game?: GameId;
  /** Market game units after the first: which level, from 2 to 5. */
  level?: 2 | 3 | 4 | 5;
}

export type PracticeKind = 'drill' | 'game' | 'case';

/** The games: quoting a market, building payoffs, calling Greeks PnL, sizing bets, reading charts, Fermi estimates and following a meeting. */
export type GameId = 'market' | 'payoff' | 'greeks' | 'kelly' | 'guess' | 'fermi' | 'meeting' | 'backtest' | 'signal' | 'pairs' | 'expiry' | 'risk' | 'vwap' | 'readbook' | 'code';

/** The career map: roles and interview rounds, each pointing at units that prepare for it. */
export interface CareerMap {
  intro: string;
  roles: { id: string; title: string; where: string; what: string; skills: string[]; practise: string[] }[];
  rounds: { name: string; what: string; practise: string[] }[];
  note: string;
}

/** A desk case: a short story told in linked decisions. */
export interface DeskCase {
  setup: string;
  facts: string[];
  steps: CaseStep[];
}

export interface CaseStep {
  /** What has happened since the last step (optional for the first). */
  text?: string;
  ask: string;
  /** One option is marked best; each says why it is or isn't. */
  options: { text: string; best?: boolean; why: string }[];
  /** Term ids the step leans on. */
  terms: string[];
}

export interface Category {
  id: string;
  name: string;
  order: number;
  /** 3 for phase 3 areas (trading strategies): after everything else, opened by the password and the readiness test. */
  phase?: 3;
  units: Unit[];
  terms: Term[];
}

/** A term's place on the review ladder. */
export interface TermState {
  /** 0 = met today, 1..6 = ladder steps, 6 = mastered. */
  step: number;
  /** Local date (YYYY-MM-DD) the term is next due. */
  due: string;
  seen: number;
  correct: number;
  wrong: number;
  lapses: number;
  trouble: boolean;
  introduced: string;
}

export interface Settings {
  newPerDay: number;
  voice: boolean;
  /** Quant areas open and first on the path. Turned on with the password. */
  quantFirst?: boolean;
}

export interface DayStats {
  xp: number;
  newTerms: number;
  reviews: number;
  lessons: number;
}

export interface Progress {
  version: 1;
  terms: Record<string, TermState>;
  settings: Settings;
  xp: number;
  streak: number;
  lastActiveDay: string | null;
  days: Record<string, DayStats>;
  lastBackup: string | null;
  /** A unit the learner picked to learn next, ahead of the usual order. */
  focus?: string;
  /** Areas whose advanced units were opened by passing the area test. */
  unlocked?: string[];
  /** Latest area test attempt, by area id. */
  tests?: Record<string, TestAttempt>;
  /** Results of practice units (drills, games and cases), by unit id. */
  drills?: Record<string, DrillRecord>;
  /** The password was entered for phase 3. With the readiness test passed, phase 3 opens. */
  phase3Key?: boolean;
  /** The project track: steps ticked and whether the review was passed, by project id. */
  projects?: Record<string, { done: number[]; reviewed: boolean }>;
  /** Best timed mock interview round, by interview round name. */
  mocks?: Record<string, { best: number; total: number; date: string; tries: number }>;
}

export interface DrillRecord {
  rounds: number;
  /** Met the unit's target at least once. */
  passed: boolean;
  /** Most right answers in one round (checks met in a game, best calls in a case). */
  bestRight: number;
  /** Best profit in points, for games. */
  best?: number;
  /** Fastest round that had enough right answers to pass, in milliseconds. */
  bestMs?: number;
  /** Day of the latest round. */
  last: string;
  /** Day the learner chose to skip this drill until tomorrow. */
  snoozed?: string;
}

export interface TestAttempt {
  date: string;
  right: number;
  total: number;
  passed: boolean;
}

/** Talk-style practice: decode a dense line, say it like the desk, reply in the room, or spot a term used wrongly. */
export type TalkFormat = 'decode' | 'say' | 'reply' | 'misuse';

export interface TalkItem {
  id: string;
  format: TalkFormat;
  /** The term the item practises: answering it counts for this term. */
  term: string;
  /** Other terms the learner must have met before seeing it. */
  also?: string[];
  /** Who is speaking, for a reply. */
  who?: string;
  /** The line to decode, the plain sentence to put in desk words, or what was said. Not used to spot a misuse. */
  prompt?: string;
  /** The right option first; for a misuse, the sentence that misuses the term. Shuffled at runtime. */
  options: string[];
  why: string;
}

/** One of a term's example sentences with the term's name blanked out, for a fill question. */
export interface FillContext {
  /** The sentence with ____ where the name was. */
  text: string;
  /** The words that were blanked, as written in the sentence. */
  blank: string;
  /** Which example it came from, so the feedback can show a different one. */
  from: number;
}

export type Question =
  | { kind: 'intro'; termId: string }
  | { kind: 'meaning'; termId: string; options: string[]; answer: number; review: boolean }
  | { kind: 'term'; termId: string; options: string[]; answer: number; review: boolean }
  /** Fill the gap: the term's own fill sentence, or one of its examples when `context` is set. */
  | { kind: 'fill'; termId: string; options: string[]; answer: number; review: boolean; context?: FillContext }
  | { kind: 'calc'; termId: string; prompt: string; why: string; options: string[]; answer: number; review: boolean }
  | { kind: 'tf'; termId: string; prompt: string; why?: string; options: string[]; answer: number; review: boolean }
  | { kind: 'talk'; format: TalkFormat; itemId: string; termId: string; options: string[]; answer: number; review: boolean }
  /** Hear the term said aloud and pick its meaning. */
  | { kind: 'listen'; termId: string; options: string[]; answer: number; review: boolean }
  | { kind: 'match'; termIds: string[]; right: string[] };

export type ScoredQuestion = Exclude<Question, { kind: 'intro' } | { kind: 'match' }>;
