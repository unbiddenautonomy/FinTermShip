/**
 * Small personal touches: the learner's name and the role they are preparing
 * for. Both optional, kept in settings, so they sync with the account.
 */
import { MOCKS, mockReady } from './mock';
import type { Progress } from './types';

/**
 * The roles on the career map, by id and title only: the map itself (src/data/careers.json)
 * loads with the Careers screen. A test checks this list matches it.
 */
export const ROLES: { id: string; title: string }[] = [
  { id: "quant-trader", title: "Quant trader" },
  { id: "quant-researcher", title: "Quant researcher" },
  { id: "quant-developer", title: "Quant developer" },
  { id: "execution-trader", title: "Execution trader" },
  { id: "risk-manager", title: "Risk manager" },
  { id: "rates-fx-trader", title: "Rates and currency trader" },
  { id: "equity-research-analyst", title: "Equity research analyst" },
  { id: "credit-analyst", title: "Credit analyst" },
  { id: "commodities-trader", title: "Commodities trader" },
];
export const NAME_MAX = 30;

/** The first word of the name, or '' when none is set. */
export function firstName(p: Progress): string {
  return (p.settings.name ?? '').trim().split(/\s+/)[0]?.slice(0, NAME_MAX) ?? '';
}

/** ", Nachi" when a name is set, '' otherwise: for the end of a short line. */
export const comma = (p: Progress) => (firstName(p) ? `, ${firstName(p)}` : '');

export const targetRole = (p: Progress) => ROLES.find((r) => r.id === p.settings.target);

/** Timed mock rounds counted as interview-ready, out of all of them. */
export function mocksReady(p: Progress): { ready: number; total: number } {
  const ready = MOCKS.filter((m) => {
    const b = p.mocks?.[m.round];
    return !!b && mockReady(b.best, b.total);
  }).length;
  return { ready, total: MOCKS.length };
}

/** Tidy what was typed before saving: trimmed, single spaces, capped. */
export const cleanName = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
