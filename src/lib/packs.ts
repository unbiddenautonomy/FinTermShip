/**
 * The game content the server and the tests share code with: meeting clips, Fermi questions and
 * backtest reports. The app never fills these: the server deals one round at a time without its
 * answers (worker/practice.ts). The Worker and the tests fill them from src/lib/cardData.ts so
 * the round makers in src/lib can run.
 */
import { STRATEGIES, type Strategy } from './backtest';
import { fermiItems, type FermiItem } from './fermi';
import { clips, type Clip } from './meeting';

/** Put game content where the round makers read it. Other ids are skipped. */
export function applyPacks(packs: Record<string, unknown>): void {
  for (const [id, data] of Object.entries(packs)) {
    if (id === 'meeting') clips.splice(0, clips.length, ...(data as Clip[]));
    else if (id === 'fermi') fermiItems.splice(0, fermiItems.length, ...(data as FermiItem[]));
    else if (id === 'backtest') STRATEGIES.splice(0, STRATEGIES.length, ...(data as Strategy[]));
  }
}

/** Empty it again (tests). */
export function clearPacks(): void {
  clips.length = 0;
  fermiItems.length = 0;
  STRATEGIES.length = 0;
}
