import type { ReactNode } from 'react';
import { categories, termName, unitById } from '../lib/content';
import { clock, DRILLS } from '../lib/drills';
import { PHASE3, PHASE3_TEST_SIZE } from '../lib/phase3';
import { Bolt, Flame, Target } from './icons';
import type { LessonSummary } from './Lesson';
import { Button, Card, Ring } from './ui';

interface Props {
  summary: LessonSummary;
  canContinue: boolean;
  /** Label for the continue button, e.g. "Try again" when the next step is the same drill. */
  nextLabel?: string;
  onHome: () => void;
  onNext: () => void;
  /** Offered after a failed drill, game or case that holds up the path. */
  onSnooze?: () => void;
  /** The learner's first name, added to a good result's title. */
  name?: string;
}

export function Results({ summary, canContinue, nextLabel = 'Next lesson', onHome, onNext, onSnooze, name }: Props) {
  const pct = summary.firstTryTotal ? Math.round((summary.firstTryCorrect / summary.firstTryTotal) * 100) : 100;
  const test = summary.test;
  const drill = summary.drill;
  const round = summary.round;
  const spec = drill ? DRILLS[drill.unitId] : undefined;
  const area = test ? categories.find((c) => c.id === test.categoryId)?.name ?? 'this area' : '';
  const title = round
    ? round.passed
      ? round.firstPass
        ? round.kind === 'game'
          ? 'Game passed'
          : 'Case passed'
        : 'Passed again'
      : 'Not yet'
    : drill
    ? drill.passed
      ? drill.firstPass
        ? 'Drill passed'
        : 'Passed again'
      : 'Not yet'
    : test
      ? test.passed
        ? 'Test passed'
        : 'Not yet'
      : pct === 100
        ? 'Perfect lesson'
        : pct >= 80
          ? 'Lesson complete'
          : 'Good practice';
  const subline = round
    ? `${round.detail}${round.passed && round.firstPass ? ' The path moves on.' : ''}`
    : drill && spec
      ? drill.passed
        ? `${drill.right} of ${drill.total} right in ${clock(drill.ms)}. ${drill.firstPass ? 'The path moves on.' : `Best time: ${clock(drill.bestMs ?? drill.ms)}.`}`
        : `${drill.right} of ${drill.total} right in ${clock(drill.ms)}. To pass: ${spec.passRight} right in under ${clock(spec.targetSec * 1000)}.`
      : test?.categoryId === PHASE3
        ? test.passed
          ? 'Phase 3 is open. Its first unit is now your pick, so your next lesson starts the strategies.'
          : `You need ${Math.ceil(PHASE3_TEST_SIZE * 0.8)} of ${PHASE3_TEST_SIZE} to open phase 3. You can try again tomorrow.`
      : test
        ? test.passed
          ? `${area}: advanced units are open.`
          : `You need 80% to open ${area}. You can try again tomorrow.`
        : summary.kind === 'review'
          ? 'Reviews cleared.'
          : summary.kind === 'practice'
            ? 'Practice only, so your review schedule is unchanged.'
            : `${summary.newIds.length} new term${summary.newIds.length === 1 ? '' : 's'} learned.`;
  const good = round ? round.passed : drill ? drill.passed : pct >= 80;
  const practiceId = drill?.unitId ?? round?.unitId;
  const scoreLabel = round?.score ?? (round?.kind === 'game' ? { label: 'checks met', short: 'Checks' } : { label: 'best calls', short: 'Calls' });
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl animate-pop flex-col px-4 pb-8 pt-12">
      <div className="flex flex-col items-center text-center">
        <Ring value={pct} max={100} size={148} stroke={12} tone={good ? 'brand' : 'amber'} label={round ? `${summary.firstTryCorrect} of ${summary.firstTryTotal}` : test || drill ? `${pct}% right` : `${pct}% right first time`}>
          <div className="leading-none">
            <p className="num text-4xl font-extrabold text-ink">{round ? `${summary.firstTryCorrect}/${summary.firstTryTotal}` : `${pct}%`}</p>
            <p className="mt-1.5 text-xs font-bold text-ink-3">{round ? scoreLabel.label : test ? 'score' : drill ? 'right' : 'first try'}</p>
          </div>
        </Ring>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">
          {title}
          {name && good ? `, ${name}` : ''}
        </h1>
        {practiceId && <p className="mt-1 text-sm font-bold text-ink-3">{unitById.get(practiceId)?.name}</p>}
        <p className="mt-1 text-ink-2">{subline}</p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Stat icon={<Bolt className="h-4 w-4" />} tone="text-sky-ink bg-sky-soft" label="XP" value={`+${summary.xp}`} />
        {round ? (
          <Stat icon={<Flame className="h-4 w-4" />} tone="text-amber-ink bg-amber-soft" label={round.stat.label} value={round.stat.value} />
        ) : drill ? (
          <Stat icon={<Flame className="h-4 w-4" />} tone="text-amber-ink bg-amber-soft" label="Time" value={clock(drill.ms)} />
        ) : (
          <Stat icon={<Flame className="h-4 w-4" />} tone="text-amber-ink bg-amber-soft" label="Best run" value={String(summary.bestRun)} />
        )}
        <Stat icon={<Target className="h-4 w-4" />} tone="text-brand-ink bg-brand-soft" label={round ? scoreLabel.short : 'Right'} value={`${summary.firstTryCorrect}/${summary.firstTryTotal}`} />
      </div>

      {summary.newIds.length > 0 && (
        <Card className="mt-4">
          <p className="mb-3 text-sm font-extrabold text-ink">New terms</p>
          <Chips ids={summary.newIds} tone="bg-sky-soft text-sky-ink" />
          <p className="mt-3 text-sm text-ink-3">They come back for review tomorrow.</p>
        </Card>
      )}
      {test && test.credited > 0 && (
        <Card className="mt-4">
          <p className="text-sm font-extrabold text-ink">
            {test.credited} term{test.credited === 1 ? '' : 's'} counted as learned
          </p>
          <p className="mt-1 text-sm text-ink-3">You won't be taught these from scratch. Each comes back once for a quick check within the next 10 days.</p>
        </Card>
      )}
      {summary.missedIds.length > 0 && (
        <Card className="mt-4">
          <p className="mb-3 text-sm font-extrabold text-ink">{test ? 'Still to learn' : 'Terms to watch'}</p>
          <Chips ids={summary.missedIds} tone="bg-bad-soft text-bad-ink" />
          <p className="mt-3 text-sm text-ink-3">{test ? 'These stay on your path and are taught as usual.' : 'Missed terms come back sooner.'}</p>
        </Card>
      )}
      {drill && drill.missed.length > 0 && (
        <Card className="mt-4">
          <p className="mb-2 text-sm font-extrabold text-ink">Missed</p>
          <ul className="divide-y divide-line">
            {drill.missed.map((m, i) => (
              <li key={i} className="py-2 text-sm">
                <span className="text-ink-2">{m.prompt}</span>
                <span className="num mt-0.5 block font-bold text-ink">{m.shown}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {round?.notes.map((n) => (
        <Card key={n.title} className="mt-4">
          <p className="mb-2 text-sm font-extrabold text-ink">{n.title}</p>
          <ul className="divide-y divide-line">
            {n.items.map((m, i) => (
              <li key={i} className="py-2 text-sm">
                <span className="text-ink-2">{m.prompt}</span>
                <span className="num mt-0.5 block font-bold text-ink">{m.shown}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <div className="mt-auto space-y-3 pt-8">
        {canContinue && (
          <Button onClick={onNext} className="w-full text-base">
            {nextLabel}
          </Button>
        )}
        <Button variant={canContinue ? 'secondary' : 'primary'} onClick={onHome} className="w-full">
          Done
        </Button>
        {onSnooze && (
          <button type="button" onClick={onSnooze} className="w-full py-2 text-sm font-extrabold text-ink-3 hover:text-ink-2">
            Skip this {round ? (round.kind === 'game' ? 'game' : 'case') : 'drill'} until tomorrow
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, tone, label, value }: { icon: ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center shadow-card">
      <span className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <p className="num text-xl font-extrabold text-ink">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
    </div>
  );
}

function Chips({ ids, tone }: { ids: string[]; tone: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <span key={id} className={`rounded-full px-3 py-1 text-sm font-bold ${tone}`}>
          {termName(id)}
        </span>
      ))}
    </div>
  );
}
