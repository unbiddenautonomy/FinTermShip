import { describe, expect, it } from 'vitest';
import { termById } from './content';
import { distractorTerms, exampleFills, fillQuestion, promptFor, retryQuestion, reviewQuestion, seededRng } from './questions';
import type { Term } from './types';

const base = termById.get('stop-loss')!;
const withExamples = (id: string, examples: string[]): Term => ({ ...termById.get(id)!, id: `${id}-test-${examples.join('|').length}`, examples });

describe('example sentences as fill questions', () => {
  it('blank the term once, keep its spelling for the answer, and never leave it in the sentence', () => {
    for (const t of termById.values()) {
      for (const c of exampleFills(t)) {
        expect(c.text.split('____').length, `${t.id}: ${c.text}`).toBe(2);
        expect(c.blank.toLowerCase()).toBe(t.term.toLowerCase());
        expect(t.examples[c.from].replace(c.blank, '____')).toBe(c.text);
        const name = new RegExp(`(^|[^\\w-])${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i');
        expect(name.test(c.text), `${t.id}: ${c.text}`).toBe(false);
      }
    }
  });

  it('skip sentences that would give the answer away or blank the wrong words', () => {
    const fills = (id: string, s: string) => exampleFills(withExamples(id, [s]));
    // Twice, or not at all.
    expect(fills('stop-loss', 'Set a stop-loss. A stop-loss caps the loss.')).toEqual([]);
    expect(fills('stop-loss', 'Set a stop.')).toEqual([]);
    // After "a" or "an", the article hints at the answer's first letter.
    expect(fills('stop-loss', 'Every trader needs a stop-loss on this one.')).toEqual([]);
    // Part of a longer term's name.
    expect(fills('stop-loss', 'Trend traders use the trailing stop-loss to lock in profit.')).toEqual([]);
    // A plural left behind gives the answer away.
    expect(fills('variance', 'Variances add, so we budget risk in variance terms.')).toEqual([]);
    // Inside a bigger word or hyphenated phrase.
    expect(fills('margin', 'Margins fell, and the margin-based rule kicked in.')).toEqual([]);
    expect(fills('stop-loss', 'Put the stop-loss below support.')).toEqual([{ text: 'Put the ____ below support.', blank: 'stop-loss', from: 0 }]);
    expect(fills('stop-loss', 'Stop-loss first, then size.')[0].blank).toBe('Stop-loss');
  });

  it('come in most reviews of a well-known term, but the fill sentence stays in use', () => {
    const t = termById.get('ltp')!;
    expect(exampleFills(t).length).toBeGreaterThan(0);
    const qs = Array.from({ length: 60 }, (_, i) => reviewQuestion(t, 4, seededRng(i)));
    const fills = qs.filter((q) => q.kind === 'fill');
    const withContext = fills.filter((q) => q.kind === 'fill' && q.context).length;
    expect(withContext).toBeGreaterThan(fills.length / 4);
    expect(withContext).toBeLessThan(fills.length);
  });

  it('keep near twins out of the wrong options', () => {
    for (const id of ['stop-loss', 'dii', 'bull-market', 'gamma']) {
      const t = termById.get(id)!;
      for (let seed = 0; seed < 10; seed++) {
        const wrong = distractorTerms(t, 3, seededRng(seed), undefined, true);
        expect(wrong.length).toBe(3);
        for (const w of wrong) {
          expect(t.confusables.includes(w.id) || w.confusables.includes(t.id), `${id}: ${w.id}`).toBe(false);
        }
      }
    }
    // A DII's definition names mutual funds, so a mutual fund never stands against it.
    const dii = termById.get('dii')!;
    for (let seed = 0; seed < 20; seed++) expect(distractorTerms(dii, 3, seededRng(seed), undefined, true).map((t) => t.id)).not.toContain('mutual-fund');
  });

  it('give four distinct options with the answer among them', () => {
    for (const t of termById.values()) {
      const q = fillQuestion(t, seededRng(t.id.length), true, undefined, true);
      if (q.kind !== 'fill') throw new Error('expected fill');
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answer]).toBe(t.id);
    }
  });

  it('retry with a different sentence', () => {
    const t = base;
    const fills = exampleFills(t);
    expect(fills.length).toBeGreaterThan(0);
    const asked = fillQuestion(t, seededRng(1), true, undefined, true);
    if (asked.kind !== 'fill' || !asked.context) throw new Error('expected an example fill');
    for (let seed = 0; seed < 20; seed++) {
      const retry = retryQuestion(asked, seededRng(seed));
      expect(retry.kind).toBe('fill');
      if (retry.kind === 'fill') expect(retry.context?.from).not.toBe(asked.context.from);
    }
    // A missed fill sentence comes back as an example when there is one.
    const plain = fillQuestion(t, seededRng(2));
    const again = retryQuestion(plain, seededRng(3));
    expect(again.kind === 'fill' && again.context).toBeTruthy();
  });
});

describe('the definition shown with a term blanked out', () => {
  it('takes the rest of the word a name starts, so the answer is never half on the page', () => {
    for (const t of termById.values()) {
      const shown = promptFor(t);
      // "____holder meetings" would leave the answer readable.
      expect(/____[\w-]/.test(shown), `${t.id}: ${shown}`).toBe(false);
    }
  });

  it('keeps what comes before a name inside the same word, which usually turns the meaning around', () => {
    // "Below that it is sub-investment grade" must not become "Below that it is ____".
    expect(promptFor(termById.get('investment-grade')!)).toContain('Below that it is sub-____');
    // "Unexpected losses, above this, are what capital is for" is false of "expected loss".
    expect(promptFor(termById.get('expected-loss')!)).toContain('Un____, above this');
  });
});
