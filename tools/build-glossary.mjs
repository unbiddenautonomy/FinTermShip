// Builds the complete glossary: every term in the syllabus with its explanation, grouped by area
// and unit, in the syllabus order. Writes three files to the output folder (default
// `glossary-out/`, gitignored):
//
//   glossary.html  the page (search, area filter); it loads glossary.json from beside it
//   glossary.json  the terms, one record per line
//   glossary.md    the same content as one Markdown file, for printing or sharing as text
//
// Run from the repo root: node tools/build-glossary.mjs [out-dir]
//
// The output holds the whole syllabus, which the app never sends to a browser
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

const byId = new Map(areas.flatMap((a) => a.terms.map((t) => [t.id, t.term])));
const records = [];
for (const a of areas) {
  const unitOrder = new Map(a.units.map((u, i) => [u.id, i]));
  const terms = [...a.terms].sort((x, y) => (unitOrder.get(x.unit) ?? 99) - (unitOrder.get(y.unit) ?? 99));
  for (const t of terms) {
    const u = a.units.find((u) => u.id === t.unit);
    if (!u) throw new Error(`${t.id}: unit ${t.unit} not found in ${a.id}`);
    if (!t.definition?.trim()) throw new Error(`${t.id}: no definition`);
    const r = { id: t.id, term: t.term, area: a.id, unit: u.name, short: t.short, definition: t.definition };
    if (t.aliases?.length) r.aliases = t.aliases;
    if (t.formula) r.formula = t.formula;
    if (t.note) r.note = t.note;
    if (t.reads) r.reads = t.reads;
    if (t.examples?.length) r.examples = t.examples;
    const see = [...new Set([...(t.confusables ?? []), ...(t.overlaps ?? [])])].map((id) => byId.get(id)).filter(Boolean);
    if (see.length) r.see = see;
    if (t.asOf) r.asOf = t.asOf;
    if (t.source) r.source = t.source;
    if (u.core) r.core = true;
    if (a.phase === 3) r.phase3 = true;
    records.push(r);
  }
}
const colours = JSON.parse(readFileSync('src/data/modes/areas.json', 'utf8'));
const areaList = areas.map((a) => ({ id: a.id, name: a.name, count: a.terms.length, phase3: a.phase === 3, colour: colours[a.id]?.colour ?? '#888888' }));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'glossary.json'), `{"areas":${JSON.stringify(areaList)},\n"terms":[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
writeFileSync(join(out, 'glossary.md'), markdown());
writeFileSync(join(out, 'glossary.html'), readFileSync(new URL('./glossary-page.html', import.meta.url), 'utf8'));
console.log(`${records.length} terms in ${areas.length} areas written to ${out}/`);

function markdown() {
  const L = [`# fintermship glossary`, '', `Every term in the syllabus, ${records.length} in ${areas.length} areas, in the order the app teaches them.`, ''];
  L.push('## Areas', '');
  for (const a of areaList) L.push(`- [${a.name}](#${slug(a.name)}) (${a.count} terms${a.phase3 ? ', phase 3' : ''})`);
  for (const a of areaList) {
    L.push('', `## ${a.name}`, '');
    let unit = '';
    for (const r of records.filter((r) => r.area === a.id)) {
      if (r.unit !== unit) L.push(`### ${(unit = r.unit)}`, '');
      L.push(`**${r.term}**${r.aliases ? ` (also: ${r.aliases.join(', ')})` : ''}: ${r.short}.`, '', r.definition, '');
      if (r.formula) L.push(`Formula: \`${r.formula}\``, '');
      if (r.reads) L.push(`When it rises: ${r.reads.up}`, '', `When it falls: ${r.reads.down}`, '');
      if (r.note) L.push(`Note: ${r.note}`, '');
      if (r.examples) L.push(...r.examples.map((e) => `> ${e}`).join('\n>\n').split('\n'), '');
      if (r.see) L.push(`Don't confuse with: ${r.see.join(', ')}.`, '');
      if (r.asOf) L.push(`Figures as of ${r.asOf}${r.source ? `, source: ${r.source}` : ''}.`, '');
    }
  }
  return L.join('\n') + '\n';
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
}
