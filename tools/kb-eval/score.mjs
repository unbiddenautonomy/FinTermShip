// Scores a retrieval system against the 100 test questions in questions.jsonl.
//
//   node tools/kb-eval/score.mjs results.jsonl
//       results.jsonl: one line per question, {"id":"q001","retrieved":["term:bid","compare:ask|bid",...]}
//       in rank order. For the out-of-scope questions, return the chunks your system would pass to
//       the model after its similarity cut-off; an empty list counts as a correct "nothing found".
//
//   node tools/kb-eval/score.mjs --baseline glossary-out/knowledge-base.jsonl
//       Scores a plain keyword search (BM25) over the knowledge base, as a floor to beat.
//       Add --name-boost to put a term's own chunk first when the question names the term
//       (the step docs/knowledge-base.md recommends for any search).
//
// A question counts as found at k when any of its expected chunks is in the top k.
// Format and background: docs/knowledge-base.md.

import { readFileSync } from 'node:fs';

const here = new URL('./questions.jsonl', import.meta.url);
const questions = lines(readFileSync(here, 'utf8'));
const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node tools/kb-eval/score.mjs results.jsonl | --baseline knowledge-base.jsonl');
  process.exit(1);
}

const results = new Map();
if (args[0] === '--baseline') {
  const chunks = lines(readFileSync(args[1] ?? 'glossary-out/knowledge-base.jsonl', 'utf8'));
  const search = bm25(chunks);
  const boost = args.includes('--name-boost') ? nameBoost(chunks) : (q, ids) => ids;
  for (const q of questions) results.set(q.id, boost(q.query, search(q.query, 10)));
} else {
  for (const r of lines(readFileSync(args[0], 'utf8'))) results.set(r.id, r.retrieved ?? []);
}

const inScope = questions.filter((q) => q.expected.length);
const outScope = questions.filter((q) => !q.expected.length);
const rankOf = (q) => {
  const got = results.get(q.id) ?? [];
  const i = got.findIndex((id) => q.expected.includes(id));
  return i < 0 ? Infinity : i + 1;
};

const kinds = [...new Set(inScope.map((q) => q.kind))];
const row = (label, qs) => {
  const ranks = qs.map(rankOf);
  const at = (k) => `${Math.round((100 * ranks.filter((r) => r <= k).length) / qs.length)}%`.padStart(5);
  const mrr = (ranks.reduce((s, r) => s + (r === Infinity ? 0 : 1 / r), 0) / qs.length).toFixed(2);
  console.log(`${label.padEnd(14)}${String(qs.length).padStart(4)}  ${at(1)}  ${at(3)}  ${at(5)}  ${mrr.padStart(5)}`);
};
console.log(`${'kind'.padEnd(14)}   n  hit@1 hit@3 hit@5   MRR`);
for (const k of kinds) row(k, inScope.filter((q) => q.kind === k));
row('all in scope', inScope);

const missing = questions.filter((q) => !results.has(q.id));
if (args[0] !== '--baseline') {
  const empty = outScope.filter((q) => (results.get(q.id) ?? []).length === 0).length;
  console.log(`\nno answer in the knowledge base (gap or out of scope): ${empty} of ${outScope.length} returned nothing (the rest need the model to say it doesn't know)`);
}
if (missing.length) console.log(`\nno result for ${missing.length} questions: ${missing.map((q) => q.id).join(', ')}`);

const misses = inScope.filter((q) => rankOf(q) > 5);
if (misses.length) {
  console.log('\nnot in the top 5:');
  for (const q of misses) console.log(`  ${q.id} "${q.query}" wanted ${q.expected[0]}, got ${(results.get(q.id) ?? []).slice(0, 3).join(', ') || 'nothing'}`);
}

// When the question contains a term's name or other name as whole words, that term's chunk goes
// first (the longest name wins, so "short selling" beats "short").
function nameBoost(chunks) {
  const names = chunks
    .filter((c) => c.type === 'term')
    .flatMap((c) => c.metadata.names.filter((n) => n.length > 2).map((n) => [n.toLowerCase(), c.id]))
    .sort((a, b) => b[0].length - a[0].length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tests = names.map(([n, id]) => [new RegExp(`(^|[^a-z0-9])${esc(n)}($|[^a-z0-9])`), id]);
  return (query, ids) => {
    const q = query.toLowerCase();
    const hit = tests.find(([re]) => re.test(q));
    return hit ? [hit[1], ...ids.filter((id) => id !== hit[1])] : ids;
  };
}

function lines(text) {
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function bm25(chunks) {
  const tok = (s) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const docs = chunks.map((c) => tok(`${c.title} ${c.text} ${c.questions.join(' ')}`));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const tfs = docs.map((d) => d.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map()));
  const n = docs.length;
  const avg = docs.reduce((s, d) => s + d.length, 0) / n;
  return (query, k) => {
    const q = tok(query);
    return docs
      .map((d, i) => {
        let s = 0;
        for (const w of q) {
          const tf = tfs[i].get(w);
          if (!tf) continue;
          const idf = Math.log(1 + (n - df.get(w) + 0.5) / (df.get(w) + 0.5));
          s += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * d.length) / avg));
        }
        return [s, i];
      })
      .sort((a, b) => b[0] - a[0])
      .slice(0, k)
      .map(([, i]) => chunks[i].id);
  };
}
