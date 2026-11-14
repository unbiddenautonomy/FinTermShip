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
 * The app ships only rounds.json: each item's id, level and terms. It picks a round's items from
 * that and the server deals them without their answers, then marks each answer
 * (src/lib/modes/roundApi.ts, worker/rounds.ts).
 */
import index from '../../data/modes/rounds.json';
import { shuffle, type Rng } from '../questions';
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

export interface IndexItem {
  id: string;
  level: number;
  terms: string[];
}

const read = (rows: (string | number)[][]): IndexItem[] => rows.map(([id, level, ...terms]) => ({ id: String(id), level: Number(level), terms: terms.map(String) }));
export const ROUND_INDEX: Record<RoundMode, IndexItem[]> = { headline: read(index.headline), finnections: read(index.finnections) };

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

/** Items the learner can play: every term met. */
export function playable(p: Progress, mode: RoundMode): IndexItem[] {
  return ROUND_INDEX[mode].filter((x) => x.terms.every((t) => p.terms[t]));
}

/** Levels with a full round to play. Level 1 is always listed; it may have nothing in it yet. */
function levelsReady(items: IndexItem[], mode: RoundMode): number[] {
  return LEVELS.filter((l) => l === 1 || items.filter((x) => x.level === l).length >= ROUND_SIZE[mode]);
}

export interface Access {
  open: boolean;
  /** When closed: the fewest terms still to meet before a full level 1 round can be played. */
  gap: number;
}

/** Whether a mode is open yet, and if not, how far off it is. */
export function access(p: Progress, mode: RoundMode): Access {
  const need = ROUND_SIZE[mode];
  const ready = playable(p, mode).filter((x) => x.level === 1).length;
  if (ready >= need) return { open: true, gap: 0 };
  // The closest level 1 items, counting terms they share once.
  const missing = ROUND_INDEX[mode]
    .filter((x) => x.level === 1)
    .map((x) => x.terms.filter((t) => !p.terms[t]))
    .sort((a, b) => a.length - b.length);
  const set = new Set<string>();
  for (const m of missing.slice(0, need)) for (const t of m) set.add(t);
  return { open: false, gap: set.size };
}

export interface LevelState {
  /** The level rounds are played at now. */
  level: number;
  /** Good rounds in a row towards the next level. */
  good: number;
  /** The highest level with a full round to play. */
  ready: number;
}

export function levelState(p: Progress, mode: RoundMode): LevelState {
  const r = modeRecord(p, mode);
  const ready = Math.max(...levelsReady(playable(p, mode), mode));
  const earned = Math.min(MAX_LEVEL, Math.max(1, r.level ?? 1));
  return { level: Math.min(earned, ready), good: r.good ?? 0, ready };
}

/** The items for one round at the current level, best first. */
export function pickRound(p: Progress, mode: RoundMode, today: string, rng: Rng): IndexItem[] {
  const { level } = levelState(p, mode);
  const seen = modeRecord(p, mode).seen ?? {};
  const items = playable(p, mode);
  const rank = (xs: IndexItem[]) =>
    shuffle(xs, rng)
      .map((x) => ({ x, unseen: seen[x.id] ? 1 : 0, due: x.terms.some((t) => p.terms[t].due <= today) ? 0 : 1, last: seen[x.id] ?? '' }))
      .sort((a, b) => a.unseen - b.unseen || a.due - b.due || (a.last < b.last ? -1 : a.last > b.last ? 1 : 0))
      .map((r) => r.x);
  const out: IndexItem[] = [];
  for (let l = level; l >= 1 && out.length < ROUND_SIZE[mode]; l--) out.push(...rank(items.filter((x) => x.level === l)).slice(0, ROUND_SIZE[mode] - out.length));
  return out;
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
export function finishRound(p: Progress, mode: RoundMode, today: string, ids: string[], score: number): Progress {
  const state = levelState(p, mode);
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
export function recordHeadline(p: Progress, h: Headline, picks: ('up' | 'down')[], ms: number, today: string): Progress {
  const all = h.items.every((it, i) => picks[i] === it.move);
  const byTerm = new Map<string, boolean>();
  h.items.forEach((it, i) => byTerm.set(it.term, (byTerm.get(it.term) ?? true) && picks[i] === it.move));
  let out = p;
  for (const [termId, correct] of byTerm) out = recordAnswer(out, { termId, correct, ms, evidence: all ? 'medium' : 'weak', mode: 'headline' }, today);
  return out;
}

/**
 * A board's answers, once it ends. A group the learner found is a medium answer for its four
 * terms. The last group, left over once three are found, is practice. A group they couldn't
 * find is a wrong call (weak): those terms come back tomorrow without losing their step.
 */
export function recordBoard(p: Progress, b: Board, found: string[], lastFree: boolean, ms: number, today: string): Progress {
  let out = p;
  b.groups.forEach((g) => {
    const got = found.includes(g.name);
    const free = got && lastFree && found[found.length - 1] === g.name;
    for (const termId of g.terms)
      out = recordAnswer(out, { termId, correct: got, ms, evidence: got ? 'medium' : 'weak', mode: 'finnections', practice: free || undefined }, today);
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
