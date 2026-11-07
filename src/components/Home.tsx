import { useEffect, useState } from 'react';
import { areaCoreTermIds, canTakeTest, focusQueue, unitOpen } from '../lib/choose';
import { categories, coreTermIds, path, pathTermIds } from '../lib/content';
import { addDays, daysBetween } from '../lib/dates';
import { todayStatus } from '../lib/lesson';
import { currentStreak, dayStats, isKnown } from '../lib/scheduler';
import type { Progress } from '../lib/types';
import { Bolt, Check, Cross, Flame, Lock, Logo } from './icons';
import { Bar, Button, Card, Pill, Ring, SectionTitle, StepDots } from './ui';

interface Props {
  progress: Progress;
  today: string;
  onStart: (ignoreNewCap: boolean) => void;
  onPractice: (unitId: string) => void;
  onFocus: (unitId: string | null) => void;
  onTest: (categoryId: string) => void;
  onOpenSettings: () => void;
  showInstallHint: boolean;
}

type Row = (typeof path)[number] & { i: number; met: number; known: number; total: number; open: boolean };

const TOTAL_CATEGORIES = 17;

export function Home({ progress, today, onStart, onPractice, onFocus, onTest, onOpenSettings, showInstallHint }: Props) {
  const [sheet, setSheet] = useState<string | null>(null);
  const picked = focusQueue(progress).length > 0 ? path.find((r) => r.unit.id === progress.focus) : undefined;
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
            {picked && hasWork && (
              <p className="mt-1.5 text-sm font-semibold leading-snug text-brand-ink">New terms come from your pick: {picked.unit.name}.</p>
            )}
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

      <LearningPath progress={progress} onOpen={setSheet} />

      {sheet && (
        <UnitSheet
          unitId={sheet}
          progress={progress}
          today={today}
          onClose={() => setSheet(null)}
          onPractice={() => onPractice(sheet)}
          onFocus={(id) => {
            onFocus(id);
            setSheet(null);
            // Bring the Today card into view: it now says where new terms come from.
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onTest={onTest}
        />
      )}

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

function pathRows(progress: Progress): Row[] {
  return path.map((r, i) => {
    const met = r.terms.filter((t) => progress.terms[t.id]).length;
    const known = r.terms.filter((t) => isKnown(progress.terms[t.id])).length;
    return { ...r, i, met, known, total: r.terms.length, open: unitOpen(progress, r.unit.id) };
  });
}

/** The unit new terms come from next: the learner's pick, or the first unfinished unit. */
function currentIndex(progress: Progress, rows: Row[]): number {
  if (progress.focus && focusQueue(progress).length > 0) return rows.findIndex((r) => r.unit.id === progress.focus);
  return rows.findIndex((r) => r.met < r.total);
}

function LearningPath({ progress, onOpen }: { progress: Progress; onOpen: (unitId: string) => void }) {
  const [full, setFull] = useState(false);
  const rows = pathRows(progress);
  const currentIdx = currentIndex(progress, rows);
  const picked = currentIdx >= 0 && rows[currentIdx].unit.id === progress.focus;
  const done = rows.filter((r) => r.met === r.total).length;
  const metTotal = pathTermIds.filter((id) => progress.terms[id]).length;
  const coreMet = coreTermIds.filter((id) => progress.terms[id]).length;

  if (!full) {
    const shown = [rows[currentIdx], ...rows.filter((r) => r.met < r.total && r.i !== currentIdx).slice(0, 2)].filter(Boolean);
    return (
      <section>
        <SectionTitle aside={`${metTotal} of ${pathTermIds.length} terms met`}>Your path</SectionTitle>
        <p className="-mt-1 mb-3 px-1 text-sm text-ink-2">
          {done > 0 ? `${done} of ${rows.length} units done. ` : ''}Tap a unit to see its terms, practise it, or learn it next.
        </p>
        <ol>
          {shown.map((r, n) => (
            <PathRow key={r.unit.id} r={r} current={r.i === currentIdx} picked={picked && r.i === currentIdx} last={n === shown.length - 1} onOpen={onOpen} />
          ))}
        </ol>
        <Button variant="secondary" className="mt-1 w-full" onClick={() => setFull(true)}>
          See full path ({rows.length} units)
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {([1, 2] as const).map((pass) => {
        const passRows = rows.filter((r) => r.pass === pass);
        const met = passRows.reduce((n, r) => n + r.met, 0);
        const total = passRows.reduce((n, r) => n + r.total, 0);
        return (
          <section key={pass}>
            <SectionTitle aside={`${pass === 1 ? coreMet : met} of ${total} met`}>{pass === 1 ? 'Pass 1 · Core sweep' : 'Pass 2 · Go deeper'}</SectionTitle>
            <p className="-mt-1 mb-3 px-1 text-sm text-ink-2">
              {pass === 1
                ? 'The most common terms from every area, first.'
                : "Each area in depth. An area's advanced units open once you've learned its core terms, or passed its test."}
            </p>
            {pass === 1 && <Bar value={coreMet} max={total} className="mb-4 h-1.5" label="Core sweep progress" />}
            <ol>
              {passRows.map((r, n) => (
                <PathRow key={r.unit.id} r={r} current={r.i === currentIdx} picked={picked && r.i === currentIdx} last={n === passRows.length - 1} onOpen={onOpen} />
              ))}
            </ol>
          </section>
        );
      })}
      <Button variant="secondary" className="w-full" onClick={() => setFull(false)}>
        Show less
      </Button>
    </div>
  );
}

function PathRow({ r, current, picked, last, onOpen }: { r: Row; current: boolean; picked: boolean; last: boolean; onOpen: (unitId: string) => void }) {
  const complete = r.met === r.total;
  return (
    <li className="relative flex gap-4 pb-3">
      {!last && <span className={`absolute left-[23px] top-12 h-[calc(100%-36px)] w-0.5 ${complete ? 'bg-brand/40' : 'bg-line'}`} aria-hidden="true" />}
      <div className="relative z-10">
        {complete ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-press">
            <Check className="h-6 w-6" />
          </span>
        ) : !r.open ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-line bg-sunken text-ink-3">
            <Lock className="h-5 w-5" />
          </span>
        ) : (
          <Ring value={r.met} max={r.total} size={48} stroke={5} tone={current ? 'brand' : 'sky'}>
            <span className={`num text-sm font-extrabold ${current ? 'text-brand-ink' : r.met ? 'text-ink-2' : 'text-ink-3'}`}>{r.i + 1}</span>
          </Ring>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpen(r.unit.id)}
        aria-label={`${r.unit.name}, ${r.category.name}: ${r.met} of ${r.total} met${r.open ? '' : ', locked'}`}
        className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-left transition hover:border-brand/50 active:scale-[0.99] ${current ? 'border-brand/50 bg-brand-soft/50' : 'border-line bg-surface'}`}
      >
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate font-bold ${r.open ? 'text-ink' : 'text-ink-2'}`}>{r.unit.name}</span>
          {current && <Pill tone="brand">{picked ? 'Your pick' : 'Up next'}</Pill>}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-3">
          <span className="truncate">{r.category.name}</span>
          <span className="num shrink-0 font-semibold">
            {r.met}/{r.total} met{r.known ? ` · ${r.known} known` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

function UnitSheet({
  unitId,
  progress,
  today,
  onClose,
  onPractice,
  onFocus,
  onTest,
}: {
  unitId: string;
  progress: Progress;
  today: string;
  onClose: () => void;
  onPractice: () => void;
  onFocus: (unitId: string | null) => void;
  onTest: (categoryId: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = pathRows(progress);
  const r = rows.find((x) => x.unit.id === unitId);
  if (!r) return null;
  const area = r.category;
  const isCurrent = currentIndex(progress, rows) === r.i;
  const picked = progress.focus === unitId && focusQueue(progress).length > 0;
  const unmetHere = r.total - r.met;
  const before = Math.max(0, focusQueue(progress, unitId).length - unmetHere);
  const coreCount = areaCoreTermIds(area.id).length;
  const attempt = progress.tests?.[area.id];
  const testReady = canTakeTest(progress, area.id, today);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-title"
        onClick={(e) => e.stopPropagation()}
        className="pb-safe flex max-h-[88dvh] w-full max-w-xl animate-sheet flex-col rounded-t-3xl bg-surface shadow-sheet sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">
              {area.name} · {r.unit.core ? 'Core' : 'Advanced'}
            </p>
            <h2 id="unit-title" className="mt-1 text-xl font-extrabold text-ink">
              {r.unit.name}
            </h2>
            <p className="num mt-0.5 text-sm text-ink-3">
              {r.met}/{r.total} met{r.known ? ` · ${r.known} known` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2" aria-label="Close">
            <Cross className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5">
          {!r.open && (
            <div className="rounded-2xl border border-line bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-2">
              <p className="flex items-center gap-2 font-extrabold text-ink">
                <Lock className="h-4 w-4" /> Locked
              </p>
              <p className="mt-1">
                {area.name} advanced units open once you've learned its {coreCount} core terms, or when you pass the {area.name} test.
              </p>
              {attempt && !attempt.passed && (
                <p className="mt-1">
                  Last test: {attempt.right} of {attempt.total} right.{attempt.date === today ? ' You can try again tomorrow.' : ''}
                </p>
              )}
            </div>
          )}
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {r.terms.map((t) => {
              const s = progress.terms[t.id];
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{t.term}</span>
                    <span className="block truncate text-xs text-ink-3">{t.short}</span>
                  </span>
                  {s ? <StepDots step={s.step} /> : <span className="text-xs font-semibold text-ink-3">Not met</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2.5 px-5 pb-5 pt-4 empty:hidden">
          {!r.open && testReady && (
            <Button className="w-full" onClick={() => onTest(area.id)}>
              Take the {area.name} test ({coreCount} questions)
            </Button>
          )}
          {r.open && unmetHere > 0 && !isCurrent && (
            <>
              <Button className="w-full" onClick={() => onFocus(unitId)}>
                Learn this next
              </Button>
              {before > 0 && (
                <p className="px-1 text-center text-xs text-ink-3">
                  Starts with {before} earlier {area.name} term{before === 1 ? '' : 's'} it builds on.
                </p>
              )}
            </>
          )}
          {r.open && unmetHere > 0 && isCurrent && !picked && <p className="px-1 text-center text-sm text-ink-2">This is next on your path.</p>}
          {r.met >= 2 && (
            <Button variant={r.open && unmetHere > 0 && !isCurrent ? 'secondary' : 'primary'} className="w-full" onClick={onPractice}>
              Practise these ({Math.min(r.met, 8)} terms)
            </Button>
          )}
          {picked && (
            <Button variant="secondary" className="w-full" onClick={() => onFocus(null)}>
              Back to the usual order
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
