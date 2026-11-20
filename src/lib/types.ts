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
  /**
   * Terms that fit this term's definition or fill sentence too, such as a general term and a kind of
   * it (P&L and realised P&L) or two names for nearly the same thing (PAT and earnings). They are
   * never offered as each other's wrong option, nor swapped into each other's Call It claims.
   * Listed both ways round.
   */
  overlaps?: string[];
  /**
   * Terms that mean something else but would still fit one of this term's questions: its
   * definition, its fill sentence or one of its example sentences. They are never offered as its
   * wrong option, so no question shows two answers that fit. One way round only.
   */
  alsoFits?: string[];
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
  /** For a number that moves, such as a company KPI: what a rise and a fall usually mean for traders. */
  reads?: { up: string; down: string };
  /** Terms of the same area too close to stand as a wrong option in an example sentence (from the outline). */
  near?: string[];
  /** Its place among its line's stops on Term Lines (from the outline). */
  stop?: number;
  /** Its ticker on Recall Exchange (from the outline). */
  ticker?: string;
}

/**
 * What the app gets for a term once the learner reaches it, before its card: its name, its unit
 * and its place in the area (`n`). Its mix-ups list only terms the learner has reached too.
 */
export type TermStub = Pick<Term, 'id' | 'term' | 'aliases' | 'said' | 'speak' | 'unit' | 'difficulty' | 'confusables' | 'overlaps' | 'near' | 'stop' | 'ticker'> & { n: number };

/** What a term card adds to the outline: everything the term teaches and asks. The app gets it from the server. */
export const CARD_FIELDS = ['short', 'definition', 'examples', 'fill', 'alsoFits', 'wrong', 'note', 'formula', 'asOf', 'source', 'calcs', 'tf', 'reads'] as const;
export type CardBody = Pick<Term, (typeof CARD_FIELDS)[number]>;
/** The fields that teach a term, which the app may hold. The rest (fill, wrong, calcs, tf, talk, claims) is what its questions are made from, and stays on the server. */
export const TEACH_FIELDS = ['short', 'definition', 'examples', 'note', 'formula', 'asOf', 'source', 'reads'] as const;

/** A hand-written true or false claim about a term, for Call It. */
export interface WrittenClaim {
  id: string;
  term: string;
  s: string;
  a: boolean;
  why: string;
}

/** One term's card: its body, plus the Call It claims and talk items written for it. */
export interface Card extends CardBody {
  claims?: WrittenClaim[];
  talk?: TalkItem[];
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
  /** How many terms the unit has (from the skeleton), so the app can count terms it hasn't been given. */
  size?: number;
}

export type PracticeKind = 'drill' | 'game' | 'case';

/** The games: quoting a market, building payoffs, calling Greeks PnL, sizing bets, reading charts, Fermi estimates and following a meeting. */
export type GameId = 'market' | 'payoff' | 'greeks' | 'kelly' | 'guess' | 'fermi' | 'meeting' | 'backtest' | 'signal' | 'pairs' | 'expiry' | 'risk' | 'vwap' | 'readbook';

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
  /**
   * How many times this term's schedule has been moved: a first lesson finished, a review
   * applied, or a missed true-or-false call pulling it back to tomorrow. Practice doesn't count,
   * because it leaves the schedule alone. It only ever goes up, so the merge uses it to tell
   * which device is further along (`src/lib/sync.ts`). Left out until the first move, and a copy
   * saved before it existed has none, which counts as 0.
   */
  moves?: number;
}

export interface Settings {
  newPerDay: number;
  voice: boolean;
  /** Quant areas open and first on the path. Turned on with the password. */
  quantFirst?: boolean;
  /** The admin's own view: every area, advanced unit and phase 3 open. On for the admin by default; only the admin account keeps it. */
  openAll?: boolean;
  /** What to call the learner, used lightly in greetings. */
  name?: string;
  /** The career map role the learner is preparing for. */
  target?: string;
  /** The "About you" card was answered or skipped, so it stops showing on the home screen. */
  aboutAsked?: boolean;
  /** The mode the app opens in. Path when unset. */
  landing?: import('./modes/knowledge').ModeId;
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
  /** A unit the learner picked to learn next, ahead of the usual order. Null once un-picked: a missing key would let the old pick come back on the next sync. */
  focus?: string | null;
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
  /** Per-mode records (sessions, answers, Call It's best run, the Exchange index history). Never part of the shared KPIs. */
  modes?: import('./modes/knowledge').ModeRecords;
  /** When progress was last reset or replaced from a backup (ms). Sync keeps the newest start over the merge. */
  epoch?: number;
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
