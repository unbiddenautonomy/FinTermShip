/**
 * One state per term, shown the same way in every mode: a station on Term Lines, a stock on
 * Recall Exchange, a card in Call It and a row in the term sheet all use these five.
 */
import areaData from '../../data/modes/areas.json';
import { unitOpen } from '../choose';
import { categoryOfTerm, termById } from '../content';
import { isDueOn, isKnownOn } from '../scheduler';
import type { Progress } from '../types';

export type TermStatus = 'locked' | 'unmet' | 'met' | 'due' | 'known';

export function termStatus(p: Progress, termId: string, today: string): TermStatus {
  const s = p.terms[termId];
  if (!s) {
    const t = termById.get(termId);
    return t && unitOpen(p, t.unit) ? 'unmet' : 'locked';
  }
  if (isDueOn(s, today)) return 'due';
  return isKnownOn(s, today) ? 'known' : 'met';
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

/**
 * A unit as one station: its weakest state wins, so due work shows. `size` is how many terms the
 * unit has, when the app knows only some of them: the rest haven't been met.
 */
export function unitStatus(p: Progress, unitId: string, termIds: string[], today: string, size = termIds.length): TermStatus {
  if (!unitOpen(p, unitId)) return 'locked';
  const st = termIds.map((id) => termStatus(p, id, today));
  if (st.includes('due')) return 'due';
  if (st.length && st.length >= size && st.every((s) => s === 'known')) return 'known';
  if (st.some((s) => s !== 'unmet')) return 'met';
  return 'unmet';
}
