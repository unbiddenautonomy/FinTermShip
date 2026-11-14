/**
 * Lessons, practice rounds, area tests and mode rounds, built and marked here. The app sends
 * which kind of session it wants (a recipe) and the learner's progress; the Worker builds the
 * session with the app's own builders and sends each question without its answer.
 *
 * Each question carries a sealed token: its answer (and reason) encrypted with a key only the
 * Worker holds. A pick is marked by sending the token back, and only then do the right answer,
 * the reason and the term's card come. Nothing is remembered per question on the server.
 */
import { buildCards } from '../src/lib/cardData';
import { buildPractice, buildTest } from '../src/lib/choose';
import { applyCards, talkById, termById } from '../src/lib/content';
import { buildLesson, type LessonPlan } from '../src/lib/lesson';
import { buildDefend, buildListing, buildRally, buildRevisit, buildRide, DEFEND_MAX } from '../src/lib/modes/plans';
import { buildPhase3Test, PHASE3 } from '../src/lib/phase3';
import { promptFor, retryQuestion, seededRng, tidyOption, type Rng } from '../src/lib/questions';
import { buildWeakSpots } from '../src/lib/weak';
import type { Card, Progress, Question, TalkFormat } from '../src/lib/types';
import { teachingCard } from './cards';

// The builders read terms from the app's content module: give it every card, once.
applyCards(Object.fromEntries(buildCards()));

// ---------- What the app gets ----------

interface Base {
  termId: string;
  review: boolean;
  options: string[];
  token: string;
  /** The question asked again at the end of the lesson if this one is missed. */
  retry?: DealtQuestion;
}
export type DealtQuestion =
  | { kind: 'intro'; termId: string }
  | (Base & { kind: 'meaning' | 'listen' })
  /** Options are term ids. */
  | (Base & { kind: 'term'; prompt: string })
  /** Options are term ids; `text` has ____ where the term goes, and `from` is the example it came from, if one did. */
  | (Base & { kind: 'fill'; text: string; from?: number })
  | (Base & { kind: 'calc' | 'tf'; prompt: string })
  | (Base & { kind: 'talk'; format: TalkFormat; who?: string; prompt?: string })
  /** Terms on the left, meanings on the right; each pair is checked here. */
  | { kind: 'match'; termIds: string[]; right: string[]; token: string };

export type DealtPlan = Omit<LessonPlan, 'questions'> & { questions: DealtQuestion[] };

/** What a sealed token holds. */
interface Sealed {
  /** The account it was dealt to. */
  u: number;
  /** The right option's index, as dealt. */
  a?: number;
  t?: string;
  /** The reason (a worked sum, a true or false call, desk talk). */
  w?: string;
  /** For a fill question: the words the gap stands for. */
  b?: string;
  /** For a match: for each term on the left, the index of its meaning on the right. */
  m?: number[];
}

// ---------- Sealing ----------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function seal(key: CryptoKey, body: Sealed): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(body))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

async function unseal(key: CryptoKey, token: unknown): Promise<Sealed | null> {
  if (typeof token !== 'string' || token.length > 4000) return null;
  try {
    const raw = unb64(token);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(plain)) as Sealed;
  } catch {
    return null;
  }
}

/** Turn 32 random bytes (base64) into the sealing key. */
export function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function newKeyBytes(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

// ---------- Building ----------

const str = (x: unknown) => (typeof x === 'string' ? x : '');
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

type Builder = (p: Progress, r: Record<string, unknown>, today: string, rng: Rng) => LessonPlan | null;
const BUILDERS: Record<string, Builder> = {
  lesson: (p, r, today, rng) => buildLesson(p, today, rng, r.keepGoing === true, { listen: r.listen === true }),
  weak: (p, _r, _today, rng) => buildWeakSpots(p, rng),
  practice: (p, r, _today, rng) => buildPractice(p, str(r.unitId), rng),
  test: (_p, r, _today, rng) => (r.categoryId === PHASE3 ? buildPhase3Test(rng) : buildTest(str(r.categoryId), rng)),
  defend: (p, r, today, rng) => buildDefend(p, strs(r.termIds).slice(0, DEFEND_MAX), today, rng),
  rally: (p, r, today, rng) => buildRally(p, str(r.areaId), today, rng),
  listing: (p, _r, today, rng) => buildListing(p, today, rng),
  revisit: (p, r, today, rng) => buildRevisit(p, str(r.lineId), today, rng),
  ride: (p, r, today, rng) => buildRide(p, str(r.lineId), typeof r.from === 'number' ? r.from : 0, today, rng)?.plan ?? null,
};

/** Build the session a recipe asks for, from the learner's own progress. Null when there is nothing to do. */
export function buildSession(recipe: unknown, progress: unknown, today: unknown, seed: number): LessonPlan | null | { error: string } {
  const r = (recipe && typeof recipe === 'object' ? recipe : {}) as Record<string, unknown>;
  const build = typeof r.build === 'string' && Object.prototype.hasOwnProperty.call(BUILDERS, r.build) ? BUILDERS[r.build] : undefined;
  if (!build) return { error: 'Unknown session.' };
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { error: 'Unknown day.' };
  const p = progress as Progress;
  if (!p || typeof p !== 'object' || !p.terms || typeof p.terms !== 'object' || !p.settings || typeof p.settings !== 'object') return { error: 'Progress is missing.' };
  try {
    return build(p, r, today, seededRng(seed));
  } catch {
    return { error: 'That session could not be built.' };
  }
}

/** Every term a session asks about or teaches: these must be allowed for the account. */
export function sessionTermIds(plan: LessonPlan): string[] {
  const ids = new Set([...plan.newIds, ...plan.reviewIds]);
  for (const q of plan.questions) {
    if (q.kind === 'match') q.termIds.forEach((id) => ids.add(id));
    else ids.add(q.termId);
  }
  return [...ids];
}

/** The material a question needs that the app doesn't have: its sealed answer, and what it shows. */
async function dealOne(key: CryptoKey, user: number, q: Question, rng: Rng, known: Set<string>, withRetry: boolean): Promise<DealtQuestion> {
  if (q.kind === 'intro') return q;
  if (q.kind === 'match') {
    const t = (id: string) => termById.get(id)!;
    return { kind: 'match', termIds: q.termIds, right: q.right.map((id) => tidyOption(t(id).short)), token: await seal(key, { u: user, m: q.termIds.map((id) => q.right.indexOf(id)) }) };
  }
  const term = termById.get(q.termId)!;
  const sealed: Sealed = { u: user, a: q.answer, t: q.termId };
  let shown: DealtQuestion;
  const base = { termId: q.termId, review: q.review, options: q.options, token: '' };
  switch (q.kind) {
    case 'meaning':
    case 'listen':
      shown = { ...base, kind: q.kind };
      break;
    case 'term':
      shown = { ...base, kind: 'term', prompt: promptFor(term) };
      break;
    case 'fill': {
      shown = { ...base, kind: 'fill', text: q.context?.text ?? term.fill, ...(q.context ? { from: q.context.from } : {}) };
      sealed.b = q.context?.blank ?? term.term;
      break;
    }
    case 'calc':
    case 'tf':
      shown = { ...base, kind: q.kind, prompt: q.prompt };
      if (q.why) sealed.w = q.why;
      break;
    case 'talk': {
      const item = talkById.get(q.itemId)!;
      shown = { ...base, kind: 'talk', format: item.format, ...(item.who ? { who: item.who } : {}), ...(item.prompt ? { prompt: item.prompt } : {}) };
      sealed.w = item.why;
      break;
    }
  }
  shown.token = await seal(key, sealed);
  if (withRetry) shown.retry = await dealOne(key, user, retryQuestion(q, rng, known), rng, known, false);
  return shown;
}

/** A built session as the app gets it: questions without answers, and the cards of the terms it teaches. */
export async function dealSession(key: CryptoKey, user: number, plan: LessonPlan, progress: Progress, seed: number): Promise<{ plan: DealtPlan; cards: Record<string, Card> }> {
  const rng = seededRng(seed + 1);
  const known = new Set([...Object.keys(progress.terms), ...plan.newIds]);
  // A test only scores; nothing is retried.
  const retries = plan.kind !== 'test';
  const questions = await Promise.all(plan.questions.map((q) => dealOne(key, user, q, rng, known, retries)));
  const cards: Record<string, Card> = {};
  for (const id of plan.newIds) {
    const c = teachingCard(id);
    if (c) cards[id] = c;
  }
  return { plan: { ...plan, questions }, cards };
}

/**
 * Mark a pick. A question's token gives back the right option, the reason, the words a gap
 * stands for, and the term's card for the feedback. A match's token and one pair (`pair`:
 * [left index, right index]) give back whether that pair is right.
 */
export async function markAnswer(key: CryptoKey, user: number, body: Record<string, unknown>): Promise<Record<string, unknown> | { error: string }> {
  const s = await unseal(key, body.token);
  if (!s || s.u !== user) return { error: 'That question is not available.' };
  if (s.m) {
    const pair = Array.isArray(body.pair) ? body.pair : [];
    const [l, r] = pair;
    if (typeof l !== 'number' || typeof r !== 'number' || l < 0 || l >= s.m.length) return { error: 'Pick a pair.' };
    return { correct: s.m[l] === r };
  }
  if (typeof s.a !== 'number' || !s.t) return { error: 'That question is not available.' };
  return { answer: s.a, ...(s.w ? { why: s.w } : {}), ...(s.b ? { blank: s.b } : {}), card: teachingCard(s.t) };
}
