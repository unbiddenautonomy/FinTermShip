import { describe, expect, it } from 'vitest';
import { cleanName, comma, daysToInterview, firstName, mocksReady, ROLES, targetRole } from './profile';
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

  it('counts the days to an interview and forgets one that has passed', () => {
    expect(daysToInterview(withSettings({ interviewDate: '2026-11-20' }), '2026-11-12')).toBe(8);
    expect(daysToInterview(withSettings({ interviewDate: '2026-11-12' }), '2026-11-12')).toBe(0);
    expect(daysToInterview(withSettings({ interviewDate: '2026-11-01' }), '2026-11-12')).toBeNull();
    expect(daysToInterview(withSettings({ interviewDate: 'soon' }), '2026-11-12')).toBeNull();
    expect(daysToInterview(newProgress(), '2026-11-12')).toBeNull();
  });

  it('finds the target role and counts ready mock rounds', () => {
    expect(ROLES.length).toBeGreaterThan(3);
    expect(targetRole(withSettings({ target: 'quant-researcher' }))?.title).toBe('Quant researcher');
    expect(targetRole(withSettings({ target: 'nope' }))).toBeUndefined();
    const p = { ...newProgress(), mocks: { Coding: { best: 8, total: 8, date: '2026-11-10', tries: 1 }, 'Mental maths': { best: 5, total: 15, date: '2026-11-10', tries: 1 } } };
    expect(mocksReady(p)).toEqual({ ready: 1, total: 6 });
  });
});
