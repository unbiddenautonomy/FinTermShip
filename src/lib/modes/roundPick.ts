/**
 * Headline Desk and Finnections rounds, picked on the server (and in the tests and `npm run dev`).
 * The app never has the items, nor which terms each one uses: it asks for a round, and asks
 * whether each mode is open (worker/index.ts, /api/round and /api/modes).
 */
import headlines from '../../data/modes/headlines.json';
import boards from '../../data/modes/finnections.json';
import { categoryOfTerm } from '../content';
import { shuffle, type Rng } from '../questions';
import type { Progress } from '../types';
import { isDone } from '../scheduler';
import { modeRecord } from './knowledge';
import { LEVELS, levelFrom, ROUND_MODES, ROUND_SIZE, type Board, type Headline, type LevelState, type RoundMode, type RoundStatus } from './rounds';

export interface IndexItem {
  id: string;
  level: number;
  terms: string[];
  /** Uses a phase 3 term: only for an account with phase 3. */
  phase3: boolean;
}

const item = (id: string, level: number, terms: string[]): IndexItem => {
  const unique = [...new Set(terms)].sort();
  return { id, level, terms: unique, phase3: unique.some((t) => categoryOfTerm.get(t)?.phase === 3) };
};
export const ROUND_INDEX: Record<RoundMode, IndexItem[]> = {
  headline: (headlines as Headline[]).map((h) => item(h.id, h.level, h.items.map((i) => i.term))),
  finnections: (boards as Board[]).map((b) => item(b.id, b.level, b.groups.flatMap((g) => g.terms))),
};

/** Items the learner can play: every term met (and phase 3 items only with phase 3). */
export function playable(p: Progress, mode: RoundMode, phase3 = true): IndexItem[] {
  return ROUND_INDEX[mode].filter((x) => (phase3 || !x.phase3) && x.terms.every((t) => p.terms[t]));
}

/** Levels with a full round to play. Level 1 is always listed; it may have nothing in it yet. */
function levelsReady(items: IndexItem[], mode: RoundMode): number[] {
  return LEVELS.filter((l) => l === 1 || items.filter((x) => x.level === l).length >= ROUND_SIZE[mode]);
}

/** Whether a mode is open, how far off it is if not, and the highest level ready to play. */
export function roundStatus(p: Progress, mode: RoundMode, phase3 = true): RoundStatus {
  const need = ROUND_SIZE[mode];
  const items = playable(p, mode, phase3);
  const ready = Math.max(...levelsReady(items, mode));
  if (items.filter((x) => x.level === 1).length >= need) return { open: true, gap: 0, ready };
  // The closest level 1 items, counting terms they share once.
  const missing = ROUND_INDEX[mode]
    .filter((x) => x.level === 1 && (phase3 || !x.phase3))
    .map((x) => x.terms.filter((t) => !p.terms[t]))
    .sort((a, b) => a.length - b.length);
  const set = new Set<string>();
  for (const m of missing.slice(0, need)) for (const t of m) set.add(t);
  return { open: false, gap: set.size, ready };
}

/** Both modes at once, as /api/modes answers. */
export function roundStatuses(p: Progress, phase3 = true): Record<RoundMode, RoundStatus> {
  return Object.fromEntries(ROUND_MODES.map((m) => [m, roundStatus(p, m, phase3)])) as Record<RoundMode, RoundStatus>;
}

export function serverLevel(p: Progress, mode: RoundMode, phase3 = true): LevelState {
  return levelFrom(p, mode, roundStatus(p, mode, phase3).ready);
}

/** The items for one round at the current level, best first. */
export function pickRound(p: Progress, mode: RoundMode, today: string, rng: Rng, phase3 = true): IndexItem[] {
  const { level } = serverLevel(p, mode, phase3);
  const seen = modeRecord(p, mode).seen ?? {};
  const items = playable(p, mode, phase3);
  const rank = (xs: IndexItem[]) =>
    shuffle(xs, rng)
      .map((x) => ({ x, done: x.terms.filter((t) => isDone(p.terms[t])).length, unseen: seen[x.id] ? 1 : 0, due: x.terms.some((t) => p.terms[t].due <= today) ? 0 : 1, last: seen[x.id] ?? '' }))
      // Items built on done easy terms go last, so those terms come up only when nothing else can fill the round.
      .sort((a, b) => a.done - b.done || a.unseen - b.unseen || a.due - b.due || (a.last < b.last ? -1 : a.last > b.last ? 1 : 0))
      .map((r) => r.x);
  const out: IndexItem[] = [];
  for (let l = level; l >= 1 && out.length < ROUND_SIZE[mode]; l--) out.push(...rank(items.filter((x) => x.level === l)).slice(0, ROUND_SIZE[mode] - out.length));
  return out;
}
