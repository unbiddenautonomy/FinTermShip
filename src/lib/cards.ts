/**
 * Term cards from the server. The app ships with names only (the outline); a
 * term's meaning, examples and questions arrive on its card. The app asks for a
 * card only when the learner does something that shows it: starts a lesson,
 * opens a term, deals a round (worker/cards.ts). There is no download of
 * everything given so far, and nothing is kept on the device: cards live in
 * memory for this session and go when the page closes or someone else signs in.
 * Packs (desk cases and game content, src/lib/packs.ts) come the same way,
 * when the learner opens that case or game.
 */
import { applyCards, clearCards, hasCard, termById } from './content';
import type { LessonPlan } from './lesson';
import { applyPacks, clearPacks, hasPack } from './packs';
import type { Card } from './types';

// ---------- Talking to the server ----------
class CardsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface CardsReply {
  version: string;
  at: number;
  cards: Record<string, Card>;
  packs?: Record<string, unknown>;
  /** Asked-for terms the server would not give (yet), and why. */
  refused?: string[];
  reason?: string;
}

async function call(method: 'POST', path: string, body?: unknown): Promise<CardsReply> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CardsError(0, 'You seem to be offline. Try again when you are back online.');
  }
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new CardsError(503, 'The term cards are not available here.');
  const data = (await res.json()) as CardsReply & { error?: string };
  if (!res.ok) throw new CardsError(res.status, data.error ?? 'Something went wrong.');
  return data;
}

let account: string | null = null;

/** Put what the server sent where the app reads it. */
function apply(from: { cards: Record<string, Card>; packs?: Record<string, unknown> }) {
  applyCards(from.cards);
  if (from.packs) applyPacks(from.packs);
}

export type CardsStatus = 'loading' | 'ready' | 'offline' | 'signed-out' | 'error';

/**
 * Start a signed-in session: nothing is fetched until the learner does
 * something. Signing in as someone else drops the last account's cards from
 * memory, and any cards an older version of the app kept on this device are
 * deleted.
 */
export function startCards(email: string): CardsStatus {
  if (account !== email) {
    if (account) {
      clearCards();
      clearPacks();
    }
    tried.clear();
    account = email;
  }
  forgetStoredCards();
  return 'ready';
}

/** Delete what earlier versions of the app kept on the device (IndexedDB and the last account's email). */
let forgotten = false;
function forgetStoredCards() {
  if (forgotten) return;
  forgotten = true;
  try {
    indexedDB.deleteDatabase('fintermship-cards');
  } catch {
    // No IndexedDB here: nothing was stored.
  }
  try {
    localStorage.removeItem('fintermship-cards-account');
  } catch {
    // Private browsing.
  }
}

/** Every card and pack at once, for `npm run dev`, which has no server. Never part of the production build. */
export async function loadAllCardsForDev(): Promise<CardsStatus> {
  if (import.meta.env.DEV) {
    const { buildCards, buildPacks } = await import('./cardData');
    applyCards(Object.fromEntries(buildCards()));
    applyPacks(Object.fromEntries(buildPacks()));
    return 'ready';
  }
  return 'error';
}

/**
 * Get the cards for these terms, just before a screen shows them. Resolves to
 * null when every card is here, or to a sentence saying why not.
 */
export async function ensureCards(ids: string[]): Promise<string | null> {
  const need = [...new Set(ids)].filter((id) => termById.has(id) && !hasCard(id));
  if (!need.length) return null;
  if (import.meta.env.DEV) return loadAllCardsForDev().then(() => null);
  try {
    let reason: string | undefined;
    // The server takes a screen's worth (MAX_IDS in worker/cards.ts) at a time.
    for (let i = 0; i < need.length; i += 80) {
      const reply = await call('POST', 'cards', { ids: need.slice(i, i + 80) });
      apply(reply);
      reason ??= reply.reason;
    }
    if (need.some((id) => !hasCard(id))) return reason ?? 'Some of these terms could not be loaded. Try again in a moment.';
    return null;
  } catch (e) {
    if (e instanceof CardsError && e.status === 401) return 'Your session has ended. Reload the page to sign in again.';
    return e instanceof Error ? e.message : 'Something went wrong.';
  }
}

const tried = new Set<string>();

/**
 * Fetch these cards in the background, for a screen that shows terms the
 * learner has met (a term sheet, a unit's list). Each term is asked for once a
 * session, so a screen that redraws doesn't ask again; one that failed can be
 * asked for again after a short wait.
 */
export function wantCards(ids: string[]): void {
  const need = [...new Set(ids)].filter((id) => termById.has(id) && !hasCard(id) && !tried.has(id));
  if (!need.length) return;
  for (const id of need) tried.add(id);
  void ensureCards(need).then((failed) => {
    if (failed) setTimeout(() => need.forEach((id) => tried.delete(id)), 30_000);
  });
}

/**
 * Get packs (a desk case, a game's content) before the learner opens them.
 * Resolves to null when they are all here, or to a sentence saying why not.
 */
export async function ensurePacks(ids: string[]): Promise<string | null> {
  const need = [...new Set(ids)].filter((id) => !hasPack(id));
  if (!need.length) return null;
  if (import.meta.env.DEV) return loadAllCardsForDev().then(() => null);
  try {
    let reason: string | undefined;
    for (let i = 0; i < need.length; i += 4) {
      const reply = await call('POST', 'cards', { ids: [], packs: need.slice(i, i + 4) });
      apply(reply);
      reason ??= reply.reason;
    }
    if (need.some((id) => !hasPack(id))) return reason ?? 'This could not be loaded. Try again in a moment.';
    return null;
  } catch (e) {
    if (e instanceof CardsError && e.status === 401) return 'Your session has ended. Reload the page to sign in again.';
    return e instanceof Error ? e.message : 'Something went wrong.';
  }
}

/** Every term a lesson plan shows or asks about. */
export function planTermIds(plan: LessonPlan): string[] {
  const ids = new Set([...plan.newIds, ...plan.reviewIds]);
  for (const q of plan.questions) {
    if ('termId' in q) ids.add(q.termId);
    if ('termIds' in q) for (const id of q.termIds) ids.add(id);
  }
  return [...ids];
}
