/**
 * Which modes this person can open. The admin can switch a mode off for everyone (Settings,
 * Admin); learners then don't see it anywhere, while the admin keeps it, marked off, to test.
 */
import { createContext, useContext } from 'react';
import { MODES, modesOn, type ModeId } from '../../lib/modes/ids';
import type { Progress } from '../../lib/types';

export interface ModeAccess {
  /** Modes switched off for everyone. */
  off: readonly string[];
  admin: boolean;
  /** Takes the list the server sent back after the admin changed it. */
  setOff: (off: string[]) => void;
}

export const ModeAccessContext = createContext<ModeAccess>({ off: [], admin: false, setOff: () => undefined });

/** The modes to show this person, and whether a shown one is off for everyone else. */
export function useModeAccess() {
  const a = useContext(ModeAccessContext);
  const shown: ModeId[] = a.admin ? MODES : modesOn(a.off);
  return { shown, isOff: (m: ModeId) => a.off.includes(m), canOpen: (m: ModeId) => shown.includes(m), ...a };
}

/**
 * The learner's own progress, when a mode is handed the one where every term counts as met
 * (Open everything, src/lib/openAll.ts). The mode's numbers (Known, Due, Strength, Coverage) come from this one.
 */
export const OwnProgressContext = createContext<Progress | null>(null);

export function useOwnProgress(shown: Progress): Progress {
  return useContext(OwnProgressContext) ?? shown;
}
