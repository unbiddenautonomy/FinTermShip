/**
 * Desk cases, Fermi, the meeting game and backtest detective, dealt and marked here. Each round
 * comes without its answers; each answer is sent back and marked, and only then does the right
 * answer and the reason come. The app never gets these packs whole.
 */
// Every term's name, before anything reads the syllabus.
import '../src/lib/syllabus';
import { makeCase, newBacktestRound, STRATEGIES, type Strategy } from '../src/lib/backtest';
import type { FermiItem } from '../src/lib/fermi';
import { FERMI } from '../src/lib/fermi';
import { MEETING, SETTINGS, type Clip, type Setting } from '../src/lib/meeting';
import type { DeskCase } from '../src/lib/types';
import { content } from './cards';

export type PracticeKind = 'fermi' | 'meeting' | 'backtest' | 'case';

const rng = () => Math.random();
function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const built = (() => {
  const { packs } = content();
  const fermi = packs.get('fermi') as FermiItem[];
  const clips = packs.get('meeting') as Clip[];
  const strategies = packs.get('backtest') as Strategy[];
  return { fermi, fermiById: new Map(fermi.map((f) => [f.id, f])), clips, clipById: new Map(clips.map((c) => [c.id, c])), strategies, strategyById: new Map(strategies.map((s) => [s.id, s])) };
})();

interface PracticeUser {
  admin: number;
  phase3: number;
}

function deskCase(user: PracticeUser, unit: unknown): DeskCase | undefined {
  if (typeof unit !== 'string') return undefined;
  const id = `case:${unit}`;
  const { packs, phase3 } = content();
  if (phase3.has(id) && !user.phase3 && !user.admin) return undefined;
  return packs.get(id) as DeskCase | undefined;
}

/** Deal a round without its answers. */
export function dealPractice(user: PracticeUser, kind: unknown, unit?: unknown): Record<string, unknown> | { error: string } {
  if (kind === 'fermi') return { items: shuffled(built.fermi).slice(0, FERMI.items).map((f) => ({ id: f.id, q: f.q, unit: f.unit })) };
  if (kind === 'meeting') {
    const settings = shuffled(Object.keys(SETTINGS) as Setting[]).slice(0, MEETING.clips);
    return {
      items: settings.map((s) => {
        const pool = built.clips.filter((c) => c.setting === s);
        const clip = pool[Math.floor(rng() * pool.length)];
        return { id: clip.id, setting: clip.setting, title: clip.title, lines: clip.lines, terms: clip.terms, questions: clip.questions.slice(0, MEETING.perClip).map((q) => ({ q: q.q, options: shuffled(q.options) })) };
      }),
    };
  }
  if (kind === 'backtest') {
    // The app's own round maker, run here with the server's copy of the reports.
    STRATEGIES.splice(0, STRATEGIES.length, ...built.strategies);
    return {
      items: newBacktestRound(rng).map((c) => ({
        id: c.strategy.id,
        case: c.strategy.cases.findIndex((x) => x.flaw === c.flaw && x.line === c.lines[c.answer].text),
        title: c.strategy.title,
        about: c.strategy.about,
        lines: c.lines,
        stats: c.stats,
        names: c.names,
      })),
    };
  }
  if (kind === 'case') {
    const story = deskCase(user, unit);
    if (!story) return { error: 'That case is not available.' };
    return { setup: story.setup, facts: story.facts, steps: story.steps.map((s) => ({ text: s.text, ask: s.ask, terms: s.terms, options: shuffled(s.options.map((o) => o.text)) })) };
  }
  return { error: 'Unknown practice.' };
}

/** Mark one answer: the right answer and the reason. */
export function markPractice(user: PracticeUser, b: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const gone = { error: 'That question is not available.' };
  if (b.kind === 'fermi') {
    const f = typeof b.id === 'string' ? built.fermiById.get(b.id) : undefined;
    if (!f || typeof b.guess !== 'number' || !(b.guess > 0)) return gone;
    return { answer: f.answer, unit: f.unit, how: f.how, source: f.source, asOf: f.asOf };
  }
  if (b.kind === 'meeting') {
    const clip = typeof b.id === 'string' ? built.clipById.get(b.id) : undefined;
    const q = typeof b.q === 'number' && clip ? clip.questions[b.q] : undefined;
    if (!q || (b.q as number) >= MEETING.perClip) return gone;
    // The right option is written first.
    return { answer: q.options[0], why: q.why };
  }
  if (b.kind === 'backtest') {
    const s = typeof b.id === 'string' ? built.strategyById.get(b.id) : undefined;
    const c = typeof b.case === 'number' && s ? s.cases[b.case] : undefined;
    if (!s || !c) return gone;
    const made = makeCase(s, b.case as number, rng);
    return { answer: made.answer, flaw: c.flaw, why: c.why };
  }
  if (b.kind === 'case') {
    const story = deskCase(user, b.unit);
    const step = typeof b.step === 'number' && story ? story.steps[b.step] : undefined;
    if (!step) return gone;
    // Every option with its reason, once the learner has picked.
    return { options: step.options.map((o) => ({ text: o.text, best: !!o.best, why: o.why })) };
  }
  return { error: 'Unknown practice.' };
}

