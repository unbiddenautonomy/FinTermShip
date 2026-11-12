import careerData from '../data/careers.json';
import { unitOpen } from '../lib/choose';
import { path, unitById } from '../lib/content';
import { mockByRound, mockReady } from '../lib/mock';
import { PROJECTS, projectDone, projectState } from '../lib/projects';
import { unitDone } from '../lib/track';
import type { CareerMap, Progress } from '../lib/types';
import { Briefcase, Check, Lock } from './icons';
import { Card, SectionTitle } from './ui';

const careers = careerData as CareerMap;

interface Props {
  progress: Progress;
  onBack: () => void;
  onOpenUnit: (unitId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenMock: (round: string) => void;
}

/** A reading screen, off the track: where the quant units lead, and how firms hire. */
export function Careers({ progress, onBack, onOpenUnit, onOpenProject, onOpenMock }: Props) {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-32 pt-5">
      <header className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="rounded-xl px-2 py-1.5 text-sm font-extrabold text-brand-ink transition hover:bg-sunken">
          ← Back
        </button>
      </header>

      <div className="px-1">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">
          <Briefcase className="h-4 w-4" />
          Career map
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">Quant and trading careers</h1>
        <p className="mt-2 leading-relaxed text-ink-2">{careers.intro}</p>
      </div>

      <section>
        <SectionTitle aside={`${careers.roles.length} roles`}>The jobs</SectionTitle>
        <div className="space-y-3">
          {[...careers.roles].sort((a, b) => Number(b.id === progress.settings.target) - Number(a.id === progress.settings.target)).map((r) => (
            <Card key={r.id} className="space-y-3">
              <div>
                {r.id === progress.settings.target && <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Your target</p>}
                <h3 className="text-lg font-extrabold text-ink">{r.title}</h3>
                <p className="text-sm font-semibold text-ink-3">{r.where}</p>
              </div>
              <p className="leading-relaxed text-ink-2">{r.what}</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
                {r.skills.map((s) => (
                  <li key={s} className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink-2">
                    {s}
                  </li>
                ))}
              </ul>
              <UnitLinks ids={r.practise} progress={progress} onOpenUnit={onOpenUnit} />
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle aside={`${PROJECTS.filter((pr) => projectDone(progress, pr.id)).length} of ${PROJECTS.length} done`}>Project track</SectionTitle>
        <p className="mb-3 px-1 text-sm leading-relaxed text-ink-2">
          The app can make the words, the maths and the judgment automatic. The rest of the job is writing code on real data and defending the result. These six projects run in
          Colab or Jupyter; each has a brief, a checklist and review questions here.
        </p>
        <ol className="space-y-2">
          {PROJECTS.map((pr, i) => {
            const s = projectState(progress, pr.id);
            const done = projectDone(progress, pr.id);
            return (
              <li key={pr.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(pr.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand/50"
                >
                  <span
                    className={`num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done ? 'bg-brand text-white' : 'bg-violet-soft text-violet-ink'}`}
                  >
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold text-ink">{pr.title}</span>
                    <span className="block text-sm text-ink-3">
                      {s.done.length} of {pr.steps.length} steps{s.reviewed ? ' · review passed' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <SectionTitle aside={`${careers.rounds.length} rounds`}>How interviews usually run</SectionTitle>
        <ol className="space-y-3">
          {careers.rounds.map((round, i) => (
            <li key={round.name} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
              <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-soft text-sm font-extrabold text-violet-ink">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="font-extrabold text-ink">{round.name}</h3>
                <p className="text-sm leading-relaxed text-ink-2">{round.what}</p>
                {round.practise.length > 0 && <UnitLinks ids={round.practise} progress={progress} onOpenUnit={onOpenUnit} />}
                {mockByRound.has(round.name) && <MockButton round={round.name} progress={progress} onOpenMock={onOpenMock} />}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="px-1 text-xs leading-relaxed text-ink-3">{careers.note}</p>
    </div>
  );
}

function MockButton({ round, progress, onOpenMock }: { round: string; progress: Progress; onOpenMock: (round: string) => void }) {
  const spec = mockByRound.get(round)!;
  const best = progress.mocks?.[round];
  const ready = !!best && mockReady(best.best, best.total);
  return (
    <button
      type="button"
      onClick={() => onOpenMock(round)}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-bold transition hover:border-violet/50 ${
        ready ? 'border-brand/40 bg-brand-soft text-brand-ink' : 'border-line bg-sunken text-ink'
      }`}
    >
      {ready && <Check className="h-4 w-4 shrink-0" />}
      <span className="flex-1">Timed mock round</span>
      <span className="num text-xs font-semibold text-ink-3">{best ? `best ${best.best} of ${best.total}` : `${spec.count} in ${spec.minutes} min`}</span>
    </button>
  );
}

function UnitLinks({ ids, progress, onOpenUnit }: { ids: string[]; progress: Progress; onOpenUnit: (unitId: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-3">Practise here</p>
      <ul className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const row = path.find((r) => r.unit.id === id);
          const name = unitById.get(id)?.name ?? id;
          const done = !!row && unitDone(progress, row);
          const open = unitOpen(progress, id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onOpenUnit(id)}
                aria-label={`${name}${done ? ', done' : open ? '' : ', locked'}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition hover:border-brand/50 ${
                  done ? 'border-brand/40 bg-brand-soft text-brand-ink' : open ? 'border-line bg-surface text-ink' : 'border-line bg-sunken text-ink-3'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : !open && <Lock className="h-3.5 w-3.5" />}
                {name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
