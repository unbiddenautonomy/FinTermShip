/**
 * Headline Desk and Finnections, dealt and marked here. The app picks which items a round uses
 * from rounds.json (ids, levels and terms only) and asks for them; it gets each item without
 * its answers. A headline comes as its head, dek and the lines to call, and a call is sent here
 * to be marked. A board comes as its sixteen tiles in a random order; each guess of four is
 * checked here, and the groups come back only once the board is over.
 */
// Every term's name, before anything reads the syllabus.
import '../src/lib/syllabus';
import { content as cardContent } from './cards';
import type { Board, BoardGroup, Headline } from '../src/lib/modes/rounds';

const ROUND_SIZE = { headline: 3, finnections: 1 } as const;
export type RoundMode = keyof typeof ROUND_SIZE;

const built = (() => {
  const { packs } = cardContent();
  const headlines = new Map<string, { item: Headline; phase3: boolean }>();
  const boards = new Map<string, { item: Board; phase3: boolean }>();
  for (const [id, phase3] of [['headlines', false], ['headlines:p3', true]] as const) for (const h of (packs.get(id) ?? []) as Headline[]) headlines.set(h.id, { item: h, phase3 });
  for (const [id, phase3] of [['finnections', false], ['finnections:p3', true]] as const) for (const b of (packs.get(id) ?? []) as Board[]) boards.set(b.id, { item: b, phase3 });
  return { headlines, boards };
})();

export interface DealtHeadline {
  id: string;
  level: number;
  head: string;
  dek: string;
  items: { label: string }[];
}
export interface DealtBoard {
  id: string;
  level: number;
  tiles: string[];
}

interface RoundUser {
  admin: number;
  phase3: number;
}

const isMode = (m: unknown): m is RoundMode => m === 'headline' || m === 'finnections';

function find(mode: RoundMode, id: unknown, user: RoundUser) {
  if (typeof id !== 'string') return undefined;
  const row = mode === 'headline' ? built.headlines.get(id) : built.boards.get(id);
  if (!row || (row.phase3 && !user.phase3 && !user.admin)) return undefined;
  return row.item;
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deal the items the app picked, without their answers. Unknown ids, and phase 3 items before phase 3, are left out. */
export function dealRound(user: RoundUser, mode: unknown, ids: unknown): { items: (DealtHeadline | DealtBoard)[] } | { error: string } {
  if (!isMode(mode)) return { error: 'Unknown mode.' };
  const wanted = [...new Set(Array.isArray(ids) ? ids : [])].slice(0, ROUND_SIZE[mode]);
  const items: (DealtHeadline | DealtBoard)[] = [];
  for (const id of wanted) {
    const item = find(mode, id, user);
    if (!item) continue;
    if (mode === 'headline') {
      const h = item as Headline;
      items.push({ id: h.id, level: h.level, head: h.head, dek: h.dek, items: h.items.map((i) => ({ label: i.label })) });
    } else {
      const b = item as Board;
      items.push({ id: b.id, level: b.level, tiles: shuffled(b.groups.flatMap((g) => g.terms)) });
    }
  }
  return { items };
}

export type GroupReply = BoardGroup & { order: number };

/**
 * Mark an answer.
 * - A headline's calls: the whole headline comes back, with each line's move and term and the reason.
 * - A board guess of four tiles: the group if they are one, or whether three of them were.
 * - A board that is over (`reveal`): every group, in the board's order.
 */
export function markRound(user: RoundUser, b: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const mode = b.mode;
  if (!isMode(mode)) return { error: 'Unknown mode.' };
  const item = find(mode, b.id, user);
  if (!item) return { error: 'That round is not available.' };
  if (mode === 'headline') {
    const h = item as Headline;
    const picks = Array.isArray(b.picks) ? b.picks : [];
    if (picks.length !== h.items.length || !picks.every((m) => m === 'up' || m === 'down')) return { error: 'Call every line first.' };
    return { headline: h };
  }
  const board = item as Board;
  if (b.reveal === true) return { groups: board.groups.map((g, order) => ({ ...g, order })) };
  const tiles = Array.isArray(b.tiles) ? [...new Set(b.tiles.filter((t): t is string => typeof t === 'string'))] : [];
  if (tiles.length !== 4) return { error: 'Pick four tiles.' };
  const order = board.groups.findIndex((g) => tiles.every((t) => g.terms.includes(t)));
  if (order >= 0) return { group: { ...board.groups[order], order } };
  return { oneAway: board.groups.some((g) => tiles.filter((t) => g.terms.includes(t)).length === 3) };
}
