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
}

export interface Category {
  id: string;
  name: string;
  order: number;
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
}

export interface TestAttempt {
  date: string;
  right: number;
  total: number;
  passed: boolean;
}

export type Question =
  | { kind: 'intro'; termId: string }
  | { kind: 'meaning'; termId: string; options: string[]; answer: number; review: boolean }
  | { kind: 'term'; termId: string; options: string[]; answer: number; review: boolean }
  | { kind: 'fill'; termId: string; options: string[]; answer: number; review: boolean }
  | { kind: 'calc'; termId: string; prompt: string; why: string; options: string[]; answer: number; review: boolean }
  | { kind: 'tf'; termId: string; prompt: string; why?: string; options: string[]; answer: number; review: boolean }
  | { kind: 'match'; termIds: string[]; right: string[] };

export type ScoredQuestion = Exclude<Question, { kind: 'intro' } | { kind: 'match' }>;
