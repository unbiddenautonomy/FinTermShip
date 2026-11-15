/**
 * Every term's name, unit and mix-ups, for the Worker, the tests and `npm run dev`. Importing
 * this fills src/lib/content.ts with the whole syllabus. The app's production build never
 * includes it: the app learns each term from the server once the learner reaches it
 * (scripts/check-bundle.mjs fails the build if the list slips in).
 */
import outline from '../data/outline.json';
import tickers from '../data/modes/tickers.json';
import { addTerms } from './content';
import type { TermStub, Unit } from './types';

type OutlineArea = { units: Unit[]; terms: Omit<TermStub, 'n' | 'stop' | 'ticker'>[] };

/**
 * Each term's place on its Term Lines line: the units in order, a practice unit taking one stop
 * (its depot) and a unit of terms one stop per term, in file order (see src/lib/modes/plans.ts).
 */
function stopsOf(area: OutlineArea): Map<string, number> {
  const out = new Map<string, number>();
  let i = 0;
  for (const u of area.units) {
    if (u.kind && u.kind !== 'terms') i++;
    else for (const t of area.terms) if (t.unit === u.id) out.set(t.id, i++);
  }
  return out;
}

/** Every term as the app would be given it, in syllabus order. */
export const allStubs: TermStub[] = (outline.categories as unknown as OutlineArea[]).flatMap((c) => {
  const stops = stopsOf(c);
  return c.terms.map((t, n) => ({ ...t, n, stop: stops.get(t.id), ticker: (tickers as Record<string, string>)[t.id] }));
});

addTerms(allStubs);
