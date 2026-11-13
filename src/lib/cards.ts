/**
 * Term cards from the server. The app ships with names only (the outline); a
 * term's meaning, examples and questions arrive on its card. The server sends
 * the cards this account has been given, and gives new ones as the learner
 * reaches them, a day's worth at a time (worker/cards.ts). So the browser, and
 * anyone looking at it with Inspect, holds only what this learner has reached.
 *
 * Cards are kept in IndexedDB per account, so opening the app again fetches
 * only what is new, and a learner can review offline what they have met.
 * Packs (desk cases and game content, src/lib/packs.ts) come the same way,
 * when the learner first opens that case or game.
 */
import { applyCards, clearCards, hasCard, termById } from './content';
import type { LessonPlan } from './lesson';
import { applyPacks, clearPacks, hasPack } from './packs';
import type { Card } from './types';

interface Stored {
  /** The server's card version: when the syllabus changes, every card is fetched again. */
  version: string;
  /** When the server last sent cards (ms, server time). */
  at: number;
  cards: Record<string, Card>;
  /** Desk cases and game content (src/lib/packs.ts), by pack id. */
  packs?: Record<string, unknown>;
}

// ---------- The cache ----------
const DB = 'fintermship-cards';
const STORE = 'cards';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readStored(key: string): Promise<Stored | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Stored | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeStored(key: string, value: Stored): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

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

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<CardsReply> {
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
let stored: Stored | null = null;

function remember(reply: CardsReply, fresh: boolean) {
  if (!account) return;
  const keep = !fresh && stored && stored.version === reply.version;
  const cards = keep ? { ...stored!.cards, ...reply.cards } : { ...reply.cards };
  const packs = keep ? { ...stored!.packs, ...reply.packs } : { ...reply.packs };
  stored = { version: reply.version, at: reply.at, cards, packs };
  void writeStored(account, stored);
}

/** Put what the server sent, or what this device kept, where the app reads it. */
function apply(from: { cards: Record<string, Card>; packs?: Record<string, unknown> }) {
  applyCards(from.cards);
  if (from.packs) applyPacks(from.packs);
}

/** Switch to this account's cards and packs on this device, dropping the last account's from memory. */
async function switchAccount(email: string) {
  if (account === email) return;
  if (account) {
    clearCards();
    clearPacks();
  }
  account = email;
  stored = await readStored(email);
  if (stored) apply(stored);
}

export type CardsStatus = 'loading' | 'ready' | 'offline' | 'signed-out' | 'error';

/**
 * Load this account's cards: from this device first, then whatever the server
 * has added or changed since. Resolves to 'ready' once the app can run.
 */
export async function loadCards(email: string): Promise<CardsStatus> {
  await switchAccount(email);
  try {
    const q = stored ? `?have=${encodeURIComponent(stored.version)}&since=${stored.at}` : '';
    const reply = await call('GET', `cards${q}`);
    const full = !stored || stored.version !== reply.version;
    apply(reply);
    remember(reply, full);
    return 'ready';
  } catch (e) {
    const status = e instanceof CardsError ? e.status : 0;
    if (status === 401) return 'signed-out';
    // Offline with cards on this device: carry on with those.
    if (stored) return 'ready';
    return status === 0 ? 'offline' : 'error';
  }
}

/** Load the cards kept on this device only, when the server can't be reached. */
export async function loadStoredCards(email: string): Promise<CardsStatus> {
  await switchAccount(email);
  return stored ? 'ready' : 'offline';
}

/** The account the cards on this device were last loaded for, to open offline. */
export function lastAccount(): string | null {
  try {
    return localStorage.getItem('fintermship-cards-account');
  } catch {
    return null;
  }
}
export function rememberAccount(email: string): void {
  try {
    localStorage.setItem('fintermship-cards-account', email);
  } catch {
    // Private browsing: the app still works, it just can't open offline.
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
 * Get the cards for these terms before the learner meets them. With `test`
 * (an area id, or 'phase3'), the terms are an area test's and come under the
 * day's test allowance instead of the new-term one. Resolves to null when
 * every card is here, or to a sentence saying why not.
 */
export async function ensureCards(ids: string[], test?: string): Promise<string | null> {
  const need = [...new Set(ids)].filter((id) => termById.has(id) && !hasCard(id));
  if (!need.length) return null;
  if (import.meta.env.DEV) return loadAllCardsForDev().then(() => null);
  try {
    let reason: string | undefined;
    // The server takes a few hundred at a time.
    for (let i = 0; i < need.length; i += 300) {
      const reply = await call('POST', 'cards', { ids: need.slice(i, i + 300), ...(test ? { test } : {}) });
      apply(reply);
      remember(reply, false);
      reason ??= reply.reason;
    }
    if (need.some((id) => !hasCard(id))) return reason ?? 'Some of these terms could not be loaded. Try again in a moment.';
    return null;
  } catch (e) {
    if (e instanceof CardsError && e.status === 401) return 'Your session has ended. Reload the page to sign in again.';
    return e instanceof Error ? e.message : 'Something went wrong.';
  }
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
    const reply = await call('POST', 'cards', { ids: [], packs: need });
    apply(reply);
    remember(reply, false);
    if (need.some((id) => !hasPack(id))) return reply.reason ?? 'This could not be loaded. Try again in a moment.';
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
