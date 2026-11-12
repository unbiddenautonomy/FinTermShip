import { useMemo, useState } from 'react';
import { termById } from '../lib/content';
import { projectById, projectDone, projectState, recordReview, REVIEW_PASS, reviewRound, toggleStep } from '../lib/projects';
import { seededRng } from '../lib/questions';
import type { Progress } from '../lib/types';
import { Choices, Verdict } from './GameFrame';
import { Briefcase, Check } from './icons';
import { Card, SectionTitle } from './ui';

interface Props {
  projectId: string;
  progress: Progress;
  onProgress: (p: Progress) => void;
  onBack: () => void;
}

/** One project: the brief, a checklist to tick off as you work in a notebook, and review questions. */
export function ProjectScreen({ projectId, progress, onProgress, onBack }: Props) {
  const project = projectById.get(projectId)!;
  const state = projectState(progress, projectId);
  const [reviewing, setReviewing] = useState(false);
  const [seed, setSeed] = useState(() => Date.now() % 2_147_483_647);

  return (
    <div className="mx-auto max-w-xl lg:max-w-3xl space-y-6 px-4 pb-32 lg:pb-12 pt-5">
      <header className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="rounded-xl px-2 py-1.5 text-sm font-extrabold text-brand-ink transition hover:bg-sunken">
          ← Career map
        </button>
      </header>

      <div className="px-1">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">
          <Briefcase className="h-4 w-4" />
          Project {project.id.slice(1)} of 6
        </p>
        <h1 className="mt-1 text-2xl font-display font-semibold tracking-tight text-ink">{project.title}</h1>
        <p className="mt-2 leading-relaxed text-ink-2">{project.summary}</p>
        {projectDone(progress, projectId) && <p className="mt-2 inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-extrabold text-brand-ink">Done</p>}
      </div>

      <Card className="space-y-2">
        <h2 className="font-extrabold text-ink">Data</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-2">
          {project.data.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="text-sm text-ink-3">The code runs in Colab or Jupyter. Tick each step off here as you finish it.</p>
      </Card>

      <section>
        <SectionTitle aside={`${state.done.length} of ${project.steps.length}`}>Steps</SectionTitle>
        <ol className="space-y-2">
          {project.steps.map((step, i) => {
            const ticked = state.done.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ticked}
                  onClick={() => onProgress(toggleStep(progress, projectId, i))}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${ticked ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface hover:bg-sunken/60'}`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${ticked ? 'border-brand bg-brand text-white' : 'border-ink-3 bg-surface'}`}
                    aria-hidden="true"
                  >
                    {ticked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`text-[15px] leading-snug ${ticked ? 'text-brand-ink' : 'text-ink'}`}>{step}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <Card className="space-y-2">
        <h2 className="font-extrabold text-ink">What to hand in</h2>
        <p className="leading-relaxed text-ink-2">{project.deliverable}</p>
        <h2 className="pt-2 font-extrabold text-ink">If you want more</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-2">
          {project.stretch.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Card>

      <section>
        <SectionTitle aside={state.reviewed ? 'Passed' : `${REVIEW_PASS} of 4 to pass`}>Review</SectionTitle>
        {reviewing ? (
          <Review
            key={seed}
            projectId={projectId}
            seed={seed}
            onDone={(right) => {
              onProgress(recordReview(progress, projectId, right));
            }}
            onAgain={() => setSeed((s) => s + 1)}
          />
        ) : (
          <Card className="space-y-3">
            <p className="leading-relaxed text-ink-2">Four questions on what this project should have taught you, the kind a reviewer or interviewer asks about it.</p>
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="w-full rounded-2xl bg-brand px-5 py-3.5 text-[15px] font-extrabold tracking-wide text-white shadow-press transition active:translate-y-[2px] active:shadow-none"
            >
              {state.reviewed ? 'Review again' : 'Start the review'}
            </button>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Terms it uses</SectionTitle>
        <ul className="flex flex-wrap gap-1.5">
          {project.terms
            .map((id) => termById.get(id))
            .filter((t): t is NonNullable<typeof t> => t !== undefined)
            .map((t) => (
              <li key={t.id} className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink-2" title={t.short}>
                {t.term}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function Review({ projectId, seed, onDone, onAgain }: { projectId: string; seed: number; onDone: (right: number) => void; onAgain: () => void }) {
  const project = projectById.get(projectId)!;
  const round = useMemo(() => reviewRound(project, seededRng(seed)), [project, seed]);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const q = round[index];
  const picked = picks.length > index ? picks[index] : null;
  const over = index >= round.length;
  const right = picks.filter((p, i) => p === round[i].answer).length;

  if (over) {
    const passed = right >= REVIEW_PASS;
    return (
      <Verdict good={passed} title={passed ? `${right} of ${round.length}: review passed` : `${right} of ${round.length}: not yet`} next="Try the questions again" onNext={onAgain}>
        <p className="leading-relaxed text-ink-2">
          {passed ? 'Tick off every step as well and the project counts as done on your career map.' : `You need ${REVIEW_PASS} of ${round.length}. Read the explanations again, then retry.`}
        </p>
      </Verdict>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-3">
        Question {index + 1} of {round.length}
      </p>
      <p className="mb-3 text-[15px] font-bold leading-snug text-ink">{q.q.q}</p>
      <Choices labels={q.options} picked={picked} answer={q.answer} onPick={(i) => picked === null && setPicks((p) => [...p, i])} />
      {picked !== null && (
        <Verdict
          good={picked === q.answer}
          title={picked === q.answer ? 'Right' : 'Not quite'}
          next={index + 1 >= round.length ? 'See the result' : 'Next question'}
          onNext={() => {
            if (index + 1 >= round.length) onDone(picks.filter((p, i) => p === round[i].answer).length);
            setIndex(index + 1);
          }}
        >
          <p className="leading-relaxed text-ink-2">{q.q.why}</p>
        </Verdict>
      )}
    </div>
  );
}
