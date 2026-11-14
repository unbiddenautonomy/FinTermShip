import { describe, expect, it } from 'vitest';
import careers from '../data/careers.json';
import { cleanName, comma, firstName, mocksReady, ROLES, targetRole } from './profile';
import { newProgress } from './scheduler';
import type { Progress } from './types';

const withSettings = (s: Partial<Progress['settings']>): Progress => ({ ...newProgress(), settings: { ...newProgress().settings, ...s } });

describe('profile', () => {
  it('uses the first word of the name, and nothing when there is none', () => {
    expect(firstName(withSettings({ name: '  Nachi  Kumar ' }))).toBe('Nachi');
    expect(comma(withSettings({ name: 'Nachi' }))).toBe(', Nachi');
    expect(comma(newProgress())).toBe('');
    expect(cleanName('  a   b  ')).toBe('a b');
    expect(cleanName('x'.repeat(50))).toHaveLength(30);
  });

  it('finds the target role and counts ready mock rounds', () => {
    expect(ROLES.length).toBeGreaterThan(3);
    // The short list the app carries matches the career map's roles.
    expect(ROLES).toEqual(careers.roles.map((r) => ({ id: r.id, title: r.title })));
    expect(targetRole(withSettings({ target: 'quant-researcher' }))?.title).toBe('Quant researcher');
    expect(targetRole(withSettings({ target: 'nope' }))).toBeUndefined();
    const p = { ...newProgress(), mocks: { 'Online test': { best: 12, total: 12, date: '2026-11-10', tries: 1 }, 'Mental maths': { best: 5, total: 15, date: '2026-11-10', tries: 1 } } };
    expect(mocksReady(p)).toEqual({ ready: 1, total: 5 });
  });
});
