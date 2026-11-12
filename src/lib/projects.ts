/**
 * The project track: six research projects a quant analyst should be able
 * to do, run in Colab or Jupyter outside the app. The app holds the brief,
 * a checklist the learner ticks off, and review questions on what the
 * project should have taught.
 */
import data from '../data/projects.json';
import { shuffle, type Rng } from './questions';
import type { Progress } from './types';

export interface ReviewQuestion {
  q: string;
  /** The right option first. */
  options: string[];
  why: string;
}

export interface Project {
  id: string;
  title: string;
  summary: string;
  data: string[];
  steps: string[];
  deliverable: string;
  stretch: string[];
  terms: string[];
  review: ReviewQuestion[];
}

export const PROJECTS = data as Project[];
export const projectById = new Map(PROJECTS.map((p) => [p.id, p]));
/** Review questions right, out of four, to count the review as passed. */
export const REVIEW_PASS = 3;

export interface ProjectState {
  /** Indexes of the steps ticked off. */
  done: number[];
  reviewed: boolean;
}

export function projectState(p: Progress, id: string): ProjectState {
  return p.projects?.[id] ?? { done: [], reviewed: false };
}

export function toggleStep(p: Progress, id: string, step: number): Progress {
  const s = projectState(p, id);
  const done = s.done.includes(step) ? s.done.filter((d) => d !== step) : [...s.done, step].sort((a, b) => a - b);
  return { ...p, projects: { ...p.projects, [id]: { ...s, done } } };
}

export function recordReview(p: Progress, id: string, right: number): Progress {
  const s = projectState(p, id);
  if (right < REVIEW_PASS || s.reviewed) return p;
  return { ...p, projects: { ...p.projects, [id]: { ...s, reviewed: true } } };
}

export function projectDone(p: Progress, id: string): boolean {
  const project = projectById.get(id);
  const s = projectState(p, id);
  return !!project && s.reviewed && s.done.length === project.steps.length;
}

/** The review questions with their options shuffled. */
export function reviewRound(project: Project, rng: Rng): { q: ReviewQuestion; options: string[]; answer: number }[] {
  return project.review.map((q) => {
    const order = shuffle([0, 1, 2, 3], rng);
    return { q, options: order.map((k) => q.options[k]), answer: order.indexOf(0) };
  });
}
