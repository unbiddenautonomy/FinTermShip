// Fails the build if the app's bundle holds any term card (a definition, an example, a fill
// sentence, a written claim or a talk item) or any pack (a desk case's decisions, meeting clips,
// Fermi answers, backtest reports). Those come from the server, a learner's worth at a time
// (worker/cards.ts), so a look at the app's files with Inspect never shows the syllabus.
//
// It also fails on the term list itself: any term id the games don't use by name
// (scripts/bundle-terms.json), or more than a screenful of term names in the app's own words.
//
//   node scripts/check-bundle.mjs   (after vite build; reads dist/)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(root, 'src', 'data');
const dist = join(root, 'dist');

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|json|map|txt|webmanifest)$/.test(f)) files.push(p);
  }
};
walk(dist);
// Built files escape quotes and non-ASCII characters in their own ways: compare plain words only.
const plain = (s) => s.toLowerCase().replace(/\\u[0-9a-f]{4}/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const bundle = plain(files.map((f) => readFileSync(f, 'utf8')).join('\n'));

const samples = [];
const take = (where, text) => {
  const p = plain(text ?? '');
  // A stretch long enough to be the card's own words, not a phrase any screen might use.
  if (p.length >= 48) samples.push({ where, text: p.slice(0, 64) });
};
for (const f of readdirSync(join(data, 'terms')).filter((f) => f.endsWith('.json'))) {
  for (const t of JSON.parse(readFileSync(join(data, 'terms', f), 'utf8')).terms) {
    take(`${t.id}: definition`, t.definition);
    take(`${t.id}: fill`, t.fill);
    t.examples.forEach((e, i) => take(`${t.id}: example ${i + 1}`, e));
    (t.calcs ?? []).forEach((c, i) => take(`${t.id}: sum ${i + 1}`, c.why));
  }
}
for (const c of JSON.parse(readFileSync(join(data, 'modes', 'claims.json'), 'utf8'))) take(`claim ${c.id}`, c.why);
for (const i of JSON.parse(readFileSync(join(data, 'talk.json'), 'utf8'))) take(`talk ${i.id}`, i.why);

// Packs: desk cases and the meeting, Fermi and backtest games' content (src/lib/packs.ts).
// A case's setup ships for phases 1 and 2 (the unit sheet shows it), so only its steps count.
const read = (f) => JSON.parse(readFileSync(join(data, f), 'utf8'));
for (const [id, c] of Object.entries(read('cases.json'))) {
  c.steps.forEach((s, i) => {
    take(`case ${id}: step ${i + 1}`, s.text);
    s.options.forEach((o, j) => {
      take(`case ${id}: step ${i + 1} option ${j + 1}`, o.text);
      take(`case ${id}: step ${i + 1} option ${j + 1} why`, o.why);
    });
  });
}
for (const m of read('meetings.json')) {
  m.lines.forEach((l, i) => take(`meeting ${m.id}: line ${i + 1}`, l.text));
  m.questions.forEach((q, i) => take(`meeting ${m.id}: question ${i + 1}`, q.why));
}
for (const f of read('fermi.json')) take(`fermi ${f.id}`, f.how);
for (const b of read('backtests.json')) {
  take(`backtest ${b.id}`, b.about);
  b.cases.forEach((c, i) => {
    take(`backtest ${b.id}: case ${i + 1}`, c.line);
    take(`backtest ${b.id}: case ${i + 1} why`, c.why);
  });
}

// Headline Desk and Finnections content (the app ships only rounds.json: ids, levels and terms).
for (const h of read('modes/headlines.json')) {
  take(`headline ${h.id}`, h.head + ' ' + h.dek);
  take(`headline ${h.id}: why`, h.why);
}
for (const b of read('modes/finnections.json')) b.groups.forEach((g, i) => take(`board ${b.id}: group ${i + 1} why`, g.why));

const found = samples.filter((s) => bundle.includes(s.text));
if (found.length) {
  console.error(`The app's bundle holds ${found.length} pieces of term cards or packs, which should only come from the server. First few:`);
  for (const s of found.slice(0, 8)) console.error(`  ${s.where}: "${s.text}…"`);
  process.exit(1);
}

// The term list: ids as quoted strings, and multi-word names anywhere in the text.
const raw = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const quoted = new Set([...raw.matchAll(/["'`]([a-z0-9][a-z0-9-]*)["'`]/g)].map((m) => m[1]));
const allTerms = readdirSync(join(data, 'terms'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(data, 'terms', f), 'utf8')).terms);
const allowed = new Set(JSON.parse(readFileSync(join(root, 'scripts', 'bundle-terms.json'), 'utf8')).ids);
const strayIds = allTerms.filter((t) => quoted.has(t.id) && !allowed.has(t.id)).map((t) => t.id);
if (strayIds.length) {
  console.error(`The app's bundle names ${strayIds.length} term ids it shouldn't: the app learns a term from the server once the learner reaches it. First few: ${strayIds.slice(0, 12).join(', ')}`);
  console.error('If a game the learner plays really needs one by id, add it to scripts/bundle-terms.json.');
  process.exit(1);
}
// Names show up in the app's own words (unit names, the career map, game screens), so a few are
// fine. A list of them is not.
const NAMES_MAX = 100;
const lower = raw.toLowerCase();
const names = allTerms.filter((t) => /\s/.test(t.term) && lower.includes(t.term.toLowerCase())).map((t) => t.term);
if (names.length > NAMES_MAX) {
  console.error(`The app's bundle holds ${names.length} term names (at most ${NAMES_MAX}), which looks like the term list. First few: ${names.slice(0, 12).join('; ')}`);
  process.exit(1);
}
console.log(`Bundle check: none of ${samples.length} card and pack texts are in the ${files.length} built files, no term ids beyond the ${allowed.size} the games use, and ${names.length} term names in the app's own words.`);
