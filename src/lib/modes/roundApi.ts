/**
 * Headline Desk, Finnections, Call It, desk cases and the pack games talk to the server here: a round is dealt without its answers,
 * and each answer is marked by the server (worker/rounds.ts). `npm run dev` has no server, so
 * there the same code runs in the page, never in the production build.
 */
import { addTerms } from '../content';
import { packJson } from '../post';
import type { Progress, TermStub } from '../types';
import { setRoundStatus, type DealtBoard, type DealtHeadline, type FoundGroup, type Headline, type RoundMode, type RoundStatus } from './rounds';

export async function call<T>(path: string, body: unknown): Promise<T> {
  if (import.meta.env.DEV && (path.startsWith('round') || path === 'modes')) {
    const { dealRound, markRound, modeStatus } = await import('../../../worker/rounds');
    const b = body as Record<string, unknown>;
    const dev = { admin: 1, phase3: 1 };
    const out = path === 'modes' ? { status: modeStatus(dev, b.progress) } : path === 'round' ? dealRound(dev, b.mode, b.progress, b.today, Date.now() % 2_147_483_647) : markRound(dev, b);
    if ('error' in out) throw new Error(String(out.error));
    return out as T;
  }
  let res: Response;
  try {
    const sent = await packJson(body);
    res = await fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin', headers: sent.headers, body: sent.body });
  } catch {
    throw new Error('You seem to be offline. Try again when you are back online.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; terms?: TermStub[] };
  if (res.status === 401) throw new Error('Your session has ended. Reload the page to sign in again.');
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again in a moment.');
  // The names of the terms the reply shows: the app ships with none (worker/terms.ts).
  if (Array.isArray(data.terms)) addTerms(data.terms);
  return data;
}

/** A round picked by the server for this progress, dealt without its answers. */
export async function dealRound(mode: 'headline', progress: Progress, today: string): Promise<DealtHeadline[]>;
export async function dealRound(mode: 'finnections', progress: Progress, today: string): Promise<DealtBoard[]>;
export async function dealRound(mode: RoundMode, progress: Progress, today: string): Promise<(DealtHeadline | DealtBoard)[]> {
  return (await call<{ items: (DealtHeadline | DealtBoard)[] }>('round', { mode, progress, today })).items;
}

// Which modes are open depends only on which terms are met: ask again when that changes.
let statusFor = '';
let statusAsk: Promise<void> | null = null;
const metKey = (p: Progress) => {
  const ids = Object.keys(p.terms).sort();
  let h = 0;
  for (const id of ids) for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${ids.length}:${h}`;
};

/**
 * Ask the server whether Headline Desk and Finnections are open for this progress, and which
 * levels are ready. Does nothing while the met terms are the ones last asked about.
 */
export function wantRoundStatus(p: Progress): Promise<void> {
  const key = metKey(p);
  if (key === statusFor && statusAsk) return statusAsk;
  statusFor = key;
  // Only which terms are met matters, so only that is sent.
  const met = Object.fromEntries(Object.keys(p.terms).map((id) => [id, { due: p.terms[id].due }]));
  statusAsk = call<{ status: Record<RoundMode, RoundStatus> }>('modes', { progress: { terms: met } }).then(
    (r) => setRoundStatus(r.status),
    () => {
      // Try again next time progress changes.
      statusFor = '';
    },
  );
  return statusAsk;
}

/** Forget what the server said (signing in as someone else on this device). */
export function resetRoundStatus(): void {
  statusFor = '';
  statusAsk = null;
  setRoundStatus(null);
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

/** Deal a Call It deck: one claim per term, without whether it is true. `known` are met terms whose glosses may be swapped in. */
export async function dealDeck(ids: string[], known: string[]): Promise<{ termId: string; text: string }[]> {
  if (import.meta.env.DEV) {
    const { dealDeck: deal } = await import('../../../worker/callit');
    return deal({ admin: 1, phase3: 1 }, ids, known).claims;
  }
  return (await call<{ claims: { termId: string; text: string }[] }>('callit', { ids, known })).claims;
}

/** Mark a call on a claim: whether it was true, and why. */
export async function markCall(termId: string, text: string): Promise<{ truth: boolean; why: string }> {
  if (import.meta.env.DEV) {
    const { markCall: mark } = await import('../../../worker/callit');
    const out = mark({ admin: 1, phase3: 1 }, termId, text);
    if ('error' in out) throw new Error(out.error);
    return out;
  }
  return call('callit/mark', { termId, text });
}

/** Deal a desk case, Fermi, meeting or backtest round, without its answers. */
export async function dealPractice<T>(kind: 'fermi' | 'meeting' | 'backtest' | 'case', unit?: string): Promise<T> {
  if (import.meta.env.DEV) {
    const { dealPractice: deal } = await import('../../../worker/practice');
    const out = deal({ admin: 1, phase3: 1 }, kind, unit);
    if ('error' in out) throw new Error(String(out.error));
    return out as T;
  }
  return call<T>('practice', { kind, unit });
}

/** Mark one answer in a practice round: the right answer and the reason come back. */
export async function markPractice<T>(body: Record<string, unknown>): Promise<T> {
  if (import.meta.env.DEV) {
    const { markPractice: mark } = await import('../../../worker/practice');
    const out = mark({ admin: 1, phase3: 1 }, body);
    if ('error' in out) throw new Error(String(out.error));
    return out as T;
  }
  return call<T>('practice/mark', body);
}

/** What to show the learner when a pick could not be marked. */
export const markMessage = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again in a moment.');
