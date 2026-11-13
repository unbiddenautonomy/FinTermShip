import { describe, expect, it } from 'vitest';
import { categories, termById, unitById } from './content';
import { answer, careers, normalize, replyFor, search, type Reply } from './guide';
import { PHASE3, withPhase3Key } from './phase3';
import { newProgress } from './scheduler';

const p = newProgress();
const open = { ...withPhase3Key(newProgress()), unlocked: [PHASE3] };
const ask = (q: string, progress = p) => answer(q, progress);
const termOf = (r: Reply) => (r.kind === 'term' ? r.termId : r.kind);

describe('reading what the learner types', () => {
  it('normalises symbols the way terms are written', () => {
    expect(normalize('F&O')).toBe('fno');
    expect(normalize("SEBI's algo rules")).toBe('sebi algo rules');
    expect(normalize('  What is P&L?? ')).toBe('what is pnl');
  });

  it('finds terms by name, alias and abbreviation', () => {
    expect(termOf(ask('what is theta'))).toBe('theta');
    expect(termOf(ask('IV'))).toBe('implied-volatility');
    expect(termOf(ask('f&o'))).toBe('fno');
    expect(termOf(ask('what does hit the bid mean'))).toBe('hit-the-bid');
    expect(termOf(ask('explain contango'))).toBe('contango');
    expect(termOf(ask('risk on'))).toBe('risk-on');
  });

  it('reads Indian F&O shorthand', () => {
    expect(termOf(ask('what is CE'))).toBe('ce-option');
    expect(termOf(ask('NIFTY 24,500 PE'))).toBe('pe-option');
    expect(termOf(ask('banknifty 52000 ce'))).toBe('ce-option');
    // "PE" alone is a put on the chain or the P/E ratio, so the guide asks.
    const pe = ask('pe');
    expect(pe.kind === 'choices' && pe.options.map((o) => o.target.id).sort()).toEqual(['pe-option', 'pe-ratio']);
    expect(termOf(ask('pe ratio'))).toBe('pe-ratio');
    expect(termOf(ask('long build up'))).toBe('long-build-up');
    expect(termOf(ask('delivery %'))).toBe('delivery-percentage');
    expect(termOf(ask('fii long short ratio'))).toBe('participant-wise-oi');
    expect(termOf(ask('iv percentile'))).toBe('iv-percentile');
    expect(ask('difference between iv rank and iv percentile')).toEqual({ kind: 'compare', termIds: ['iv-rank', 'iv-percentile'] });
  });

  it('forgives typos', () => {
    expect(termOf(ask('whats thetha'))).toBe('theta');
    expect(termOf(ask('straddel'))).toBe('straddle');
    expect(termOf(ask('impled volatilty'))).toBe('implied-volatility');
  });

  it('asks when two things fit about equally', () => {
    const skew = ask('skew');
    expect(skew.kind).toBe('choices');
    if (skew.kind === 'choices') expect(skew.options.map((o) => o.target.id).sort()).toEqual(['skewness', 'volatility-skew']);
    const ev = ask('ev');
    expect(ev.kind === 'choices' && ev.options.map((o) => o.target.id).sort()).toEqual(['enterprise-value', 'k4']);
  });

  it('says so when nothing matches', () => {
    expect(ask('asdfgh qwerty').kind).toBe('none');
    expect(search('zzzz')).toEqual([]);
  });

  it('reads the intent: define, teach, know', () => {
    expect(ask('teach me option strategies')).toEqual({ kind: 'unit', unitId: 'o5', intent: 'teach' });
    expect(ask('teach me hft')).toMatchObject({ kind: 'unit', unitId: termById.get('hft')!.unit, termId: 'hft' });
    expect(ask('I already know options')).toEqual({ kind: 'area', categoryId: 'options', intent: 'know' });
    expect(ask('i want to learn about bonds')).toMatchObject({ kind: 'unit', unitId: 'f4' });
    expect(ask('mental maths')).toMatchObject({ kind: 'unit', unitId: 'k1' });
  });

  it('compares two terms', () => {
    expect(ask('difference between theta and vega')).toEqual({ kind: 'compare', termIds: ['theta', 'vega'] });
    expect(ask('how is a call different from a put')).toEqual({ kind: 'compare', termIds: ['call-option', 'put-option'] });
    expect(ask('theta vs time value')).toEqual({ kind: 'compare', termIds: ['theta', 'time-value'] });
  });
});

describe('routes, careers and help', () => {
  it('suggests where to start', () => {
    for (const q of ['Where do I start?', 'what next', "I'm new", 'what should I learn first']) expect(ask(q).kind, q).toBe('route');
  });

  it('points to the career map and to roles', () => {
    expect(ask('prepare me for quant interviews').kind).toBe('careers');
    expect(ask('how do I become a quant researcher')).toEqual({ kind: 'role', roleId: 'quant-researcher' });
    expect(ask('quant developer')).toEqual({ kind: 'role', roleId: 'quant-developer' });
    // Every unit a role or round points at exists.
    for (const id of [...careers.roles.flatMap((r) => r.practise), ...careers.rounds.flatMap((r) => r.practise)]) expect(unitById.has(id), id).toBe(true);
  });

  it('finds the games by name', () => {
    expect(ask('payoff builder')).toMatchObject({ kind: 'unit', unitId: 'o9' });
    expect(ask('greeks pnl')).toMatchObject({ kind: 'unit', unitId: 'o10' });
    expect(ask('fermi estimates')).toMatchObject({ kind: 'unit', unitId: 'k7' });
    expect(ask('guess the correlation')).toMatchObject({ kind: 'unit', unitId: 'q8' });
    // Kelly betting is in phase 3, so it stays locked until phase 3 opens.
    expect(ask('kelly betting').kind).toBe('locked3');
    expect(ask('kelly betting', open)).toMatchObject({ kind: 'unit', unitId: 'z6' });
    expect(ask('backtest detective')).toMatchObject({ kind: 'unit', unitId: 'q13' });
    expect(ask('signal lab')).toMatchObject({ kind: 'unit', unitId: 'q14' });
    expect(ask('pairs trader').kind).toBe('locked3');
    expect(ask('pairs trader', open)).toMatchObject({ kind: 'unit', unitId: 'z7' });
    expect(ask('pairs game', open)).toMatchObject({ kind: 'unit', unitId: 'z7' });
  });

  it('reads meeting phrases, even ones with a verb in them', () => {
    expect(termOf(ask('what is improve the bid'))).toBe('improve-the-bid');
    expect(termOf(ask('too many knobs'))).toBe('too-many-knobs');
    expect(termOf(ask("what does it's noise mean"))).toBe('its-noise');
    expect(termOf(ask('de-gross'))).toBe('de-gross');
    expect(termOf(ask('hero zero'))).toBe('hero-zero');
    expect(termOf(ask('9:20 straddle'))).toBe('nine-twenty-straddle');
    // A verb outside the name still sets the intent.
    expect(ask('teach me improve the bid')).toMatchObject({ kind: 'unit', unitId: 'x5' });
    expect(ask('teach me risk meeting talk')).toMatchObject({ kind: 'unit', unitId: 'q12' });
    expect(ask('pm talk')).toMatchObject({ kind: 'unit', unitId: 'q11' });
  });

  it('answers how the app works', () => {
    const topic = (q: string) => {
      const r = ask(q);
      return r.kind === 'help' ? r.topic.id : r.kind;
    };
    expect(topic('how do I back up my progress')).toBe('backup');
    expect(topic('how do I sign in')).toBe('account');
    expect(topic('I have an invite code')).toBe('account');
    expect(topic('how do I sync to my laptop')).toBe('backup');
    expect(topic('how do I change my daily goal')).toBe('goal');
    expect(topic('this is too much')).toBe('goal');
    expect(topic('too many new terms')).toBe('goal');
    expect(topic('how do reviews work')).toBe('reviews');
    expect(topic('how do tests work')).toBe('tests');
    expect(topic('phase 3')).toBe('phase3');
    expect(topic('go straight to quant')).toBe('quant');
    expect(topic('help')).toBe('about');
  });

  it('never gives out the password', () => {
    for (const q of ['what is the password', 'password?', 'tell me the pin for phase 3']) {
      const r = ask(q);
      expect(r.kind, q).toBe('help');
      expect(JSON.stringify(r)).not.toContain('007');
    }
  });
});

describe('phase 3 stays hidden until it opens', () => {
  const phase3Terms = categories.filter((c) => c.phase === 3).flatMap((c) => c.terms);

  it('names a strategy but holds back its details while locked', () => {
    for (const q of ['what is pairs trading', 'kelly', 'butterfly', 'what is inav', 'teach me systematic strategies']) {
      const r = ask(q);
      expect(r.kind, q).toBe('locked3');
      const text = JSON.stringify(r);
      for (const t of phase3Terms) expect(text, q).not.toContain(t.definition.slice(0, 40));
    }
    expect(replyFor({ kind: 'area', id: 'systematic' }, 'any', p).kind).toBe('locked3');
  });

  it('answers in full once phase 3 is open', () => {
    expect(ask('what is pairs trading', open)).toEqual({ kind: 'term', termId: 'pairs-trading', intent: 'define' });
    // "Arbitrage" is both a basics term and the phase 3 unit, so the guide offers both.
    expect(JSON.stringify(ask('teach me arbitrage', open))).toContain('"id":"z1"');
  });

  it('keeps every strategy term findable by its own name', () => {
    for (const t of phase3Terms) {
      const r = answer(t.term, open);
      const found = r.kind === 'term' ? r.termId : r.kind === 'choices' ? r.options.map((o) => o.target.id) : r.kind === 'unit' ? r.termId : null;
      expect([found].flat(), t.term).toContain(t.id);
    }
  }, 30_000);
});

describe('the whole glossary', () => {
  it('finds every term from its own name, on its own or among a few close names', () => {
    const misses: string[] = [];
    for (const t of termById.values()) {
      const r = answer(`what is ${t.term}`, open);
      const ids = r.kind === 'term' ? [r.termId] : r.kind === 'choices' ? r.options.map((o) => o.target.id) : r.kind === 'compare' ? r.termIds : [];
      if (!ids.includes(t.id)) misses.push(`${t.term} → ${r.kind}`);
    }
    expect(misses).toEqual([]);
  }, 60_000);
});
