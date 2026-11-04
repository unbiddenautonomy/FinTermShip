import basics from '../data/terms/basics.json';
import india from '../data/terms/india.json';
import type { Category, Term, Unit } from './types';

export const categories: Category[] = ([basics, india] as Category[]).sort((a, b) => a.order - b.order);

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

export function termName(id: string): string {
  return termById.get(id)?.term ?? id;
}
