// Builds a knowledge base from the syllabus for a vector database (retrieval for a chatbot).
// Every chunk is self-contained: it names its term and area, so it still makes sense when
// retrieved on its own. Nothing is written by hand here: all text comes from src/data, which the
// build already validates. The format and how to load it are in docs/knowledge-base.md.
//
// Run from the repo root: node tools/build-knowledge-base.mjs [out-dir]
// Writes to `glossary-out/` by default (gitignored):
//
//   knowledge-base.jsonl           every chunk, one per line: {id, type, title, text, questions, metadata}
//   knowledge-base-investor.jsonl  only the chunks tagged for investors, for an investor chatbot
//
// The output is the whole syllabus, which the app never sends to a browser
// (docs/decisions.md, "Privacy of content"). Keep it out of the repo and out of `public/`.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'glossary-out';
const dir = 'src/data/terms';
const load = (d) => readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(d, f), 'utf8')));
// Investor content written for the chatbot only (sectors, mutual funds, investing basics and
// guides to reading the numbers). The app never uses it. Same shape as an area in src/data/terms,
// with only the fields used here.
const extra = load('tools/kb-extra').map((a) => ({ ...a, extra: true }));
const areas = [...load(dir), ...extra].filter((a) => a.terms.length).sort((a, b) => a.order - b.order);
const talk = JSON.parse(readFileSync('src/data/talk.json', 'utf8'));

// Who a term is mostly useful to, so a chatbot can filter or rank by audience:
//   investor      someone buying shares or funds: basics, Indian market, company results, macro news
//   trader        someone placing orders, trading F&O or commodities
//   professional  desk, quant, execution and strategy work
// Set by area, with unit overrides. Reviewed by hand in November 2026; change it here.
const AUDIENCE_BY_AREA = {
  basics: 'investor', india: 'investor', fundamentals: 'investor', conditions: 'investor',
  macro: 'professional', credit: 'professional', instruments: 'trader', desk: 'professional',
  commodities: 'trader', trading: 'trader', options: 'trader', quant: 'professional',
  micro: 'professional', execution: 'professional', strategies: 'professional', systematic: 'professional',
};
const AUDIENCE_BY_UNIT = {
  c6: 'trader', // price, OI and positioning
  m1: 'investor', m3: 'investor', m6: 'investor', // RBI and policy rates, the rupee, data and events
  r1: 'investor', r2: 'investor', // credit basics, credit markets in India (credit risk funds, NCDs)
  f4: 'investor', // bonds and yields
  d2: 'investor', d3: 'investor', // market players, research and ratings
  d5: 'trader', d6: 'trader', // desk phrases, managing a trade
  t1: 'investor', // order types
  o4: 'professional', o6: 'professional', // higher-order Greeks, pricing and parity trades
  q1: 'investor', q4: 'investor', // return and risk statistics, factors (fund factsheets, smart beta)
  s4: 'investor', // market abuse
  s1: 'trader', // the order book
  y3: 'trader', y9: 'trader', // payoffs and costs, intraday and swing styles
};
for (const a of extra) AUDIENCE_BY_AREA[a.id] = 'investor';
const audienceOf = (t) => AUDIENCE_BY_UNIT[t.unit] ?? AUDIENCE_BY_AREA[t.area.id] ?? 'professional';

const terms = new Map();
for (const a of areas) {
  for (const t of a.terms) {
    const u = a.units.find((u) => u.id === t.unit);
    if (!u) throw new Error(`${t.id}: unit ${t.unit} not found in ${a.id}`);
    if (terms.has(t.id)) throw new Error(`${t.id}: id used twice`);
    if (!t.term || !t.short || !t.definition) throw new Error(`${t.id}: needs term, short and definition`);
    terms.set(t.id, { ...t, area: a, unitName: u.name, core: !!u.core });
  }
}
const name = (id) => terms.get(id)?.term;
const sentence = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const talkByTerm = new Map();
for (const x of talk) talkByTerm.set(x.term, [...(talkByTerm.get(x.term) ?? []), x]);

const chunks = [];

// 1. One chunk per term: everything the app teaches about it.
for (const t of terms.values()) {
  const names = [t.term, ...(t.aliases ?? [])];
  const related = [...new Set([...(t.confusables ?? []), ...(t.overlaps ?? []), ...(t.alsoFits ?? [])])].filter((id) => terms.has(id));
  const L = [];
  const guide = t.area.kind === 'guide';
  L.push(guide ? `${t.term[0].toUpperCase()}${t.term.slice(1)}` : `${t.term}${t.aliases?.length ? ` (also called ${t.aliases.join(', ')})` : ''}`);
  L.push(`Topic: ${t.area.name}, ${t.unitName}.`);
  L.push(`In short: ${sentence(t.short)}`);
  L.push(t.definition);
  if (t.formula) L.push(`Formula: ${t.formula}`);
  if (t.reads) L.push(`When it rises: ${t.reads.up}`, `When it falls: ${t.reads.down}`);
  if (t.note) L.push(`Note: ${t.note}`);
  if (t.said || t.speak) L.push(`How it is said: "${t.said ?? t.speak}".`);
  if (t.examples?.length) L.push(guide ? 'Example:' : 'How it is used:', ...t.examples.map((e) => `- ${e}`));
  if (t.tf?.length) {
    L.push('Facts:');
    for (const f of t.tf) L.push((f.a ? `- True: ${sentence(f.s)} ${f.why ?? ''}` : `- A common mistake is to think "${f.s.replace(/\.$/, '')}". That is false. ${f.why ?? ''}`).trimEnd());
  }
  if (t.calcs?.length) {
    L.push('Worked examples:');
    for (const c of t.calcs) L.push(`- ${c.q} Answer: ${c.options[c.answer]}. ${c.why ?? ''}`.trimEnd());
  }
  for (const x of talkByTerm.get(t.id) ?? []) L.push(talkLine(x));
  const mix = (t.confusables ?? []).filter((id) => terms.has(id));
  if (mix.length && guide) L.push(`Related terms: ${mix.map(name).join(', ')}.`);
  else if (mix.length) L.push(`Not the same as: ${mix.map((id) => `${name(id)} (${terms.get(id).short.replace(/\.$/, '')})`).join('; ')}.`);
  if (t.asOf) L.push(`Figures here are as of ${t.asOf} and may have changed${t.source ? `; check ${t.source}` : ''}.`);
  chunks.push({
    id: `${guide ? 'guide' : 'term'}:${t.id}`,
    type: guide ? 'guide' : 'term',
    title: t.term,
    text: L.join('\n'),
    questions: guide ? [`${t.term[0].toUpperCase()}${t.term.slice(1)}?`, ...(t.aliases ?? []).map((a) => `${a[0].toUpperCase()}${a.slice(1)}?`)] : [`What is ${t.term}?`, `What does ${t.term} mean?`, ...(t.aliases ?? []).slice(0, 2).map((a) => `What is ${a}?`), ...(t.formula ? [`How is ${t.term} calculated?`] : []), ...(t.reads ? [`What does it mean when ${t.term} goes up?`] : [])],
    metadata: {
      term_id: t.id,
      names,
      audience: audienceOf(t),
      area: t.area.id,
      area_name: t.area.name,
      unit: t.unitName,
      core: t.core,
      difficulty: t.difficulty,
      basic: !!t.easy,
      phase3: t.area.phase === 3,
      in_app: !t.area.extra,
      related: related,
      ...(t.asOf ? { as_of: t.asOf, time_sensitive: true } : {}),
      ...(t.source ? { source: t.source } : {}),
    },
  });
}

// 2. One chunk per pair of terms the app marks as easy to mix up, for "what's the difference" questions.
const pairs = new Set();
for (const t of terms.values()) {
  if (t.area.kind === 'guide') continue;
  for (const id of [...(t.confusables ?? []), ...(t.overlaps ?? [])]) {
    if (terms.get(id)?.area.kind === 'guide') continue;
    if (!terms.has(id) || id === t.id) continue;
    const key = [t.id, id].sort().join('|');
    if (pairs.has(key)) continue;
    pairs.add(key);
    const [a, b] = key.split('|').map((x) => terms.get(x));
    const overlap = (a.overlaps ?? []).includes(b.id) || (b.overlaps ?? []).includes(a.id);
    chunks.push({
      id: `compare:${a.id}|${b.id}`,
      type: 'comparison',
      title: `${a.term} vs ${b.term}`,
      text: [
        `${a.term} compared with ${b.term}.`,
        overlap ? `The two overlap: in some contexts either word fits.` : `People often mix these two up.`,
        `${a.term} (${a.area.name}): ${a.definition}`,
        `${b.term} (${b.area.name}): ${b.definition}`,
      ].join('\n'),
      questions: [`What is the difference between ${a.term} and ${b.term}?`, `${a.term} vs ${b.term}`],
      metadata: { term_ids: [a.id, b.id], audience: [audienceOf(a), audienceOf(b)].includes('professional') ? 'professional' : [audienceOf(a), audienceOf(b)].includes('trader') ? 'trader' : 'investor', areas: [...new Set([a.area.id, b.area.id])], overlap, phase3: a.area.phase === 3 || b.area.phase === 3 },
    });
  }
}

// 3. One chunk per area: what it covers, for broad "what should I know about X" questions.
for (const a of areas) {
  const L = [`${a.name}: what this topic covers.`];
  for (const u of a.units) {
    const list = a.terms.filter((t) => t.unit === u.id);
    if (list.length) L.push(`${u.name}: ${list.map((t) => t.term).join(', ')}.`);
  }
  chunks.push({
    id: `area:${a.id}`,
    type: 'area',
    title: a.name,
    text: L.join('\n'),
    questions: [`What should I learn about ${a.name.toLowerCase()}?`, `Which terms are part of ${a.name.toLowerCase()}?`],
    metadata: { area: a.id, area_name: a.name, audience: AUDIENCE_BY_AREA[a.id], term_count: a.terms.length, phase3: a.phase === 3 },
  });
}

function talkLine(x) {
  if (x.format === 'decode') return `On a desk, "${x.prompt}" means: ${sentence(x.options[0])} ${x.why}`;
  if (x.format === 'say') return `To say "${x.prompt}" the way a desk would: "${x.options[0]}" ${x.why}`;
  if (x.format === 'reply') return `If a ${x.who && x.who.length > 3 ? x.who.toLowerCase() : (x.who ?? 'colleague')} asks "${x.prompt}", a good answer is: "${x.options[0]}" ${x.why}`;
  return `A wrong use of ${name(x.term) ?? 'the term'}: "${x.options[0]}" ${x.why}`;
}

mkdirSync(out, { recursive: true });
const jsonl = (list) => list.map((c) => JSON.stringify(c)).join('\n') + '\n';
writeFileSync(join(out, 'knowledge-base.jsonl'), jsonl(chunks));
// The investor chatbot's file: only chunks tagged investor (no options, F&O, quant or desk work).
const investor = chunks.filter((c) => c.metadata.audience === 'investor');
writeFileSync(join(out, 'knowledge-base-investor.jsonl'), jsonl(investor));
const count = (type) => chunks.filter((c) => c.type === type).length;
const longest = Math.max(...chunks.map((c) => c.text.length));
console.log(`${chunks.length} chunks (${count('term')} terms, ${count('guide')} guides, ${count('comparison')} comparisons, ${count('area')} areas), ${investor.length} for investors, longest ${longest} characters, written to ${out}/knowledge-base.jsonl`);
