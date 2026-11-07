import type { ReactNode } from 'react';
import { categories, termName } from '../lib/content';
import { Bolt, Flame, Target } from './icons';
import type { LessonSummary } from './Lesson';
import { Button, Card, Ring } from './ui';

export function Results({ summary, canContinue, onHome, onNext }: { summary: LessonSummary; canContinue: boolean; onHome: () => void; onNext: () => void }) {
  const pct = summary.firstTryTotal ? Math.round((summary.firstTryCorrect / summary.firstTryTotal) * 100) : 100;
  const test = summary.test;
  const area = test ? categories.find((c) => c.id === test.categoryId)?.name ?? 'this area' : '';
  const title = test ? (test.passed ? 'Test passed' : 'Not yet') : pct === 100 ? 'Perfect lesson' : pct >= 80 ? 'Lesson complete' : 'Good practice';
  const subline = test
    ? test.passed
      ? `${area}: advanced units are open.`
      : `You need 80% to open ${area}. You can try again tomorrow.`
    : summary.kind === 'review'
      ? 'Reviews cleared.'
      : summary.kind === 'practice'
        ? 'Practice only, so your review schedule is unchanged.'
        : `${summary.newIds.length} new term${summary.newIds.length === 1 ? '' : 's'} learned.`;
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl animate-pop flex-col px-4 pb-8 pt-12">
      <div className="flex flex-col items-center text-center">
        <Ring value={pct} max={100} size={148} stroke={12} tone={pct >= 80 ? 'brand' : 'amber'} label={test ? `${pct}% right` : `${pct}% right first time`}>
          <div className="leading-none">
            <p className="num text-4xl font-extrabold text-ink">{pct}%</p>
            <p className="mt-1.5 text-xs font-bold text-ink-3">{test ? 'score' : 'first try'}</p>
          </div>
        </Ring>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-ink-2">{subline}</p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Stat icon={<Bolt className="h-4 w-4" />} tone="text-sky-ink bg-sky-soft" label="XP" value={`+${summary.xp}`} />
        <Stat icon={<Flame className="h-4 w-4" />} tone="text-amber-ink bg-amber-soft" label="Best run" value={String(summary.bestRun)} />
        <Stat icon={<Target className="h-4 w-4" />} tone="text-brand-ink bg-brand-soft" label="Right" value={`${summary.firstTryCorrect}/${summary.firstTryTotal}`} />
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

      <div className="mt-auto space-y-3 pt-8">
        {canContinue && (
          <Button onClick={onNext} className="w-full text-base">
            Next lesson
          </Button>
        )}
        <Button variant={canContinue ? 'secondary' : 'primary'} onClick={onHome} className="w-full">
          Done
        </Button>
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
