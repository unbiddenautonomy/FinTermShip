/**
 * Headline Desk and Finnections talk to the server here: a round is dealt without its answers,
 * and each answer is marked by the server (worker/rounds.ts). `npm run dev` has no server, so
 * there the same code runs in the page, never in the production build.
 */
import type { DealtBoard, DealtHeadline, FoundGroup, Headline, RoundMode } from './rounds';

async function call<T>(path: string, body: unknown): Promise<T> {
  if (import.meta.env.DEV) {
    const { dealRound, markRound } = await import('../../../worker/rounds');
    const b = body as Record<string, unknown>;
    const out = path === 'round' ? dealRound({ admin: 1, phase3: 1 }, b.mode, b.ids) : markRound({ admin: 1, phase3: 1 }, b);
    if ('error' in out) throw new Error(String(out.error));
    return out as T;
  }
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('You seem to be offline. Try again when you are back online.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new Error('Your session has ended. Reload the page to sign in again.');
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again in a moment.');
  return data;
}

/** Deal the items picked for a round. */
export async function dealRound(mode: 'headline', ids: string[]): Promise<DealtHeadline[]>;
export async function dealRound(mode: 'finnections', ids: string[]): Promise<DealtBoard[]>;
export async function dealRound(mode: RoundMode, ids: string[]): Promise<(DealtHeadline | DealtBoard)[]> {
  return (await call<{ items: (DealtHeadline | DealtBoard)[] }>('round', { mode, ids })).items;
}

/** Mark a headline's calls: the whole headline comes back, with each line's move and term and the reason. */
export async function markHeadline(id: string, picks: ('up' | 'down')[]): Promise<Headline> {
  return (await call<{ headline: Headline }>('round/mark', { mode: 'headline', id, picks })).headline;
}

/** Check four tiles: the group if they are one, otherwise whether three of them were. */
export async function guessBoard(id: string, tiles: string[]): Promise<{ group?: FoundGroup; oneAway?: boolean }> {
  return call('round/mark', { mode: 'finnections', id, tiles });
}

/** Every group of a board that is over, in the board's order. */
export async function revealBoard(id: string): Promise<FoundGroup[]> {
  return (await call<{ groups: FoundGroup[] }>('round/mark', { mode: 'finnections', id, reveal: true })).groups;
}
