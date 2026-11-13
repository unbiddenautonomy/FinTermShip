import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AccountState } from '../lib/account';
import { ensureCards, lastAccount, loadAllCardsForDev, loadCards, loadStoredCards, rememberAccount, type CardsStatus } from '../lib/cards';
import { getCardsVersion, hasCard, subscribeCards, termById } from '../lib/content';
import type { Progress } from '../lib/types';

/**
 * The term cards for the signed-in account (src/lib/cards.ts). The app waits
 * for them before it shows anything, and re-renders as more arrive.
 */
export function useCards(account: AccountState, progress: Progress | null): { status: CardsStatus; retry: () => void } {
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
    } else if (email) {
      rememberAccount(email);
      void loadCards(email).then(done);
    } else if (kind === 'offline') {
      const last = lastAccount();
      if (last) void loadStoredCards(last).then(done);
      else done('offline');
    } else if (kind === 'out') done('signed-out');
    else if (kind !== 'loading') done('error');
    return () => {
      live = false;
    };
  }, [kind, email, attempt]);

  useSyncExternalStore(subscribeCards, getCardsVersion);

  // Terms already met on this device whose cards aren't here (met before cards came from the server, or on a device that hadn't synced): ask once.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (status !== 'ready' || !progress || !email) return;
    const missing = Object.keys(progress.terms).filter((id) => termById.has(id) && !hasCard(id) && !asked.current.has(id));
    if (!missing.length) return;
    for (const id of missing) asked.current.add(id);
    void ensureCards(missing);
  }, [status, progress, email]);

  return {
    status,
    retry: () => {
      setStatus('loading');
      setAttempt((a) => a + 1);
    },
  };
}
