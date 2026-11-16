import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchAccount, fetchSite, pullProgress, pushProgress, type AccountState, type Site } from '../lib/account';
import { withAccountView } from '../lib/choose';
import { withPhase3Key } from '../lib/phase3';
import { mergeProgress, sameProgress } from '../lib/sync';
import type { Progress } from '../lib/types';

export type SyncStatus = { state: 'idle' } | { state: 'syncing' } | { state: 'ok'; at: number } | { state: 'error'; message: string };

const SITE_KEY = 'fintermship-site';

/** The last site settings seen, so an offline start still hides switched-off modes. */
function cachedSite(): Site {
  try {
    const raw = JSON.parse(localStorage.getItem(SITE_KEY) ?? 'null') as Site | null;
    return raw && Array.isArray(raw.modesOff) ? { modesOff: raw.modesOff.filter((m) => typeof m === 'string') } : { modesOff: [] };
  } catch {
    return { modesOff: [] };
  }
}

/** Wait this long after the last change before sending progress, so a lesson sends once, not on every answer. */
const PUSH_DELAY = 2500;

/**
 * The signed-in account and progress sync. Progress is saved in the browser as
 * before; when signed in, it is also merged with the server's copy on start
 * and sent after each change.
 */
export function useAccount(progress: Progress | null, update: (p: Progress) => void) {
  const [account, setAccount] = useState<AccountState>({ kind: 'loading' });
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle' });
  const [site, setSiteState] = useState<Site>(cachedSite);
  const setSite = useCallback((s: Site) => {
    setSiteState(s);
    try {
      localStorage.setItem(SITE_KEY, JSON.stringify(s));
    } catch {
      // Storage can be unavailable; the settings still hold for this visit.
    }
  }, []);
  const latest = useRef(progress);
  latest.current = progress;
  const pulled = useRef(false);
  const lastSent = useRef<Progress | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    fetchAccount().then(setAccount);
  }, []);

  const failed = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      pulled.current = false;
      setAccount({ kind: 'out' });
      setSync({ state: 'idle' });
    } else setSync({ state: 'error', message: e instanceof Error ? e.message : 'Sync failed.' });
  }, []);

  const push = useCallback(async () => {
    const p = latest.current;
    if (!p || !pulled.current || busy.current) return;
    if (lastSent.current && sameProgress(lastSent.current, p)) return;
    busy.current = true;
    setSync({ state: 'syncing' });
    try {
      const server = await pushProgress(p);
      lastSent.current = server;
      // Changes made while the request was out stay; anything new from other devices joins them.
      const now = latest.current ?? p;
      const merged = mergeProgress(server, now);
      if (!sameProgress(merged, now)) update(merged);
      setSync({ state: 'ok', at: Date.now() });
    } catch (e) {
      failed(e);
    } finally {
      busy.current = false;
    }
  }, [update, failed]);

  // On sign-in (or opening the app signed in): fold in the server's copy, then send the result.
  const signedIn = account.kind === 'in';
  const loaded = progress !== null;
  useEffect(() => {
    if (!signedIn || !loaded || pulled.current) return;
    pulled.current = true;
    setSync({ state: 'syncing' });
    pullProgress()
      .then((server) => {
        const local = latest.current!;
        if (server) {
          // The server's settings win here: this device may have been away a while.
          const merged = mergeProgress(local, server);
          if (!sameProgress(merged, local)) update(merged);
          latest.current = merged;
        }
        return push();
      })
      .catch((e) => {
        pulled.current = false;
        failed(e);
      });
  }, [signedIn, loaded, update, push, failed]);

  // After each change, send once things go quiet.
  useEffect(() => {
    if (!signedIn || !pulled.current) return;
    const t = setTimeout(push, PUSH_DELAY);
    return () => clearTimeout(t);
  }, [progress, signedIn, push]);

  // Send right away when the app is put in the background.
  useEffect(() => {
    if (!signedIn) return;
    const onHide = () => document.visibilityState === 'hidden' && push();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [signedIn, push]);

  // Settings the admin set for everyone, fetched on sign-in and whenever the app comes back to the front.
  useEffect(() => {
    if (!signedIn) return;
    const load = () => fetchSite().then(setSite, () => undefined);
    load();
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [signedIn, setSite]);

  // Phase 3 granted on the account stands in for the password.
  const phase3 = account.kind === 'in' && account.me.phase3;
  useEffect(() => {
    if (phase3 && progress && !progress.phase3Key) update(withPhase3Key(progress));
  }, [phase3, progress, update]);

  // The admin sees every unit open unless they switch that off in Settings; no other account keeps the switch.
  const admin = account.kind === 'in' ? account.me.admin : null;
  useEffect(() => {
    if (admin === null || !progress) return;
    const next = withAccountView(progress, admin);
    if (next !== progress) update(next);
  }, [admin, progress, update]);

  const signedOut = useCallback(() => {
    pulled.current = false;
    lastSent.current = null;
    setAccount({ kind: 'out' });
    setSync({ state: 'idle' });
  }, []);

  return { account, setAccount, sync, syncNow: push, signedOut, site, setSite };
}
