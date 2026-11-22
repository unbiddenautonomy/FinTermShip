import { describe, expect, it } from 'vitest';
import { seasonFor } from './seasons';

const on = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return seasonFor(new Date(y, m - 1, d, 12));
};

describe('seasonFor', () => {
  it('gives each festival its whole week', () => {
    expect(on('2026-11-05')).toBe('diwali');
    expect(on('2026-11-11')).toBe('diwali');
    expect(on('2026-11-12')).toBe('autumn');
    expect(on('2027-03-19')).toBe('holi');
    expect(on('2027-03-25')).toBe('holi');
    expect(on('2026-12-22')).toBe('christmas');
    expect(on('2026-12-28')).toBe('christmas');
    expect(on('2026-12-29')).toBe('winter');
    expect(on('2026-10-25')).toBe('halloween');
    expect(on('2026-11-01')).toBe('autumn');
  });

  it('runs Navratri from the first night to Dussehra', () => {
    expect(on('2026-10-10')).toBe('autumn');
    expect(on('2026-10-11')).toBe('navratri');
    expect(on('2026-10-20')).toBe('navratri');
    expect(on('2026-10-21')).toBe('autumn');
  });

  it('follows the seasons between festivals', () => {
    expect(on('2027-01-15')).toBe('winter');
    expect(on('2028-02-29')).toBe('winter');
    expect(on('2027-03-01')).toBe('spring');
    expect(on('2027-05-31')).toBe('spring');
    expect(on('2027-09-01')).toBe('autumn');
    expect(on('2027-12-01')).toBe('winter');
  });

  it('fills summer with F1, and the Olympics while the Games are on', () => {
    expect(on('2027-07-20')).toBe('f1');
    expect(on('2028-07-14')).toBe('olympics');
    expect(on('2028-07-30')).toBe('olympics');
    expect(on('2028-07-31')).toBe('f1');
  });

  it('picks the festival higher on the list when two overlap', () => {
    // Holi 2029 (1 March) starts its week in winter and ends it in spring: Holi wins both.
    expect(on('2029-02-26')).toBe('holi');
    expect(on('2029-03-04')).toBe('holi');
    // Winter Olympics 2030 fall inside winter, which ranks higher.
    expect(on('2030-02-10')).toBe('winter');
  });

  it('always has a season, every day from 2025 to 2030', () => {
    for (let t = new Date(2025, 0, 1); t.getFullYear() <= 2030; t.setDate(t.getDate() + 1)) {
      expect(seasonFor(t)).not.toBeNull();
    }
  });
});
