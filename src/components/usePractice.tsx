import { useEffect, useState, type ReactNode } from 'react';
import { dealPractice } from '../lib/modes/roundApi';
import { Button } from './ui';

/** A practice round dealt by the server when the screen opens: the round, or why it couldn't load. */
export function usePractice<T>(kind: 'fermi' | 'meeting' | 'backtest' | 'case', seed: number, unit?: string): { round: T | null; error: string | null; retry: () => void } {
  const [state, setState] = useState<{ key: string; round: T | null; error: string | null }>({ key: '', round: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${kind}:${unit ?? ''}:${seed}:${attempt}`;
  useEffect(() => {
    let live = true;
    dealPractice<T>(kind, unit).then(
      (round) => live && setState({ key, round, error: null }),
      (e: Error) => live && setState({ key, round: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [kind, unit, key]);
  const here = state.key === key ? state : { round: null, error: null };
  return { ...here, retry: () => setAttempt((a) => a + 1) };
}

/** Shown while a round is dealt, or when it couldn't be. */
export function PracticeWait({ error, onRetry, onQuit, children }: { error: string | null; onRetry: () => void; onQuit: () => void; children?: ReactNode }) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-3 text-center">
        {error ? (
          <>
            <p className="text-lg font-extrabold text-ink">This didn’t load</p>
            <p className="text-sm leading-relaxed text-ink-2">{error}</p>
            <div className="flex justify-center gap-3">
              <Button onClick={onRetry}>Try again</Button>
              <Button variant="secondary" onClick={onQuit}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <p className="animate-pulse text-sm font-bold text-ink-3">{children ?? 'Getting it ready…'}</p>
        )}
      </div>
    </div>
  );
}
