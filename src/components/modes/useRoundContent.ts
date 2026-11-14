import { useEffect, useState } from 'react';
import { ensurePacks } from '../../lib/cards';
import { packsFor, type RoundMode } from '../../lib/modes/rounds';
import type { Progress } from '../../lib/types';

/** Fetch the mode's content: 'loading', 'ready', or the sentence saying why it couldn't load, and a way to try again. */
export function useRoundContent(mode: RoundMode, progress: Progress): { state: string; retry: () => void } {
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const want = packsFor(mode, progress).join(',');
  useEffect(() => {
    let live = true;
    setState('loading');
    ensurePacks(want.split(',')).then((err) => live && setState(err ?? 'ready'));
    return () => {
      live = false;
    };
  }, [want, attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}
