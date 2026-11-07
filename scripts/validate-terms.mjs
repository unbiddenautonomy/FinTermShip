// Checks every term file so a broken or incomplete card cannot ship.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'terms');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
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
    if (!Array.isArray(t.examples) || t.examples.length < 1) errors.push(`${where}: needs at least 1 example`);
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
for (const cat of categories) {
  for (const u of cat.units) {
    const count = cat.terms.filter((t) => t.unit === u.id).length;
    if (u.kind && !['terms', 'drill'].includes(u.kind)) errors.push(`${cat.id} > unit ${u.id}: unknown kind "${u.kind}"`);
    if (u.kind === 'drill' && count > 0) errors.push(`${cat.id} > unit ${u.id}: a drill unit has no terms`);
    if (u.kind !== 'drill' && count === 0) errors.push(`${cat.id} > unit ${u.id}: no terms`);
  }
  for (const t of cat.terms) {
    for (const c of t.confusables || []) {
      if (!allIds.has(c)) errors.push(`${cat.id} > ${t.id}: confusable "${c}" is not a known term id`);
      if (c === t.id) errors.push(`${cat.id} > ${t.id}: lists itself as confusable`);
    }
  }
  const coreUnits = cat.units.filter((u) => u.core).map((u) => u.id);
  const coreCount = cat.terms.filter((t) => coreUnits.includes(t.unit)).length;
  const calcs = cat.terms.reduce((n, t) => n + (t.calcs?.length ?? 0), 0);
  const tfs = cat.terms.reduce((n, t) => n + (t.tf?.length ?? 0), 0);
  const drills = cat.units.filter((u) => u.kind === 'drill').length;
  console.log(`${cat.name}: ${cat.terms.length} terms, ${coreCount} core, ${calcs} worked sums, ${tfs} true/false${drills ? `, ${drills} drills` : ''}`);
}
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`All ${allIds.size} terms passed.`);
