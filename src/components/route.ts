/**
 * Which screen the address bar means, and which address a screen has.
 *
 * The app has no router: `screen` in App.tsx says what is showing. This turns that into a path
 * and back, so the browser's Back and Forward buttons work, a screen can be opened by its
 * address, and a refresh lands where the learner was.
 *
 * A lesson, drill, game, case or its results has no address. The server deals those from a seed
 * when they start and marks each answer against a token, so there is nothing an address could
 * bring back. They still take a history entry, so Back leaves the lesson instead of the app.
 */
import type { DealtPlan } from '../lib/session';
import { isModeId, type ModeId } from '../lib/modes/ids';
import type { LessonSummary } from './Lesson';

export type Tab = 'home' | 'progress' | 'guide' | 'glossary' | 'settings';

export type Screen =
  | { name: Tab; sheet?: string; q?: string }
  | { name: 'careers' }
  | { name: 'mock'; round: string }
  | { name: Exclude<ModeId, 'path'> }
  | { name: 'lesson'; plan: DealtPlan; seed: number; mode?: Exclude<ModeId, 'path'> }
  | { name: 'drill' | 'game' | 'case'; unitId: string; seed: number }
  | { name: 'results'; summary: LessonSummary };

/** Where the app is: the screen, and the unit sheet open over it. */
export interface Place {
  screen: Screen;
  /** A unit sheet over the career map, the guide or the glossary. */
  overlay: string | null;
}

export const TAB_IDS: Tab[] = ['home', 'progress', 'guide', 'glossary', 'settings'];

const isTab = (x: string): x is Tab => (TAB_IDS as string[]).includes(x);

/**
 * The screens dealt by the server. They have addresses of their own, so Back leaves the lesson
 * rather than the app, but the address can't bring one back: reloading it starts afresh.
 */
const DEALT = ['lesson', 'drill', 'game', 'case', 'results'];

/** Whether an address names a dealt screen, which is never restored and never kept in history. */
export function isDealtPath(url: string): boolean {
  const first = url.replace(/[?#].*$/, '').split('/').filter(Boolean);
  return first.length === 1 && DEALT.includes(first[0]);
}

/** Home is the root; every other screen is named by its own first path segment. */
function pathFor(screen: Screen): string {
  if (screen.name === 'home') return '/';
  if (screen.name === 'mock') return `/mock/${encodeURIComponent(screen.round)}`;
  return `/${screen.name}`;
}

/**
 * The address for a place. The unit sheet and the glossary's search ride along as queries, so
 * they belong to the screen underneath rather than replacing it.
 */
export function pathOf(place: Place): string {
  const path = pathFor(place.screen);
  if (DEALT.includes(place.screen.name)) return path;
  const query = new URLSearchParams();
  const q = place.screen.name === 'glossary' ? place.screen.q : undefined;
  if (q) query.set('q', q);
  const unit = place.overlay ?? (place.screen.name === 'home' ? place.screen.sheet : undefined);
  if (unit) query.set('unit', unit);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * The place an address means, or null when it names no screen (an address typed by hand, or a
 * dealt screen the learner has reloaded). The caller then opens the learner's usual first screen.
 */
export function placeAt(url: string): Place | null {
  try {
    return read(url);
  } catch {
    // An address that can't be read at all, such as a half-written escape in a round's name.
    return null;
  }
}

function read(url: string): Place | null {
  const parsed = new URL(url, 'http://localhost');
  const parts = parsed.pathname.split('/').filter(Boolean);
  const unit = parsed.searchParams.get('unit');
  const q = parsed.searchParams.get('q');
  const [first, second] = parts;
  if (parts.length === 0) return { screen: { name: 'home', ...(unit ? { sheet: unit } : {}) }, overlay: null };
  if (parts.length === 2 && first === 'mock' && second) return { screen: { name: 'mock', round: decodeURIComponent(second) }, overlay: null };
  if (parts.length > 1) return null;
  // A dealt screen reloaded: there is nothing to bring back.
  if (first && DEALT.includes(first)) return null;
  if (first === 'careers') return { screen: { name: 'careers' }, overlay: unit };
  if (first === 'glossary') return { screen: { name: 'glossary', ...(q ? { q } : {}) }, overlay: unit };
  if (first && isTab(first)) return { screen: { name: first }, overlay: unit };
  if (first && isModeId(first) && first !== 'path') return { screen: { name: first }, overlay: unit };
  return null;
}

/**
 * Whether moving between two addresses deserves its own history entry. Typing in the glossary's
 * search box changes only the query, and an entry per letter would make Back useless, so that
 * one is written over the entry it came from.
 */
export function sameEntry(from: string, to: string): boolean {
  const a = new URL(from, 'http://localhost');
  const b = new URL(to, 'http://localhost');
  return a.pathname === b.pathname && a.searchParams.get('unit') === b.searchParams.get('unit');
}
