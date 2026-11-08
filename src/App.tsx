import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Careers } from './components/Careers';
import { DeskCase } from './components/DeskCase';
import { Drill } from './components/Drill';
import { Glossary } from './components/Glossary';
import { Home } from './components/Home';
import { Lesson, type LessonSummary } from './components/Lesson';
import { MarketGame } from './components/MarketGame';
import { Results } from './components/Results';
import { Settings } from './components/Settings';
import { BookIcon, GearIcon, PathIcon } from './components/icons';
import { buildPractice, buildTest, withFocus } from './lib/choose';
import { snoozeDrill } from './lib/drills';
import { practiceKind } from './lib/content';
import { dayKey } from './lib/dates';
import { buildLesson, drillUp, todayStatus, type LessonPlan } from './lib/lesson';
import { seededRng } from './lib/questions';
import { KIND_LABEL } from './lib/practice';
import { loadProgress, requestPersistence, saveProgress } from './lib/storage';
import { currentUnit } from './lib/track';
import type { Progress } from './lib/types';

type Tab = 'home' | 'glossary' | 'settings';

type Screen =
  | { name: Tab; sheet?: string }
  | { name: 'careers' }
  | { name: 'lesson'; plan: LessonPlan; seed: number }
  | { name: 'drill' | 'game' | 'case'; unitId: string; seed: number }
  | { name: 'results'; summary: LessonSummary };

function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export default function App() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [persisted, setPersisted] = useState(false);
  const [today, setToday] = useState(dayKey());
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    loadProgress().then(setProgress);
    requestPersistence().then(setPersisted);
    // Roll "today" over if the app stays open past midnight.
    const t = setInterval(() => setToday(dayKey()), 60_000);
    return () => clearInterval(t);
  }, []);

  const update = useCallback((p: Progress) => {
    setProgress(p);
    // Save after every change, one write at a time.
    saveChain.current = saveChain.current.then(() => saveProgress(p));
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  if (!progress) {
    return <div className="flex min-h-[100dvh] items-center justify-center text-ink-3">Loading…</div>;
  }

  const run = (make: (seed: number) => LessonPlan | null) => {
    const seed = Date.now() % 2_147_483_647;
    const plan = make(seed);
    if (plan) setScreen({ name: 'lesson', plan, seed });
  };
  // Drills, games and desk cases each have their own screen.
  const drill = (unitId: string) => setScreen({ name: practiceKind(unitId) ?? 'drill', unitId, seed: Date.now() % 2_147_483_647 });
  // One track: when the learner is on a drill, game or case, the next step is that unit.
  const start = (ignoreNewCap: boolean) => {
    const d = drillUp(progress, today);
    if (d) drill(d);
    else run((seed) => buildLesson(progress, today, seededRng(seed), ignoreNewCap));
  };
  const practise = (unitId: string) => run((seed) => buildPractice(progress, unitId, seededRng(seed)));
  const takeTest = (categoryId: string) => run((seed) => buildTest(categoryId, seededRng(seed)));
  const pick = (unitId: string | null) => update(withFocus(progress, unitId));

  switch (screen.name) {
    case 'lesson':
      return (
        <Lesson
          key={screen.seed}
          plan={screen.plan}
          progress={progress}
          today={today}
          rng={seededRng(screen.seed + 1)}
          onProgress={update}
          onFinish={(summary) => setScreen({ name: 'results', summary })}
          onQuit={() => setScreen({ name: 'home' })}
        />
      );
    case 'drill':
      return (
        <Drill
          key={screen.seed}
          unitId={screen.unitId}
          seed={screen.seed}
          progress={progress}
          today={today}
          onProgress={update}
          onFinish={(summary) => setScreen({ name: 'results', summary })}
          onQuit={() => setScreen({ name: 'home' })}
        />
      );
    case 'game':
    case 'case': {
      const Screen = screen.name === 'game' ? MarketGame : DeskCase;
      return (
        <Screen
          key={screen.seed}
          unitId={screen.unitId}
          seed={screen.seed}
          progress={progress}
          today={today}
          onProgress={update}
          onFinish={(summary) => setScreen({ name: 'results', summary })}
          onQuit={() => setScreen({ name: 'home' })}
        />
      );
    }
    case 'results': {
      const s = todayStatus(progress, today);
      const last = screen.summary.drill ?? screen.summary.round;
      const nextDrill = drillUp(progress, today);
      const stuck = last && !last.passed && currentUnit(progress, today) === last.unitId;
      return (
        <Results
          summary={screen.summary}
          canContinue={s.due > 0 || s.newLeft > 0 || !!s.drill}
          nextLabel={nextDrill && nextDrill === last?.unitId ? 'Try again' : nextDrill ? `Next: a ${KIND_LABEL[practiceKind(nextDrill) ?? 'drill']}` : 'Next lesson'}
          onHome={() => setScreen({ name: 'home' })}
          onNext={() => start(false)}
          onSnooze={
            stuck
              ? () => {
                  let p = snoozeDrill(progress, last.unitId, today);
                  if (p.focus === last.unitId) p = withFocus(p, null);
                  update(p);
                  setScreen({ name: 'home' });
                }
              : undefined
          }
        />
      );
    }
    case 'glossary':
      return (
        <WithTabs tab="glossary" onTab={(name) => setScreen({ name })}>
          <Glossary progress={progress} />
        </WithTabs>
      );
    case 'settings':
      return (
        <WithTabs tab="settings" onTab={(name) => setScreen({ name })}>
          <Settings progress={progress} today={today} persisted={persisted} onChange={update} />
        </WithTabs>
      );
    case 'careers':
      return (
        <WithTabs tab="home" onTab={(name) => setScreen({ name })}>
          <Careers progress={progress} onBack={() => setScreen({ name: 'home' })} onOpenUnit={(unitId) => setScreen({ name: 'home', sheet: unitId })} />
        </WithTabs>
      );
    default:
      return (
        <WithTabs tab="home" onTab={(name) => setScreen({ name })}>
          <Home
            progress={progress}
            today={today}
            onStart={start}
            onPractice={practise}
            onFocus={pick}
            onTest={takeTest}
            onDrill={drill}
            onOpenSettings={() => setScreen({ name: 'settings' })}
            onOpenCareers={() => setScreen({ name: 'careers' })}
            initialSheet={screen.name === 'home' ? screen.sheet : undefined}
            showInstallHint={isIosBrowser()}
          />
        </WithTabs>
      );
  }
}

const TABS: { id: Tab; label: string; icon: typeof PathIcon }[] = [
  { id: 'home', label: 'Learn', icon: PathIcon },
  { id: 'glossary', label: 'Glossary', icon: BookIcon },
  { id: 'settings', label: 'Settings', icon: GearIcon },
];

function WithTabs({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode }) {
  return (
    <>
      {children}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pt-2 backdrop-blur-md" aria-label="Main">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1 text-[11px] font-extrabold tracking-wide transition ${active ? 'text-brand-ink' : 'text-ink-3 hover:text-ink-2'}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${active ? 'bg-brand-soft' : ''}`}>
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
