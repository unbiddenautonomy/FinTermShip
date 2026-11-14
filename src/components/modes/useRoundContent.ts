import { useEffect, useRef, useState } from 'react';
import { dealRound } from '../../lib/modes/roundApi';
import { pickRound, type DealtBoard, type DealtHeadline, type RoundMode } from '../../lib/modes/rounds';
import { seededRng } from '../../lib/questions';
import type { Progress } from '../../lib/types';

type Dealt<M extends RoundMode> = M extends 'headline' ? DealtHeadline : DealtBoard;

/**
 * One round, dealt by the server when the screen opens or the seed moves on: the items picked
 * for the learner, without their answers. `state` is 'loading', 'ready', or the sentence saying
 * why it couldn't load.
 */
export function useDealtRound<M extends RoundMode>(mode: M, progress: Progress, today: string, seed: number, open: boolean): { state: string; items: Dealt<M>[]; retry: () => void } {
  const [dealt, setDealt] = useState<{ key: string; state: string; items: Dealt<M>[] }>({ key: '', state: 'loading', items: [] });
  const [attempt, setAttempt] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const key = `${seed}:${attempt}`;
  useEffect(() => {
    if (!open) return;
    let live = true;
    const ids = pickRound(progressRef.current, mode, today, seededRng(seed)).map((x) => x.id);
    (dealRound as (m: RoundMode, ids: string[]) => Promise<Dealt<M>[]>)(mode, ids).then(
      (items) => live && setDealt({ key, state: items.length ? 'ready' : 'Nothing came through. Try again in a moment.', items }),
      (e: Error) => live && setDealt({ key, state: e.message, items: [] }),
    );
    return () => {
      live = false;
    };
  }, [mode, today, seed, open, key]);
  const current = dealt.key === key ? dealt : { state: 'loading', items: [] as Dealt<M>[] };
  return { ...current, retry: () => setAttempt((a) => a + 1) };
}
