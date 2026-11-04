import { useCallback, useEffect, useRef, useState } from 'react';
import { Glossary } from './components/Glossary';
import { Home } from './components/Home';
import { Lesson, type LessonSummary } from './components/Lesson';
import { Results } from './components/Results';
import { Settings } from './components/Settings';
import { dayKey } from './lib/dates';
import { buildLesson, todayStatus, type LessonPlan } from './lib/lesson';
import { seededRng } from './lib/questions';
import { loadProgress, requestPersistence, saveProgress } from './lib/storage';
import type { Progress } from './lib/types';

type Screen =
  | { name: 'home' }
  | { name: 'lesson'; plan: LessonPlan; seed: number }
  | { name: 'results'; summary: LessonSummary }
  | { name: 'glossary' }
  | { name: 'settings' };

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
    return <div className="flex min-h-[100dvh] items-center justify-center text-slate-400">Loading…</div>;
  }

  const start = (ignoreNewCap: boolean) => {
    const seed = Date.now() % 2_147_483_647;
    const plan = buildLesson(progress, today, seededRng(seed), ignoreNewCap);
    if (plan) setScreen({ name: 'lesson', plan, seed });
  };

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
      return <Glossary progress={progress} onBack={() => setScreen({ name: 'home' })} />;
    case 'settings':
      return <Settings progress={progress} today={today} persisted={persisted} onChange={update} onBack={() => setScreen({ name: 'home' })} />;
    default:
      return (
        <Home
          progress={progress}
          today={today}
          onStart={start}
          onOpen={(name) => setScreen(name === 'glossary' ? { name: 'glossary' } : { name: 'settings' })}
          showInstallHint={isIosBrowser()}
        />
      );
  }
}
