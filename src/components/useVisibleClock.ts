import { useCallback, useEffect, useRef } from 'react';

/**
 * How long something has been on screen, not counting time the app spent in the background.
 * A question left open while the learner takes a call should not read as a slow answer.
 * `restart` begins the count again; `elapsed` reads it in milliseconds.
 */
export function useVisibleClock(): { restart: () => void; elapsed: () => number } {
  const from = useRef(Date.now());
  const away = useRef(0);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') leftAt.current ??= Date.now();
      else if (leftAt.current !== null) {
        away.current += Date.now() - leftAt.current;
        leftAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const restart = useCallback(() => {
    from.current = Date.now();
    away.current = 0;
    leftAt.current = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? Date.now() : null;
  }, []);

  const elapsed = useCallback(() => {
    const open = leftAt.current === null ? 0 : Date.now() - leftAt.current;
    return Math.max(0, Date.now() - from.current - away.current - open);
  }, []);

  return { restart, elapsed };
}
