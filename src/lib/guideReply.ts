/**
 * What the guide says once it knows what the learner named: shared by the app and the matcher
 * (src/lib/guide.ts). It needs only terms the app has been given.
 */
import careerData from '../data/careers.json';
import { categories, categoryOfUnit, isPhase3Area, termById, unitById } from './content';
import type { Intent, Reply, Target } from './guide';
import { phase3Open } from './phase3';
import type { CareerMap, Progress } from './types';

export const careers = careerData as CareerMap;

export const STARTERS = ['Where do I start?', 'What is theta?', 'Teach me order types', 'I already know options', 'Prepare me for quant interviews', 'How do I back up my progress?'];

/** What the guide calls a thing, from what the app knows of it. */
export function targetLabel(target: Target): string {
  switch (target.kind) {
    case 'term':
      return termById.get(target.id)?.term ?? '';
    case 'unit':
      return (unitById.get(target.id)?.name ?? '').replace(/^Case: /, 'Desk case: ');
    case 'area':
      return categories.find((c) => c.id === target.id)?.name ?? '';
    case 'role':
      return careers.roles.find((r) => r.id === target.id)?.title ?? '';
  }
}

function phase3Unit(target: Target): string | null {
  if (target.kind === 'term') {
    const t = termById.get(target.id);
    return t && isPhase3Area(categoryOfUnit(t.unit)?.id ?? '') ? t.unit : null;
  }
  if (target.kind === 'unit') return isPhase3Area(categoryOfUnit(target.id)?.id ?? '') ? target.id : null;
  if (target.kind === 'area' && isPhase3Area(target.id)) return categories.find((c) => c.id === target.id)!.units[0].id;
  return null;
}

/** The reply for one thing the learner named. */
export function replyFor(target: Target, intent: Intent, p: Progress, label = targetLabel(target)): Reply {
  const locked = phase3Unit(target);
  if (locked && !phase3Open(p)) return { kind: 'locked3', name: label, unitId: locked };
  switch (target.kind) {
    case 'term':
      return intent === 'teach' ? { kind: 'unit', unitId: termById.get(target.id)!.unit, intent, termId: target.id } : intent === 'know' ? { kind: 'area', categoryId: categoryOfUnit(termById.get(target.id)!.unit)!.id, intent } : { kind: 'term', termId: target.id, intent };
    case 'unit':
      return intent === 'know' ? { kind: 'area', categoryId: categoryOfUnit(target.id)!.id, intent } : { kind: 'unit', unitId: target.id, intent };
    case 'area':
      return { kind: 'area', categoryId: target.id, intent };
    case 'role':
      return { kind: 'role', roleId: target.id };
  }
}
