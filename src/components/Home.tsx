import { categories, coreTermIds, path } from '../lib/content';
import { addDays, daysBetween } from '../lib/dates';
import { todayStatus } from '../lib/lesson';
import { currentStreak, dayStats, isKnown } from '../lib/scheduler';
import type { Progress } from '../lib/types';
import { Bolt, Check, Flame, Logo } from './icons';
import { Bar, Button, Card, Pill, Ring, SectionTitle } from './ui';

interface Props {
  progress: Progress;
  today: string;
  onStart: (ignoreNewCap: boolean) => void;
  onOpenSettings: () => void;
  showInstallHint: boolean;
}

const TOTAL_CATEGORIES = 17;

export function Home({ progress, today, onStart, onOpenSettings, showInstallHint }: Props) {
  const status = todayStatus(progress, today);
  const streak = currentStreak(progress, today);
  const todayStats = dayStats(progress, today);
  const goal = progress.settings.newPerDay;
  const hasWork = status.due > 0 || status.newLeft > 0;
  const metCount = Object.keys(progress.terms).length;
  const backupDue = metCount >= 20 && (!progress.lastBackup || daysBetween(progress.lastBackup, today) >= 7);
  const practisedToday = todayStats.lessons > 0;

  const headline = !hasWork
    ? status.newAvailable === 0
      ? 'Every term met'
      : 'Daily goal done'
    : practisedToday
      ? 'Keep it going'
      : 'Ready for today?';
  const subline = !hasWork
    ? status.newAvailable === 0
      ? 'Reviews will come back on schedule.'
      : 'Nice work. Come back tomorrow, or learn a few more.'
    : [status.due ? `${status.due} review${status.due === 1 ? '' : 's'} due` : null, status.newLeft ? `${status.newLeft} new term${status.newLeft === 1 ? '' : 's'} left` : null]
        .filter(Boolean)
        .join(' · ') + (status.slowed ? '. New terms slow down until reviews catch up.' : '');

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-32 pt-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-xl font-extrabold tracking-tight text-ink">FinTermShip</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`num inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold ${practisedToday ? 'bg-amber-soft text-amber-ink' : 'bg-sunken text-ink-3'}`}
            title="Days in a row"
            aria-label={`${streak} day streak`}
          >
            <Flame className="h-4 w-4" />
            {streak}
          </span>
          <span className="num inline-flex items-center gap-1 rounded-full bg-sky-soft px-3 py-1.5 text-sm font-extrabold text-sky-ink" aria-label={`${progress.xp} XP`}>
            <Bolt className="h-4 w-4" />
            {progress.xp}
          </span>
        </div>
      </header>

      {showInstallHint && (
        <div className="rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm leading-relaxed text-amber-ink">
          On iPhone, tap Share, then <b>Add to Home Screen</b>. Safari can clear a website's saved progress after 7 days unused; the home screen app keeps it.
        </div>
      )}

      <Card className="space-y-5">
        <div className="flex items-center gap-5">
          <Ring value={todayStats.newTerms} max={goal} size={92} stroke={9} label={`${todayStats.newTerms} of ${goal} new terms today`}>
            <div className="text-center leading-none">
              <p className="num text-2xl font-extrabold text-ink">{todayStats.newTerms}</p>
              <p className="mt-1 text-[11px] font-bold text-ink-3">of {goal} new</p>
            </div>
          </Ring>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Today</p>
            <p className="mt-1 text-xl font-extrabold text-ink">{headline}</p>
            <p className="mt-1 text-sm leading-snug text-ink-2">{subline}</p>
          </div>
        </div>

        <WeekStrip progress={progress} today={today} />

        {hasWork ? (
          <Button onClick={() => onStart(false)} className="w-full text-base">
            {practisedToday ? 'Continue' : 'Start lesson'}
          </Button>
        ) : (
          status.newAvailable > 0 && (
            <Button variant="secondary" onClick={() => onStart(true)} className="w-full">
              Learn 4 more terms
            </Button>
          )
        )}
      </Card>

      <LearningPath progress={progress} />

      {backupDue && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          <span className="flex-1">Progress lives on this device only. Save a backup once a week to be safe.</span>
          <button className="shrink-0 font-extrabold text-brand-ink" onClick={onOpenSettings}>
            Back up
          </button>
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-3">
        {categories.length} of {TOTAL_CATEGORIES} categories are ready. A term counts as known once it reaches step 4 of 6 on the review ladder.
      </p>
    </div>
  );
}

function WeekStrip({ progress, today }: { progress: Progress; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <div className="flex justify-between rounded-2xl bg-sunken px-3 py-2.5">
      {days.map((d) => {
        const done = (progress.days[d]?.lessons ?? 0) > 0;
        const [y, m, dd] = d.split('-').map(Number);
        const letter = new Date(y, m - 1, dd).toLocaleDateString('en-IN', { weekday: 'narrow' });
        const isToday = d === today;
        return (
          <div key={d} className="flex flex-col items-center gap-1.5">
            <span className={`text-[11px] font-bold ${isToday ? 'text-ink' : 'text-ink-3'}`}>{letter}</span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${done ? 'bg-amber text-white' : isToday ? 'border-2 border-dashed border-amber/60' : 'bg-line/70'}`}
              aria-label={`${d}${done ? ', practised' : ''}`}
            >
              {done && <Flame className="h-3.5 w-3.5" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LearningPath({ progress }: { progress: Progress }) {
  const coreMet = coreTermIds.filter((id) => progress.terms[id]).length;
  const rows = path.map((p) => {
    const met = p.terms.filter((t) => progress.terms[t.id]).length;
    const known = p.terms.filter((t) => isKnown(progress.terms[t.id])).length;
    return { ...p, met, known, total: p.terms.length };
  });
  const currentIdx = rows.findIndex((r) => r.met < r.total);

  return (
    <div className="space-y-6">
      {([1, 2] as const).map((pass) => {
        const passRows = rows.map((r, i) => ({ ...r, i })).filter((r) => r.pass === pass);
        const met = passRows.reduce((n, r) => n + r.met, 0);
        const total = passRows.reduce((n, r) => n + r.total, 0);
        return (
          <section key={pass}>
            <SectionTitle aside={`${pass === 1 ? coreMet : met} of ${total} met`}>{pass === 1 ? 'Pass 1 · Core sweep' : 'Pass 2 · Go deeper'}</SectionTitle>
            <p className="-mt-1 mb-3 px-1 text-sm text-ink-2">
              {pass === 1 ? 'The most common terms from every area, first.' : 'Each area in depth, including higher-order Greeks and research statistics.'}
            </p>
            {pass === 1 && <Bar value={coreMet} max={total} className="mb-4 h-1.5" label="Core sweep progress" />}
            <ol className="relative">
              {passRows.map((r, n) => {
                const complete = r.met === r.total;
                const current = r.i === currentIdx;
                return (
                  <li key={r.unit.id} className="relative flex gap-4 pb-3">
                    {n < passRows.length - 1 && (
                      <span className={`absolute left-[23px] top-12 h-[calc(100%-36px)] w-0.5 ${complete ? 'bg-brand/40' : 'bg-line'}`} aria-hidden="true" />
                    )}
                    <div className="relative z-10">
                      {complete ? (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-press">
                          <Check className="h-6 w-6" />
                        </span>
                      ) : (
                        <Ring value={r.met} max={r.total} size={48} stroke={5} tone={current ? 'brand' : 'sky'}>
                          <span className={`num text-sm font-extrabold ${current ? 'text-brand-ink' : r.met ? 'text-ink-2' : 'text-ink-3'}`}>{r.i + 1}</span>
                        </Ring>
                      )}
                    </div>
                    <div
                      className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 ${current ? 'border-brand/50 bg-brand-soft/50' : 'border-line bg-surface'}`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-bold text-ink">{r.unit.name}</p>
                        {current && <Pill tone="brand">Up next</Pill>}
                      </div>
                      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-3">
                        <span className="truncate">{r.category.name}</span>
                        <span className="num shrink-0 font-semibold">
                          {r.met}/{r.total} met{r.known ? ` · ${r.known} known` : ''}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
