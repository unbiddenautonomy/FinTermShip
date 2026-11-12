import { describe, expect, it } from 'vitest';
import { PROJECTS, projectDone, projectState, recordReview, REVIEW_PASS, reviewRound, toggleStep } from './projects';
import { seededRng } from './questions';
import { newProgress } from './scheduler';

describe('project track', () => {
  it('has six projects, each with steps and four review questions', () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    for (const p of PROJECTS) {
      expect(p.steps.length).toBeGreaterThanOrEqual(5);
      expect(p.review).toHaveLength(4);
    }
  });

  it('ticks and unticks steps, and needs every step and the review to count as done', () => {
    const p1 = PROJECTS[0];
    let p = toggleStep(newProgress(), 'p1', 2);
    p = toggleStep(p, 'p1', 0);
    expect(projectState(p, 'p1').done).toEqual([0, 2]);
    p = toggleStep(p, 'p1', 2);
    expect(projectState(p, 'p1').done).toEqual([0]);
    for (let i = 1; i < p1.steps.length; i++) p = toggleStep(p, 'p1', i);
    expect(projectDone(p, 'p1')).toBe(false);
    expect(recordReview(p, 'p1', REVIEW_PASS - 1)).toBe(p);
    p = recordReview(p, 'p1', REVIEW_PASS);
    expect(projectDone(p, 'p1')).toBe(true);
    expect(projectDone(p, 'p2')).toBe(false);
  });

  it('shuffles review options but keeps track of the right one', () => {
    for (const project of PROJECTS)
      for (let seed = 1; seed <= 20; seed++) for (const r of reviewRound(project, seededRng(seed))) expect(r.options[r.answer]).toBe(r.q.options[0]);
  });
});
