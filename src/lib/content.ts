import basics from '../data/terms/basics.json';
import india from '../data/terms/india.json';
import options from '../data/terms/options.json';
import quant from '../data/terms/quant.json';
import trading from '../data/terms/trading.json';
import desk from '../data/terms/desk.json';
import conditions from '../data/terms/conditions.json';
import micro from '../data/terms/micro.json';
import skills from '../data/terms/skills.json';
import instruments from '../data/terms/instruments.json';
import execution from '../data/terms/execution.json';
import cases from '../data/cases.json';
import type { Category, DeskCase, PracticeKind, Term, Unit } from './types';

export const categories: Category[] = ([basics, india, trading, options, instruments, quant, skills, desk, conditions, micro, execution] as Category[]).sort((a, b) => a.order - b.order);

export const termById = new Map<string, Term>();
export const unitById = new Map<string, Unit & { categoryId: string }>();
export const categoryOfTerm = new Map<string, Category>();

for (const cat of categories) {
  for (const u of cat.units) unitById.set(u.id, { ...u, categoryId: cat.id });
  for (const t of cat.terms) {
    termById.set(t.id, t);
    categoryOfTerm.set(t.id, cat);
  }
}

/** Areas the quant switch opens and moves to the front of the path, in this order. */
export const QUANT_AREAS = ['skills', 'quant', 'options', 'instruments', 'micro', 'execution'];

export function isQuantArea(categoryId: string): boolean {
  return QUANT_AREAS.includes(categoryId);
}

export function categoryOfUnit(unitId: string): Category | undefined {
  const u = unitById.get(unitId);
  return u && categories.find((c) => c.id === u.categoryId);
}

/** The kind of a practice unit (drill, game or case), or null for a unit of terms. */
export function practiceKind(unitId: string): PracticeKind | null {
  const k = unitById.get(unitId)?.kind;
  return k && k !== 'terms' ? k : null;
}

/** Practice units sit on the track like term units but have no terms: drills, games and desk cases. */
export function isPracticeUnit(unitId: string): boolean {
  return practiceKind(unitId) !== null;
}

/** Desk cases, by unit id. */
export const caseById = new Map<string, DeskCase>(Object.entries(cases as Record<string, DeskCase>));

export function isCore(termId: string): boolean {
  const t = termById.get(termId);
  return !!t && !!unitById.get(t.unit)?.core;
}

/**
 * The learning path. Pass 1 (the core sweep) takes the core units of every
 * category in order; pass 2 takes the remaining units, again in category order.
 */
export const path: { unit: Unit; category: Category; pass: 1 | 2; terms: Term[] }[] = [];
for (const pass of [1, 2] as const) {
  for (const cat of categories) {
    for (const unit of cat.units) {
      if (unit.core !== (pass === 1)) continue;
      path.push({ unit, category: cat, pass, terms: cat.terms.filter((t) => t.unit === unit.id) });
    }
  }
}

export const pathTermIds: string[] = path.flatMap((p) => p.terms.map((t) => t.id));

export const coreTermIds: string[] = path.filter((p) => p.pass === 1).flatMap((p) => p.terms.map((t) => t.id));

/** A unit's term ids in teaching order. */
export function termIdsOfUnit(unitId: string): string[] {
  return path.find((p) => p.unit.id === unitId)?.terms.map((t) => t.id) ?? [];
}

export function termName(id: string): string {
  return termById.get(id)?.term ?? id;
}
