// Checks every term file so a broken or incomplete card cannot ship.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'terms');
const cases = JSON.parse(readFileSync(join(dir, '..', 'cases.json'), 'utf8'));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
// The games the app can play (see src/lib/games.ts).
const GAMES = ['market', 'payoff', 'greeks', 'kelly', 'guess', 'fermi', 'meeting', 'backtest', 'signal', 'pairs', 'expiry', 'risk', 'vwap', 'readbook'];
const errors = [];
const allIds = new Map();
const allTerms = new Map();
const categories = [];

for (const file of files) {
  const cat = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  categories.push(cat);
  const unitIds = new Set(cat.units.map((u) => u.id));
  for (const t of cat.terms) {
    const where = `${file} > ${t.id ?? '(no id)'}`;
    const need = ['id', 'term', 'unit', 'short', 'definition', 'fill'];
    for (const k of need) if (!t[k] || typeof t[k] !== 'string') errors.push(`${where}: missing ${k}`);
    if (!unitIds.has(t.unit)) errors.push(`${where}: unknown unit ${t.unit}`);
    if (!Array.isArray(t.examples) || t.examples.length < 3) errors.push(`${where}: needs at least 3 examples`);
    if (!Array.isArray(t.wrong) || t.wrong.length !== 3) errors.push(`${where}: needs exactly 3 wrong definitions`);
    if (!Array.isArray(t.confusables) || t.confusables.length < 1) errors.push(`${where}: needs at least 1 confusable`);
    if ((t.fill.match(/____/g) || []).length !== 1) errors.push(`${where}: fill needs exactly one ____`);
    const lowerFill = t.fill.toLowerCase();
    for (const name of [t.term, ...(t.aliases || [])]) {
      if (name.length > 3 && lowerFill.includes(name.toLowerCase())) errors.push(`${where}: fill sentence gives away "${name}"`);
    }
    if (t.short.length > 48) errors.push(`${where}: short gloss too long (${t.short.length} chars)`);
    if (![1, 2, 3].includes(t.difficulty)) errors.push(`${where}: difficulty must be 1, 2 or 3`);
    if (t.asOf && !t.source) errors.push(`${where}: asOf without a source`);
    if (t.reads !== undefined && (typeof t.reads?.up !== 'string' || typeof t.reads?.down !== 'string' || !t.reads.up || !t.reads.down)) errors.push(`${where}: reads needs up and down`);
    for (const [i, c] of (t.calcs || []).entries()) {
      const at = `${where} calc ${i + 1}`;
      if (!c.q || !c.why) errors.push(`${at}: needs q and why`);
      if (!Array.isArray(c.options) || c.options.length !== 4) errors.push(`${at}: needs exactly 4 options`);
      else if (new Set(c.options).size !== 4) errors.push(`${at}: options must be different`);
      if (c.answer !== 0) errors.push(`${at}: write the right option first (answer 0)`);
    }
    for (const [i, f] of (t.tf || []).entries()) {
      if (!f.s || typeof f.a !== 'boolean') errors.push(`${where} tf ${i + 1}: needs s and a true/false answer`);
    }
    if (allIds.has(t.id)) errors.push(`${where}: duplicate id (also in ${allIds.get(t.id)})`);
    allIds.set(t.id, file);
    const key = t.term.toLowerCase();
    if (allTerms.has(key)) errors.push(`${where}: duplicate term "${t.term}"`);
    allTerms.set(key, t.id);
  }
}
const byId = new Map(categories.flatMap((c) => c.terms.map((t) => [t.id, t])));
for (const cat of categories) {
  for (const u of cat.units) {
    const count = cat.terms.filter((t) => t.unit === u.id).length;
    const practice = ['drill', 'game', 'case'].includes(u.kind);
    if (u.kind && u.kind !== 'terms' && !practice) errors.push(`${cat.id} > unit ${u.id}: unknown kind "${u.kind}"`);
    if (practice && count > 0) errors.push(`${cat.id} > unit ${u.id}: a ${u.kind} unit has no terms`);
    if (!practice && count === 0) errors.push(`${cat.id} > unit ${u.id}: no terms`);
    if (u.kind === 'case' && !cases[u.id]) errors.push(`${cat.id} > unit ${u.id}: no desk case in cases.json`);
    if (u.kind === 'game' && !GAMES.includes(u.game)) errors.push(`${cat.id} > unit ${u.id}: a game unit needs "game" set to one of ${GAMES.join(', ')}`);
    if (u.kind !== 'game' && u.game) errors.push(`${cat.id} > unit ${u.id}: only game units name a game`);
    if (u.level !== undefined && !(u.game === 'market' && [2, 3, 4, 5].includes(u.level))) errors.push(`${cat.id} > unit ${u.id}: only market game units have a level, from 2 to 5`);
  }
  for (const t of cat.terms) {
    for (const c of t.confusables || []) {
      if (!allIds.has(c)) errors.push(`${cat.id} > ${t.id}: confusable "${c}" is not a known term id`);
      if (c === t.id) errors.push(`${cat.id} > ${t.id}: lists itself as confusable`);
    }
    // Overlaps: terms that fit this one's definition too, so they're never each other's wrong option.
    for (const o of t.overlaps || []) {
      if (!allIds.has(o)) errors.push(`${cat.id} > ${t.id}: overlap "${o}" is not a known term id`);
      else if (o === t.id) errors.push(`${cat.id} > ${t.id}: lists itself as an overlap`);
      else if (!(byId.get(o).overlaps || []).includes(t.id)) errors.push(`${cat.id} > ${t.id}: overlaps "${o}", but "${o}" doesn't list it back`);
    }
    if (new Set(t.overlaps || []).size !== (t.overlaps || []).length) errors.push(`${cat.id} > ${t.id}: an overlap is listed twice`);
  }
  // Phase 3 areas sit after everything else and open as a whole, so none of their units is core.
  if (cat.phase !== undefined && cat.phase !== 3) errors.push(`${cat.id}: phase must be 3 when set`);
  if (cat.phase === 3 && cat.units.some((u) => u.core)) errors.push(`${cat.id}: phase 3 units can't be core`);
  const coreUnits = cat.units.filter((u) => u.core).map((u) => u.id);
  const coreCount = cat.terms.filter((t) => coreUnits.includes(t.unit)).length;
  const calcs = cat.terms.reduce((n, t) => n + (t.calcs?.length ?? 0), 0);
  const tfs = cat.terms.reduce((n, t) => n + (t.tf?.length ?? 0), 0);
  const drills = cat.units.filter((u) => u.kind === 'drill').length;
  const others = cat.units.filter((u) => u.kind === 'game' || u.kind === 'case').length;
  console.log(`${cat.name}: ${cat.terms.length} terms, ${coreCount} core, ${calcs} worked sums, ${tfs} true/false${drills ? `, ${drills} drills` : ''}${others ? `, ${others} games or cases` : ''}`);
}
// Desk cases: every step has one best option, a reason for each option, and known terms.
const caseUnits = new Set(categories.flatMap((c) => c.units.filter((u) => u.kind === 'case').map((u) => u.id)));
for (const [id, c] of Object.entries(cases)) {
  const where = `cases.json > ${id}`;
  if (!caseUnits.has(id)) errors.push(`${where}: no unit with kind "case" has this id`);
  if (!c.setup || typeof c.setup !== 'string') errors.push(`${where}: missing setup`);
  if (!Array.isArray(c.facts) || c.facts.length < 1) errors.push(`${where}: needs at least 1 fact`);
  if (!Array.isArray(c.steps) || c.steps.length < 4) errors.push(`${where}: needs at least 4 steps`);
  for (const [i, st] of (c.steps || []).entries()) {
    const at = `${where} step ${i + 1}`;
    if (!st.ask) errors.push(`${at}: missing ask`);
    if (!Array.isArray(st.options) || st.options.length < 3 || st.options.length > 4) errors.push(`${at}: needs 3 or 4 options`);
    else {
      if (st.options.filter((o) => o.best).length !== 1) errors.push(`${at}: exactly one option must be best`);
      for (const o of st.options) if (!o.text || !o.why) errors.push(`${at}: every option needs text and why`);
      if (new Set(st.options.map((o) => o.text)).size !== st.options.length) errors.push(`${at}: options must be different`);
    }
    for (const t of st.terms || []) if (!allIds.has(t)) errors.push(`${at}: term "${t}" is not a known term id`);
  }
}
console.log(`Desk cases: ${Object.keys(cases).length}, ${Object.values(cases).reduce((n, c) => n + c.steps.length, 0)} decisions`);

// Talk items (decode it, say it like the desk, respond in the room, spot the misuse):
// four different options with the right one first, a reason, and known terms.
const talk = JSON.parse(readFileSync(join(dir, '..', 'talk.json'), 'utf8'));
const FORMATS = ['decode', 'say', 'reply', 'misuse'];
const talkIds = new Set();
for (const it of talk) {
  const at = `talk.json > ${it.id ?? '(no id)'}`;
  if (!it.id) errors.push(`${at}: missing id`);
  if (talkIds.has(it.id)) errors.push(`${at}: duplicate id`);
  talkIds.add(it.id);
  if (!FORMATS.includes(it.format)) errors.push(`${at}: unknown format "${it.format}"`);
  for (const id of [it.term, ...(it.also || [])]) if (!allIds.has(id)) errors.push(`${at}: term "${id}" is not a known term id`);
  if ((it.also || []).includes(it.term)) errors.push(`${at}: lists its own term in also`);
  if (it.format !== 'misuse' && !it.prompt) errors.push(`${at}: needs a prompt`);
  if (it.format === 'reply' && !it.who) errors.push(`${at}: a reply needs who is speaking`);
  if (!it.why) errors.push(`${at}: needs why`);
  if (!Array.isArray(it.options) || it.options.length !== 4) errors.push(`${at}: needs exactly 4 options`);
  else {
    if (new Set(it.options).size !== 4) errors.push(`${at}: options must be different`);
    // The right option (written first) must not give itself away by being much longer.
    const longestWrong = Math.max(...it.options.slice(1).map((o) => o.length));
    if (it.options[0].length > 1.25 * longestWrong) errors.push(`${at}: the right option is much longer than the others`);
  }
}
console.log(`Talk items: ${talk.length} (${FORMATS.map((f) => `${talk.filter((i) => i.format === f).length} ${f}`).join(', ')})`);

// Fermi questions: a positive answer, a worked path, and a source for anything that is a fact rather than a sum.
const fermi = JSON.parse(readFileSync(join(dir, '..', 'fermi.json'), 'utf8'));
const fermiIds = new Set();
for (const f of fermi) {
  const at = `fermi.json > ${f.id ?? '(no id)'}`;
  if (!f.id || !f.q || !f.how) errors.push(`${at}: needs id, q and how`);
  if (fermiIds.has(f.id)) errors.push(`${at}: duplicate id`);
  fermiIds.add(f.id);
  if (typeof f.answer !== 'number' || !(f.answer >= 1) || f.answer > 1e13) errors.push(`${at}: answer must be a number from 1 to 10^13`);
  if (f.asOf && !f.source) errors.push(`${at}: asOf without a source`);
  if (f.source && !f.asOf) errors.push(`${at}: a sourced fact needs asOf`);
  if (f.source && !/^https:\/\//.test(f.source)) errors.push(`${at}: source must be an https link`);
}
if (fermi.length < 16) errors.push(`fermi.json: needs at least 16 questions so rounds of 8 vary`);
console.log(`Fermi questions: ${fermi.length} (${fermi.filter((f) => f.source).length} sourced facts)`);

// Meeting clips: a few lines, two questions with the right option first and not the longest by far, and terms that exist outside phase 3.
const SETTINGS = ['morning', 'research', 'pm', 'risk', 'fno', 'execution', 'broker', 'event'];
const meetings = JSON.parse(readFileSync(join(dir, '..', 'meetings.json'), 'utf8'));
const phase3Ids = new Set(categories.filter((c) => c.phase === 3).flatMap((c) => c.terms.map((t) => t.id)));
const clipIds = new Set();
for (const c of meetings) {
  const at = `meetings.json > ${c.id ?? '(no id)'}`;
  if (!c.id || !c.title) errors.push(`${at}: needs id and title`);
  if (clipIds.has(c.id)) errors.push(`${at}: duplicate id`);
  clipIds.add(c.id);
  if (!SETTINGS.includes(c.setting)) errors.push(`${at}: setting must be one of ${SETTINGS.join(', ')}`);
  if (!Array.isArray(c.lines) || c.lines.length < 3 || c.lines.length > 6) errors.push(`${at}: needs 3 to 6 lines`);
  for (const l of c.lines ?? []) if (!l.who || !l.text) errors.push(`${at}: every line needs who and text`);
  if (!Array.isArray(c.questions) || c.questions.length !== 2) errors.push(`${at}: needs exactly 2 questions`);
  for (const [i, q] of (c.questions ?? []).entries()) {
    const qa = `${at} question ${i + 1}`;
    if (!q.q || !q.why) errors.push(`${qa}: needs q and why`);
    if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${qa}: needs exactly 4 options`);
    else {
      if (new Set(q.options).size !== 4) errors.push(`${qa}: options must be different`);
      if (q.options[0].length > 1.25 * Math.max(...q.options.slice(1).map((o) => o.length))) errors.push(`${qa}: the right option is much longer than the others`);
    }
  }
  if (!Array.isArray(c.terms) || c.terms.length < 1) errors.push(`${at}: needs at least 1 term`);
  for (const id of c.terms ?? []) {
    if (!allIds.has(id)) errors.push(`${at}: term "${id}" is not a known term id`);
    if (phase3Ids.has(id)) errors.push(`${at}: term "${id}" is in phase 3`);
  }
}
for (const s of SETTINGS) if (meetings.filter((c) => c.setting === s).length < 3) errors.push(`meetings.json: setting "${s}" needs at least 3 clips so rounds vary`);
console.log(`Meeting clips: ${meetings.length}, ${meetings.reduce((n, c) => n + (c.questions?.length ?? 0), 0)} questions`);

// Backtest reports: six clean lines per strategy, and cases that each swap one line for a flawed one in a slot that fits the flaw.
const SLOTS = ['universe', 'data', 'trading', 'costs', 'testing', 'result'];
const FLAW_SLOTS = {
  survivorship: ['universe'],
  lookahead: ['universe', 'data', 'trading'],
  costs: ['costs'],
  overfit: ['testing'],
  snooping: ['universe', 'testing'],
  small: ['result'],
  beta: ['result'],
  baddata: ['data'],
};
const FLAW_TERMS = ['survivorship-bias', 'look-ahead-bias', 'transaction-costs', 'overfitting', 'data-snooping', 'small-sample', 'just-beta', 'garbage-in-garbage-out'];
for (const id of FLAW_TERMS) if (!allIds.has(id)) errors.push(`backtests: flaw term "${id}" is not a known term id`);
const backtests = JSON.parse(readFileSync(join(dir, '..', 'backtests.json'), 'utf8'));
const strategyIds = new Set();
for (const s of backtests) {
  const at = `backtests.json > ${s.id ?? '(no id)'}`;
  if (!s.id || !s.title || !s.about) errors.push(`${at}: needs id, title and about`);
  if (strategyIds.has(s.id)) errors.push(`${at}: duplicate id`);
  strategyIds.add(s.id);
  for (const slot of SLOTS) if (!s.lines?.[slot]) errors.push(`${at}: missing the ${slot} line`);
  if (Object.keys(s.lines ?? {}).some((k) => !SLOTS.includes(k))) errors.push(`${at}: lines may only be ${SLOTS.join(', ')}`);
  if (!Array.isArray(s.cases) || s.cases.length < 2) errors.push(`${at}: needs at least 2 cases`);
  const seen = new Set();
  for (const c of s.cases ?? []) {
    const ca = `${at} > ${c.flaw}`;
    if (!FLAW_SLOTS[c.flaw]) errors.push(`${ca}: flaw must be one of ${Object.keys(FLAW_SLOTS).join(', ')}`);
    else if (!FLAW_SLOTS[c.flaw].includes(c.slot)) errors.push(`${ca}: a ${c.flaw} flaw can't sit in the ${c.slot} line`);
    if (seen.has(c.flaw)) errors.push(`${ca}: the same flaw twice in one strategy`);
    seen.add(c.flaw);
    if (!c.line || !c.why) errors.push(`${ca}: needs line and why`);
    if (c.line === s.lines?.[c.slot]) errors.push(`${ca}: the flawed line is the same as the clean one`);
    const st = c.stats ?? {};
    if (!(st.sharpe > 0 && st.annual > 0 && st.drawdown > 0)) errors.push(`${ca}: needs sharpe, annual and drawdown above 0`);
  }
}
for (const f of Object.keys(FLAW_SLOTS)) {
  const n = backtests.filter((s) => (s.cases ?? []).some((c) => c.flaw === f)).length;
  if (n < 3) errors.push(`backtests.json: flaw "${f}" needs cases in at least 3 strategies so rounds vary`);
}
if (backtests.length < 8) errors.push('backtests.json: needs at least 8 strategies, as a round uses 6 different ones');
console.log(`Backtest reports: ${backtests.length} strategies, ${backtests.reduce((n, s) => n + (s.cases?.length ?? 0), 0)} cases`);

// Career map: every role and round has its text, and points at units that exist.
const careers = JSON.parse(readFileSync(join(dir, '..', 'careers.json'), 'utf8'));
const unitIdsAll = new Set(categories.flatMap((c) => c.units.map((u) => u.id)));
if (!careers.intro || !careers.note) errors.push('careers.json: needs intro and note');
for (const r of careers.roles || []) {
  const at = `careers.json > ${r.id ?? r.title}`;
  for (const k of ['id', 'title', 'where', 'what']) if (!r[k]) errors.push(`${at}: missing ${k}`);
  if (!Array.isArray(r.skills) || r.skills.length < 2) errors.push(`${at}: needs at least 2 skills`);
  if (!Array.isArray(r.practise) || r.practise.length < 1) errors.push(`${at}: needs at least 1 unit to practise`);
}
for (const round of careers.rounds || []) {
  if (!round.name || !round.what) errors.push(`careers.json > round ${round.name ?? '?'}: needs name and what`);
}
for (const item of [...(careers.roles || []), ...(careers.rounds || [])]) {
  for (const u of item.practise || []) if (!unitIdsAll.has(u)) errors.push(`careers.json > ${item.id ?? item.name}: unknown unit "${u}"`);
}
console.log(`Career map: ${careers.roles?.length ?? 0} roles, ${careers.rounds?.length ?? 0} interview rounds`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`All ${allIds.size} terms passed.`);
