/**
 * One state per term, shown the same way in every mode: a station on Term Lines, a stock on
 * Recall Exchange, a card in Call It and a row in the term sheet all use these five.
 */
import areaData from '../../data/modes/areas.json';
import { unitOpen } from '../choose';
import { categoryOfTerm, termById } from '../content';
import { isKnown } from '../scheduler';
import type { Progress } from '../types';

export type TermStatus = 'locked' | 'unmet' | 'met' | 'due' | 'known';

export function termStatus(p: Progress, termId: string, today: string): TermStatus {
  const s = p.terms[termId];
  if (!s) {
    const t = termById.get(termId);
    return t && unitOpen(p, t.unit) ? 'unmet' : 'locked';
  }
  if (s.step > 0 && s.due <= today) return 'due';
  return isKnown(s) ? 'known' : 'met';
}

export const STATUS_LABEL: Record<TermStatus, string> = {
  locked: 'Not open yet',
  unmet: 'Not met yet',
  met: 'Learning',
  due: 'Due for review',
  known: 'Known',
};

export interface Area {
  colour: string;
  code: string;
}
export const areas = areaData as Record<string, Area>;

export function areaOf(termId: string): (Area & { id: string; name: string }) | undefined {
  const c = categoryOfTerm.get(termId);
  if (!c) return undefined;
  return { id: c.id, name: c.name, ...(areas[c.id] ?? { colour: '#888888', code: c.id.slice(0, 3).toUpperCase() }) };
}
