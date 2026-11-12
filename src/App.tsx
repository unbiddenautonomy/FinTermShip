import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Careers } from './components/Careers';
import { MockRound } from './components/MockRound';
import { ProjectScreen } from './components/Project';
import { DeskCase } from './components/DeskCase';
import { Drill } from './components/Drill';
import { Glossary } from './components/Glossary';
import { Guide, type GuideEntry } from './components/Guide';
import { Home } from './components/Home';
import { Lesson, type LessonSummary } from './components/Lesson';
import { FermiGame } from './components/FermiGame';
import { MeetingGame } from './components/MeetingGame';
import { GreeksGame } from './components/GreeksGame';
import { GuessGame } from './components/GuessGame';
import { KellyGame } from './components/KellyGame';
import { BacktestGame } from './components/BacktestGame';
import { SignalGame } from './components/SignalGame';
import { PairsGame } from './components/PairsGame';
import { ExpiryGame } from './components/ExpiryGame';
import { RiskGame } from './components/RiskGame';
import { VwapGame } from './components/VwapGame';
import { ReadBookGame } from './components/ReadBookGame';
import { CodeGame } from './components/CodeGame';
import { MarketGame } from './components/MarketGame';
import { PayoffGame } from './components/PayoffGame';
import { Results } from './components/Results';
import { Settings } from './components/Settings';
import { useAccount } from './components/useAccount';
import { useGameKeys, useSlashKey } from './components/useKeys';
import { BookIcon, ChatIcon, GearIcon, Logo, PathIcon } from './components/icons';
import { buildPractice, buildTest, withFocus } from './lib/choose';
import { snoozeDrill } from './lib/drills';
import { practiceKind } from './lib/content';
import { gameOf } from './lib/games';
import { buildPhase3Test, PHASE3, withPhase3Key } from './lib/phase3';
import { dayKey } from './lib/dates';
import { buildLesson, drillUp, todayStatus, type LessonPlan } from './lib/lesson';
import { seededRng } from './lib/questions';
import { KIND_LABEL } from './lib/practice';
import { loadProgress, requestPersistence, saveProgress } from './lib/storage';
import { firstName } from './lib/profile';
import { buildWeakSpots, weakSpots } from './lib/weak';
import { currentUnit } from './lib/track';
import type { GameId, Progress } from './lib/types';

type Tab = 'home' | 'guide' | 'glossary' | 'settings';

const GAME_SCREENS: Record<GameId, typeof MarketGame> = {
  market: MarketGame,
  payoff: PayoffGame,
  greeks: GreeksGame,
  kelly: KellyGame,
  guess: GuessGame,
  fermi: FermiGame,
  meeting: MeetingGame,
  backtest: BacktestGame,
  signal: SignalGame,
  pairs: PairsGame,
  expiry: ExpiryGame,
  risk: RiskGame,
  vwap: VwapGame,
  readbook: ReadBookGame,
  code: CodeGame,
};

type Screen =
  | { name: Tab; sheet?: string; q?: string }
  | { name: 'careers' }
  | { name: 'project'; projectId: string }
  | { name: 'mock'; round: string }
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
  // The guide's conversation lasts while the app is open, across tabs.
  const [guideLog, setGuideLog] = useState<GuideEntry[]>([]);
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

  const { account, setAccount, sync, syncNow, signedOut } = useAccount(progress, update);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  // Keyboard: 1 to 9 answer and Enter goes on, in games, cases and mocks; "/" searches the glossary.
  useGameKeys(['game', 'case', 'mock', 'results'].includes(screen.name));
  const tabScreen = (TABS as { id: string }[]).some((t) => t.id === screen.name) || screen.name === 'careers' || screen.name === 'project';
  const toSearch = useCallback(() => {
    if (!tabScreen) return;
    setScreen((s) => (s.name === 'glossary' ? s : { name: 'glossary' }));
    requestAnimationFrame(() => document.getElementById('glossary-search')?.focus());
  }, [tabScreen]);
  useSlashKey(toSearch);

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
  const practiseWeak = () => run((seed) => buildWeakSpots(progress, seededRng(seed)));
  const practise = (unitId: string) => run((seed) => buildPractice(progress, unitId, seededRng(seed)));
  const takeTest = (categoryId: string) => run((seed) => (categoryId === PHASE3 ? buildPhase3Test(seededRng(seed)) : buildTest(categoryId, seededRng(seed))));
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
      const Screen = screen.name === 'game' ? GAME_SCREENS[gameOf(screen.unitId) ?? 'market'] : DeskCase;
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
          name={firstName(progress)}
          weakLeft={weakSpots(progress).length}
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
          <Glossary progress={progress} initialQuery={screen.q} />
        </WithTabs>
      );
    case 'guide':
      return (
        <WithTabs tab="guide" onTab={(name) => setScreen({ name })}>
          <Guide
            progress={progress}
            today={today}
            log={guideLog}
            onLog={setGuideLog}
            onOpenUnit={(unitId) => setScreen({ name: 'home', sheet: unitId })}
            onFocus={pick}
            onTest={takeTest}
            onStart={() => start(false)}
            onGo={(where, q) => setScreen(where === 'careers' ? { name: 'careers' } : where === 'glossary' ? { name: 'glossary', q } : { name: where })}
          />
        </WithTabs>
      );
    case 'settings':
      return (
        <WithTabs tab="settings" onTab={(name) => setScreen({ name })}>
          <Settings
            progress={progress}
            today={today}
            persisted={persisted}
            onChange={update}
            account={account}
            sync={sync}
            onSignedIn={(me) => setAccount({ kind: 'in', me })}
            onSignedOut={signedOut}
            onSyncNow={syncNow}
          />
        </WithTabs>
      );
    case 'careers':
      return (
        <WithTabs tab="home" onTab={(name) => setScreen({ name })}>
          <Careers
            progress={progress}
            onBack={() => setScreen({ name: 'home' })}
            onOpenUnit={(unitId) => setScreen({ name: 'home', sheet: unitId })}
            onOpenProject={(projectId) => setScreen({ name: 'project', projectId })}
            onOpenMock={(round) => setScreen({ name: 'mock', round })}
          />
        </WithTabs>
      );
    case 'mock':
      return <MockRound key={screen.round} round={screen.round} progress={progress} today={today} onProgress={update} onBack={() => setScreen({ name: 'careers' })} />;
    case 'project':
      return (
        <WithTabs tab="home" onTab={(name) => setScreen({ name })}>
          <ProjectScreen projectId={screen.projectId} progress={progress} onProgress={update} onBack={() => setScreen({ name: 'careers' })} />
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
            onWeak={practiseWeak}
            onFocus={pick}
            onTest={takeTest}
            onDrill={drill}
            onPhase3Key={() => update(withPhase3Key(progress))}
            onOpenSettings={() => setScreen({ name: 'settings' })}
            onOpenCareers={() => setScreen({ name: 'careers' })}
            initialSheet={screen.name === 'home' ? screen.sheet : undefined}
            showInstallHint={isIosBrowser()}
            onProgress={update}
            signedIn={account.kind === 'in'}
          />
        </WithTabs>
      );
  }
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunken px-1 py-0.5 font-sans text-[10px] font-bold text-ink-2">{children}</kbd>;
}

const TABS: { id: Tab; label: string; icon: typeof PathIcon }[] = [
  { id: 'home', label: 'Learn', icon: PathIcon },
  { id: 'guide', label: 'Guide', icon: ChatIcon },
  { id: 'glossary', label: 'Glossary', icon: BookIcon },
  { id: 'settings', label: 'Settings', icon: GearIcon },
];

function WithTabs({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode }) {
  return (
    <>
      {/* Laptops: a sidebar on the left, and the page sits beside it. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface/80 px-4 py-6 backdrop-blur-md lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight text-ink">FinTermShip</span>
        </div>
        <nav className="space-y-1" aria-label="Main">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-extrabold transition ${active ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 px-2 text-xs leading-relaxed text-ink-3">
          <p>
            Keys: <Kbd>1</Kbd>–<Kbd>4</Kbd> answer, <Kbd>Enter</Kbd> go on, <Kbd>/</Kbd> search.
          </p>
          <p>Indian markets, trading and quant terms, a few minutes a day.</p>
        </div>
      </aside>
      <div className="lg:pl-60">{children}</div>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pt-2 backdrop-blur-md lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-xl grid-cols-4">
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
