/**
 * Packs: a desk case, or the content one game draws on (meeting clips, Fermi
 * questions, backtest reports). Like term cards, they are not in the app's
 * files: the server sends a pack when the learner opens that case or game
 * (worker/cards.ts), and the app keeps it with the account's cards.
 */
import { STRATEGIES, type Strategy } from './backtest';
import { caseById, unitById } from './content';
import { fermiItems, type FermiItem } from './fermi';
import { clips, type Clip } from './meeting';
import type { DeskCase } from './types';

/** Games whose content is a pack; the others make their rounds in code. */
const GAME_PACKS = ['meeting', 'fermi', 'backtest'];

const have = new Set<string>();

/** The pack a practice unit needs before it can open, if any: 'case:<unit id>', or a game's id. */
export function packOf(unitId: string): string | null {
  const u = unitById.get(unitId);
  if (u?.kind === 'case') return `case:${unitId}`;
  if (u?.kind === 'game' && u.game && GAME_PACKS.includes(u.game)) return u.game;
  return null;
}

export function hasPack(id: string): boolean {
  return have.has(id);
}

/** Put packs where their screens read them. Unknown ids are skipped. */
export function applyPacks(packs: Record<string, unknown>): void {
  for (const [id, data] of Object.entries(packs)) {
    if (id.startsWith('case:')) caseById.set(id.slice(5), data as DeskCase);
    else if (id === 'meeting') clips.splice(0, clips.length, ...(data as Clip[]));
    else if (id === 'fermi') fermiItems.splice(0, fermiItems.length, ...(data as FermiItem[]));
    else if (id === 'backtest') STRATEGIES.splice(0, STRATEGIES.length, ...(data as Strategy[]));
    else continue;
    have.add(id);
  }
}

/** Empty every pack again (signing in as someone else on this device, and tests). */
export function clearPacks(): void {
  caseById.clear();
  clips.length = 0;
  fermiItems.length = 0;
  STRATEGIES.length = 0;
  have.clear();
}
