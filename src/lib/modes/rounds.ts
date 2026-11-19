/**
 * Headline Desk and Finnections: rounds of fixed, checked content at three levels.
 *
 * - Every item (a headline, a board) has a level, 1 to 3, and uses a handful of terms. It can
 *   be played once the learner has met all of them, in any mode, so a round never asks about a
 *   term they haven't seen.
 * - A mode opens once there is a full round at level 1 (three headlines, or one board).
 * - Each mode keeps its own level. Two rounds in a row at 80% or better move it up a level, once
 *   that level has a full round to play; a round under 40% moves it down one.
 * - A round takes unseen items first, then ones with a term due for review, then the ones seen
 *   longest ago. If the level is short of items, the rest come from the levels below.
 *
 * The app ships none of the content, nor which terms each item uses. The server picks each round
 * from the learner's progress (src/lib/modes/roundPick.ts) and deals it without its answers,
 * then marks each answer (src/lib/modes/roundApi.ts, worker/rounds.ts). It also tells the app
 * whether each mode is open and which levels are ready (`setRoundStatus`), so the app can show
 * them without knowing the items.
 */
import { finishModeSession, modeRecord, recordAnswer } from './knowledge';
import type { ModeId } from './ids';
import type { Progress } from '../types';

export interface HeadlineItem {
  label: string;
  move: 'up' | 'down';
  term: string;
}
export interface Headline {
  id: string;
  level: number;
  head: string;
  dek: string;
  items: HeadlineItem[];
  why: string;
}
export interface BoardGroup {
  name: string;
  terms: string[];
  why: string;
}
export interface Board {
  id: string;
  level: number;
  groups: BoardGroup[];
}

export type RoundMode = Extract<ModeId, 'headline' | 'finnections'>;
export const ROUND_MODES: RoundMode[] = ['headline', 'finnections'];
export const isRoundMode = (m: ModeId): m is RoundMode => m === 'headline' || m === 'finnections';

/** Items in one round. */
export const ROUND_SIZE: Record<RoundMode, number> = { headline: 3, finnections: 1 };
export const LEVELS = [1, 2, 3] as const;
export const MAX_LEVEL = 3;
/** A round at or above this share moves the level towards the next one; two in a row move it. */
export const RISE_AT = 0.8;
export const RISE_AFTER = 2;
/** A round below this share moves the level down one. */
export const DROP_BELOW = 0.4;

/** A headline as it is dealt: what the learner reads and the lines to call, without the moves, terms or reason. */
export interface DealtHeadline {
  id: string;
  level: number;
  head: string;
  dek: string;
  items: { label: string }[];
}
/** A board as it is dealt: its sixteen term ids in a random order, without the groups. */
export interface DealtBoard {
  id: string;
  level: number;
  tiles: string[];
}
/** A group as the server gives it back, with its place in the board's order (for its colour). */
export type FoundGroup = BoardGroup & { order: number };

export interface Access {
  open: boolean;
  /** When closed: the fewest terms still to meet before a full level 1 round can be played. */
  gap: number;
}

/** What the server says about a mode for this learner: whether it is open, and the highest level with a full round to play. */
export interface RoundStatus extends Access {
  ready: number;
}

export interface LevelState {
  /** The level rounds are played at now. */
  level: number;
  /** Good rounds in a row towards the next level. */
  good: number;
  /** The highest level with a full round to play. */
  ready: number;
}

/** The level a learner plays at: the one they earned, but no higher than the levels ready to play. */
export function levelFrom(p: Progress, mode: RoundMode, ready: number): LevelState {
  const r = modeRecord(p, mode);
  const earned = Math.min(MAX_LEVEL, Math.max(1, r.level ?? 1));
  return { level: Math.min(earned, ready), good: r.good ?? 0, ready };
}

// ---------- What the server last said (the app's copy) ----------

const status: Partial<Record<RoundMode, RoundStatus>> = {};
let statusVersion = 0;
const statusListeners = new Set<() => void>();

export function setRoundStatus(next: Partial<Record<RoundMode, RoundStatus>> | null): void {
  for (const m of ROUND_MODES) delete status[m];
  Object.assign(status, next ?? {});
  statusVersion++;
  for (const f of statusListeners) f();
}
export function subscribeRoundStatus(f: () => void): () => void {
  statusListeners.add(f);
  return () => statusListeners.delete(f);
}
export const getRoundStatusVersion = () => statusVersion;

/** Whether a mode is open yet, and if not, how far off it is. `known` is false until the server has said. */
export function access(mode: RoundMode): Access & { known: boolean } {
  const s = status[mode];
  return s ? { open: s.open, gap: s.gap, known: true } : { open: false, gap: 0, known: false };
}

export function levelState(p: Progress, mode: RoundMode): LevelState {
  return levelFrom(p, mode, status[mode]?.ready ?? 1);
}

/** The level after a round with this score (0 to 1). */
export function nextLevel(state: LevelState, score: number): { level: number; good: number } {
  if (score < DROP_BELOW) return { level: Math.max(1, state.level - 1), good: 0 };
  if (score < RISE_AT) return { level: state.level, good: 0 };
  const good = state.good + 1;
  if (good >= RISE_AFTER && state.level < state.ready) return { level: state.level + 1, good: 0 };
  // Earned, but the next level has nothing to play yet: hold the streak until it does.
  return { level: state.level, good: Math.min(good, RISE_AFTER) };
}

/**
 * Close a round: mark its items seen today, move the level, and count the session. Answers are
 * recorded as they are given, through recordAnswer, like every other mode.
 */
export function finishRound(p: Progress, mode: RoundMode, today: string, ids: string[], score: number, state = levelState(p, mode)): Progress {
  const { level, good } = nextLevel(state, score);
  const seen = { ...(modeRecord(p, mode).seen ?? {}) };
  for (const id of ids) seen[id] = today;
  return finishModeSession(p, mode, today, { level, good, seen });
}

/**
 * A headline's answers. All lines right is a medium answer for each of its terms, like picking
 * a meaning from options: guessing every line is unlikely. Otherwise each line is a true or
 * false call (weak evidence): a right one is practice, and a wrong one brings its term back
 * tomorrow. A term on two lines counts once, right only if both are.
 */
export function recordHeadline(p: Progress, h: Headline, picks: ('up' | 'down')[], today: string): Progress {
  const all = h.items.every((it, i) => picks[i] === it.move);
  const byTerm = new Map<string, boolean>();
  h.items.forEach((it, i) => byTerm.set(it.term, (byTerm.get(it.term) ?? true) && picks[i] === it.move));
  let out = p;
  for (const [termId, correct] of byTerm) out = recordAnswer(out, { termId, correct, evidence: all ? 'medium' : 'weak', mode: 'headline' }, today);
  return out;
}

/**
 * A board's answers, once it ends. A group the learner found is a medium answer for its four
 * terms. The last group, left over once three are found, is practice. A group they couldn't
 * find is a wrong call (weak): those terms come back tomorrow without losing their step.
 */
export function recordBoard(p: Progress, b: Board, found: string[], lastFree: boolean, today: string): Progress {
  let out = p;
  b.groups.forEach((g) => {
    const got = found.includes(g.name);
    const free = got && lastFree && found[found.length - 1] === g.name;
    for (const termId of g.terms)
      out = recordAnswer(out, { termId, correct: got, evidence: got ? 'medium' : 'weak', mode: 'finnections', practice: free || undefined }, today);
  });
  return out;
}

/** A board's score: groups found, of four. The last group counts when it was left over. */
export function boardScore(found: number): number {
  return found / 4;
}

/** What a level change after a round means, in a sentence. */
export function levelNote(before: number, after: number, good: number): string {
  if (after > before) return `Up to level ${after}. The rounds get harder from here.`;
  if (after < before) return `Back to level ${after} for now. Two good rounds take you up again.`;
  if (after >= 3) return 'You are at the top level.';
  if (good >= RISE_AFTER) return `Level ${after + 1} opens once you have met the terms its rounds use.`;
  if (good === 1) return `One more round at 80% or better moves you up to level ${after + 1}.`;
  return `Two rounds in a row at 80% or better move you up to level ${after + 1}.`;
}
