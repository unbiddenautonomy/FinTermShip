// Builds a knowledge base from the syllabus for a vector database (retrieval for a chatbot).
// Every chunk is self-contained: it names its term and area, so it still makes sense when
// retrieved on its own. Nothing is written by hand here: all text comes from src/data, which the
// build already validates. The format and how to load it are in docs/knowledge-base.md.
//
// Run from the repo root: node tools/build-knowledge-base.mjs [out-dir]
// Writes to `glossary-out/` by default (gitignored):
//
//   knowledge-base.jsonl  one chunk per line: {id, type, title, text, questions, metadata}
//
// The output is the whole syllabus, which the app never sends to a browser
// (docs/decisions.md, "Privacy of content"). Keep it out of the repo and out of `public/`.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'glossary-out';
const dir = 'src/data/terms';
const areas = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((a) => a.terms.length)
  .sort((a, b) => a.order - b.order);
const talk = JSON.parse(readFileSync('src/data/talk.json', 'utf8'));

const terms = new Map();
for (const a of areas) {
  for (const t of a.terms) {
    const u = a.units.find((u) => u.id === t.unit);
    if (!u) throw new Error(`${t.id}: unit ${t.unit} not found in ${a.id}`);
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
  L.push(`${t.term}${t.aliases?.length ? ` (also called ${t.aliases.join(', ')})` : ''}`);
  L.push(`Topic: ${t.area.name}, ${t.unitName}.`);
  L.push(`In short: ${sentence(t.short)}`);
  L.push(t.definition);
  if (t.formula) L.push(`Formula: ${t.formula}`);
  if (t.reads) L.push(`When it rises: ${t.reads.up}`, `When it falls: ${t.reads.down}`);
  if (t.note) L.push(`Note: ${t.note}`);
  if (t.said || t.speak) L.push(`How it is said: "${t.said ?? t.speak}".`);
  if (t.examples?.length) L.push('How it is used:', ...t.examples.map((e) => `- ${e}`));
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
  if (mix.length) L.push(`Not the same as: ${mix.map((id) => `${name(id)} (${terms.get(id).short.replace(/\.$/, '')})`).join('; ')}.`);
  if (t.asOf) L.push(`Figures here are as of ${t.asOf} and may have changed${t.source ? `; check ${t.source}` : ''}.`);
  chunks.push({
    id: `term:${t.id}`,
    type: 'term',
    title: t.term,
    text: L.join('\n'),
    questions: [`What is ${t.term}?`, `What does ${t.term} mean?`, ...(t.aliases ?? []).slice(0, 2).map((a) => `What is ${a}?`), ...(t.formula ? [`How is ${t.term} calculated?`] : []), ...(t.reads ? [`What does it mean when ${t.term} goes up?`] : [])],
    metadata: {
      term_id: t.id,
      names,
      area: t.area.id,
      area_name: t.area.name,
      unit: t.unitName,
      core: t.core,
      difficulty: t.difficulty,
      basic: !!t.easy,
      phase3: t.area.phase === 3,
      related: related,
      ...(t.asOf ? { as_of: t.asOf, time_sensitive: true } : {}),
      ...(t.source ? { source: t.source } : {}),
    },
  });
}

// 2. One chunk per pair of terms the app marks as easy to mix up, for "what's the difference" questions.
const pairs = new Set();
for (const t of terms.values()) {
  for (const id of [...(t.confusables ?? []), ...(t.overlaps ?? [])]) {
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
      metadata: { term_ids: [a.id, b.id], areas: [...new Set([a.area.id, b.area.id])], overlap, phase3: a.area.phase === 3 || b.area.phase === 3 },
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
    metadata: { area: a.id, area_name: a.name, term_count: a.terms.length, phase3: a.phase === 3 },
  });
}

function talkLine(x) {
  if (x.format === 'decode') return `On a desk, "${x.prompt}" means: ${sentence(x.options[0])} ${x.why}`;
  if (x.format === 'say') return `To say "${x.prompt}" the way a desk would: "${x.options[0]}" ${x.why}`;
  if (x.format === 'reply') return `If a ${x.who && x.who.length > 3 ? x.who.toLowerCase() : (x.who ?? 'colleague')} asks "${x.prompt}", a good answer is: "${x.options[0]}" ${x.why}`;
  return `A wrong use of ${name(x.term) ?? 'the term'}: "${x.options[0]}" ${x.why}`;
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'knowledge-base.jsonl'), chunks.map((c) => JSON.stringify(c)).join('\n') + '\n');
const count = (type) => chunks.filter((c) => c.type === type).length;
const longest = Math.max(...chunks.map((c) => c.text.length));
console.log(`${chunks.length} chunks (${count('term')} terms, ${count('comparison')} comparisons, ${count('area')} areas), longest ${longest} characters, written to ${out}/knowledge-base.jsonl`);
