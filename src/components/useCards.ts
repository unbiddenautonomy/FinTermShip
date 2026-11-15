import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AccountState } from '../lib/account';
import { loadAllCardsForDev, startCards, wantCards, type CardsStatus } from '../lib/cards';
import { getCardsVersion, subscribeCards } from '../lib/content';

/**
 * The term cards for the signed-in account (src/lib/cards.ts). Nothing is
 * fetched up front: each screen asks for the cards it shows when the learner
 * opens it. This only says whether the app can run, and re-renders as cards arrive.
 */
export function useCards(account: AccountState): { status: CardsStatus; retry: () => void } {
  const [status, setStatus] = useState<CardsStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const email = account.kind === 'in' ? account.me.email : null;
  const kind = account.kind;

  useEffect(() => {
    let live = true;
    const done = (s: CardsStatus) => {
      if (live) setStatus(s);
    };
    if (import.meta.env.DEV) {
      // `npm run dev` has no server: every card, straight from the syllabus files.
      void loadAllCardsForDev().then(done);
    } else if (email) void startCards(email).then(done);
    // Lessons and rounds come from the server as they start, so the app needs a connection.
    else if (kind === 'offline') done('offline');
    else if (kind === 'out') done('signed-out');
    else if (kind !== 'loading') done('error');
    return () => {
      live = false;
    };
  }, [kind, email, attempt]);

  useSyncExternalStore(subscribeCards, getCardsVersion);

  return {
    status,
    retry: () => {
      setStatus('loading');
      setAttempt((a) => a + 1);
    },
  };
}

/**
 * Fetch the cards of these met terms while the screen that shows them is open,
 * and redraw as they arrive. Pass only terms the learner has met: a term not
 * reached yet keeps showing just its name and unit.
 */
export function useTermCards(ids: string[]): void {
  const key = ids.join('|');
  useEffect(() => {
    if (key) wantCards(key.split('|'));
  }, [key]);
  useSyncExternalStore(subscribeCards, getCardsVersion);
}
