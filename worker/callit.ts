/**
 * Call It, dealt and marked here. The app picks a deck's terms (due first, then weak, then the
 * rest) and asks for claims about them; it gets each claim's text without whether it is true or
 * why. A call is sent back to be marked, and only then do the truth and the reason come.
 */
import { fullCategories } from '../src/lib/cardData';
import { claimsFor, dealClaim, DECK_SIZE, type ClaimLookup } from '../src/lib/modes/claims';
import type { Term } from '../src/lib/types';
import { content } from './cards';

const built = (() => {
  const terms = new Map<string, Term>();
  for (const c of fullCategories) for (const t of c.terms) terms.set(t.id, t);
  const { cards } = content();
  return { terms, written: (id: string) => cards.get(id)?.claims ?? [] };
})();

interface CallUser {
  admin: number;
  phase3: number;
}

/** The lookup for one learner: swaps only use glosses of terms the app says the learner has met. */
function lookup(known: Set<string>): ClaimLookup {
  return { term: (id) => built.terms.get(id), written: built.written, canSwap: (id) => known.has(id) };
}

const allowed = (user: CallUser, id: unknown): id is string => typeof id === 'string' && built.terms.has(id) && (!content().phase3.has(id) || !!user.phase3 || !!user.admin);

/** Deal one claim per asked-for term, half true and half false, without the answers. */
export function dealDeck(user: CallUser, ids: unknown, known: unknown): { claims: { termId: string; text: string }[] } {
  const want = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => allowed(user, id)).slice(0, DECK_SIZE);
  const met = new Set([...want, ...(Array.isArray(known) ? known.filter((id) => allowed(user, id)).slice(0, 80) : [])]);
  const truths = want.map((_, i) => i % 2 === 0);
  for (let i = truths.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [truths[i], truths[j]] = [truths[j], truths[i]];
  }
  const look = lookup(met);
  return { claims: want.map((id, i) => ({ termId: id, text: dealClaim(built.terms.get(id)!, truths[i], Math.random, look).text })) };
}

/** Mark a call: whether the claim was true, and why. */
export function markCall(user: CallUser, termId: unknown, text: unknown): { truth: boolean; why: string } | { error: string } {
  if (!allowed(user, termId) || typeof text !== 'string') return { error: 'That claim is not available.' };
  const look = lookup(new Set(built.terms.keys()));
  const term = built.terms.get(termId)!;
  const claim = [...claimsFor(term, true, look), ...claimsFor(term, false, look)].find((c) => c.text === text);
  return claim ? { truth: claim.truth, why: claim.why } : { error: 'That claim is not available.' };
}
