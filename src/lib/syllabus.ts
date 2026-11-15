/**
 * Every term's name, unit and mix-ups, for the Worker, the tests and `npm run dev`. Importing
 * this fills src/lib/content.ts with the whole syllabus. The app's production build never
 * includes it: the app learns each term from the server once the learner reaches it
 * (scripts/check-bundle.mjs fails the build if the list slips in).
 */
import outline from '../data/outline.json';
import { addTerms } from './content';
import type { TermStub } from './types';

/** Every term as the app would be given it, in syllabus order. */
export const allStubs: TermStub[] = (outline.categories as unknown as { terms: Omit<TermStub, 'n'>[] }[]).flatMap((c) => c.terms.map((t, n) => ({ ...t, n })));

addTerms(allStubs);
