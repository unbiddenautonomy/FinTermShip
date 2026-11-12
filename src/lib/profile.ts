/**
 * Small personal touches: the learner's name and the role they are preparing
 * for. Both optional, kept in settings, so they sync with the account.
 */
import careerData from '../data/careers.json';
import { MOCKS, mockReady } from './mock';
import type { CareerMap, Progress } from './types';

const careers = careerData as CareerMap;
export const ROLES = careers.roles.map((r) => ({ id: r.id, title: r.title }));
export const NAME_MAX = 30;

/** The first word of the name, or '' when none is set. */
export function firstName(p: Progress): string {
  return (p.settings.name ?? '').trim().split(/\s+/)[0]?.slice(0, NAME_MAX) ?? '';
}

/** ", Nachi" when a name is set, '' otherwise: for the end of a short line. */
export const comma = (p: Progress) => (firstName(p) ? `, ${firstName(p)}` : '');

export const targetRole = (p: Progress) => careers.roles.find((r) => r.id === p.settings.target);

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
