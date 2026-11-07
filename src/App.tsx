import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Glossary } from './components/Glossary';
import { Home } from './components/Home';
import { Lesson, type LessonSummary } from './components/Lesson';
import { Results } from './components/Results';
import { Settings } from './components/Settings';
import { BookIcon, GearIcon, PathIcon } from './components/icons';
import { buildPractice, buildTest, withFocus } from './lib/choose';
import { dayKey } from './lib/dates';
import { buildLesson, todayStatus, type LessonPlan } from './lib/lesson';
import { seededRng } from './lib/questions';
import { loadProgress, requestPersistence, saveProgress } from './lib/storage';
import type { Progress } from './lib/types';

type Tab = 'home' | 'glossary' | 'settings';

type Screen =
  | { name: Tab }
  | { name: 'lesson'; plan: LessonPlan; seed: number }
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
  const start = (ignoreNewCap: boolean) => run((seed) => buildLesson(progress, today, seededRng(seed), ignoreNewCap));
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
    case 'results': {
      const s = todayStatus(progress, today);
      return (
        <Results
          summary={screen.summary}
          canContinue={s.due > 0 || s.newLeft > 0}
          onHome={() => setScreen({ name: 'home' })}
          onNext={() => start(false)}
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
            onOpenSettings={() => setScreen({ name: 'settings' })}
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
