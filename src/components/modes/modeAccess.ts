/**
 * Which modes this person can open. The admin can switch a mode off for everyone (Settings,
 * Admin); learners then don't see it anywhere, while the admin keeps it, marked off, to test.
 */
import { createContext, useContext } from 'react';
import { MODES, modesOn, type ModeId } from '../../lib/modes/ids';

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
