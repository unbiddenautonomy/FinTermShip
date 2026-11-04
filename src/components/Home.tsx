import { categories, coreTermIds, path } from '../lib/content';
import { todayStatus } from '../lib/lesson';
import { currentStreak, dayStats, isKnown } from '../lib/scheduler';
import { daysBetween } from '../lib/dates';
import type { Progress } from '../lib/types';
import { Bar, Button, Card } from './ui';

interface Props {
  progress: Progress;
  today: string;
  onStart: (ignoreNewCap: boolean) => void;
  onOpen: (screen: 'glossary' | 'settings') => void;
  showInstallHint: boolean;
}

export function Home({ progress, today, onStart, onOpen, showInstallHint }: Props) {
  const status = todayStatus(progress, today);
  const streak = currentStreak(progress, today);
  const todayStats = dayStats(progress, today);
  const coreMet = coreTermIds.filter((id) => progress.terms[id]).length;
  const sweepDone = coreMet === coreTermIds.length;
  const hasWork = status.due > 0 || status.newLeft > 0;
  const metCount = Object.keys(progress.terms).length;
  const backupDue =
    metCount >= 20 && (!progress.lastBackup || daysBetween(progress.lastBackup, today) >= 7);

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-brand-600 dark:text-brand-400">FinTermShip</h1>
        <div className="flex items-center gap-4 text-sm font-bold">
          <span className="text-amber-600 dark:text-amber-400" title="Days in a row">
            {streak} day streak
          </span>
          <span className="text-sky-600 dark:text-sky-400">{progress.xp} XP</span>
        </div>
      </header>

      {showInstallHint && (
        <Card className="border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          On iPhone, tap Share, then <b>Add to Home Screen</b>. Safari can clear a website's saved progress after 7 days unused; the home screen app keeps it.
        </Card>
      )}

      <Card>
        <p className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Today</p>
        <div className="mt-2 flex gap-6 text-slate-800 dark:text-slate-100">
          <div>
            <p className="text-3xl font-black">{status.due}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">reviews due</p>
          </div>
          <div>
            <p className="text-3xl font-black">{status.newLeft}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">new terms left</p>
          </div>
          <div>
            <p className="text-3xl font-black">{todayStats.lessons}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">lessons done</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {hasWork ? (
            <Button onClick={() => onStart(false)} className="w-full text-lg">
              {todayStats.lessons ? 'Continue today’s session' : 'Start today’s session'}
            </Button>
          ) : (
            <>
              <p className="rounded-2xl bg-brand-50 p-3 text-center font-semibold text-brand-700 dark:bg-[#05291a] dark:text-brand-400">
                {status.newAvailable === 0 ? 'You have met every term so far. Reviews will come back on schedule.' : 'Daily goal done. Nice work.'}
              </p>
              {status.newAvailable > 0 && (
                <Button variant="secondary" onClick={() => onStart(true)} className="w-full">
                  Learn 4 more terms
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-2">
          <p className="font-bold text-slate-800 dark:text-slate-100">{sweepDone ? 'Core sweep complete' : 'Pass 1: core sweep'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {coreMet} of {coreTermIds.length} common terms met
          </p>
        </div>
        <Bar value={coreMet} max={coreTermIds.length} />
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {sweepDone
            ? 'Pass 2 now goes deeper, category by category.'
            : 'Meet the common terms of every area first, then go deeper.'}
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your path</h2>
        {[1, 2].map((pass) => (
          <div key={pass} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{pass === 1 ? 'Pass 1 · core' : 'Pass 2 · deeper'}</p>
            {path
              .filter((p) => p.pass === pass)
              .map((p) => {
                const met = p.terms.filter((t) => progress.terms[t.id]).length;
                const known = p.terms.filter((t) => isKnown(progress.terms[t.id])).length;
                const complete = met === p.terms.length;
                return (
                  <div
                    key={p.unit.id}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${complete ? 'border-brand-200 bg-brand-50/60 dark:border-brand-700/50 dark:bg-[#05291a]/60' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{p.unit.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{p.category.name}</p>
                    </div>
                    <div className="w-28 shrink-0">
                      <Bar value={met} max={p.terms.length} className="h-2" />
                      <p className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">
                        {met}/{p.terms.length} met · {known} known
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {categories.length} of 16 categories are in this first version. "Known" means a term has climbed to step 4 of 6 on the review ladder.
        </p>
      </section>

      {backupDue && (
        <Card className="text-sm text-slate-700 dark:text-slate-200">
          Your progress is saved on this device only. <button className="font-bold text-brand-600 underline dark:text-brand-400" onClick={() => onOpen('settings')}>Save a backup file</button> once a week to be safe.
        </Card>
      )}

      <nav className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => onOpen('glossary')}>
          Glossary
        </Button>
        <Button variant="secondary" onClick={() => onOpen('settings')}>
          Settings
        </Button>
      </nav>
    </div>
  );
}
