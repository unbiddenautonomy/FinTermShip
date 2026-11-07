import { focusActive, unitOpen } from './choose';
import { isPracticeUnit, isQuantArea, path, QUANT_AREAS } from './content';
import { drillBlocks, drillPassed } from './drills';
import type { Progress } from './types';

export type PathRow = (typeof path)[number];

const quantRank = (r: PathRow) => QUANT_AREAS.indexOf(r.category.id);

/** With the quant switch on: quant areas first (core, then advanced), then everything else in the usual order. */
const quantFirstPath: PathRow[] = [
  ...path.filter((r) => isQuantArea(r.category.id)).sort((a, b) => a.pass - b.pass || quantRank(a) - quantRank(b) || path.indexOf(a) - path.indexOf(b)),
  ...path.filter((r) => !isQuantArea(r.category.id)),
];

/** The one track the learner follows: every unit, terms and drills alike, in order. */
export function track(p: Progress): PathRow[] {
  return p.settings.quantFirst ? quantFirstPath : path;
}

/** A practice unit on the track: a drill, game or desk case. */
export function isDrill(r: PathRow): boolean {
  return isPracticeUnit(r.unit.id);
}

export function unitDone(p: Progress, r: PathRow): boolean {
  return isDrill(r) ? drillPassed(p, r.unit.id) : r.terms.every((t) => p.terms[t.id]);
}

/**
 * The unit the learner is on: their pick while it has work left, otherwise the
 * first open unit on the track with terms to meet or a drill to pass. A drill
 * skipped for today is passed over until tomorrow.
 */
export function currentUnit(p: Progress, today: string): string | null {
  if (focusActive(p)) return p.focus!;
  for (const r of track(p)) {
    if (!unitOpen(p, r.unit.id)) continue;
    if (isDrill(r) ? drillBlocks(p, r.unit.id, today) : !unitDone(p, r)) return r.unit.id;
  }
  return null;
}

/**
 * Unmet terms in track order, stopping at the first drill still to pass: the
 * track only moves past a drill once it is passed (or skipped for today).
 */
export function trackTermIds(p: Progress, today: string, count: number): string[] {
  const out: string[] = [];
  for (const r of track(p)) {
    if (out.length >= count) break;
    if (!unitOpen(p, r.unit.id)) continue;
    if (isDrill(r)) {
      if (drillBlocks(p, r.unit.id, today)) break;
      continue;
    }
    for (const t of r.terms) if (!p.terms[t.id]) out.push(t.id);
  }
  return out;
}
