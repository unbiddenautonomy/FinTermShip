import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GuideEntry } from './components/Guide';
import { Home, UnitSheets } from './components/Home';
import type { LessonSummary } from './components/Lesson';
import { useAccount } from './components/useAccount';
import { useCards } from './components/useCards';
import { CardsGate, CardsToast } from './components/CardsGate';
import { useGameKeys, useSlashKey } from './components/useKeys';
import { BookIcon, ChartIcon, ChatIcon, GearIcon, Logo, PathIcon } from './components/icons';
import { buildPractice, buildTest, withFocus } from './lib/choose';
import { snoozeDrill } from './lib/drills';
import { practiceKind } from './lib/content';
import { gameOf } from './lib/games';
import { buildPhase3Test, PHASE3, withPhase3Key } from './lib/phase3';
import { dayKey } from './lib/dates';
import { buildLesson, drillUp, todayStatus, type LessonPlan } from './lib/lesson';
import { seededRng } from './lib/questions';
import { ensureCards, ensurePacks, planTermIds } from './lib/cards';
import { hasPack, packOf } from './lib/packs';
import { hasCard } from './lib/content';
import { KIND_LABEL } from './lib/practice';
import { loadProgress, requestPersistence, saveProgress } from './lib/storage';
import { firstName } from './lib/profile';
import { buildWeakSpots, weakSpots } from './lib/weak';
import { currentUnit } from './lib/track';
import { landingMode, type ModeId } from './lib/modes/knowledge';
import { isModeId, modesOn } from './lib/modes/ids';
import { ModeAccessContext } from './components/modes/modeAccess';
import { MODE_INFO, ModeBar } from './components/modes/ModeBar';
import type { GameId, Progress } from './lib/types';

// Everything but Home loads on demand, then quietly in the background once Home is up.
const LOADERS = {
  Careers: () => import('./components/Careers').then((m) => ({ default: m.Careers })),
  MockRound: () => import('./components/MockRound').then((m) => ({ default: m.MockRound })),
  DeskCase: () => import('./components/DeskCase').then((m) => ({ default: m.DeskCase })),
  Drill: () => import('./components/Drill').then((m) => ({ default: m.Drill })),
  Glossary: () => import('./components/Glossary').then((m) => ({ default: m.Glossary })),
  Guide: () => import('./components/Guide').then((m) => ({ default: m.Guide })),
  Lesson: () => import('./components/Lesson').then((m) => ({ default: m.Lesson })),
  FermiGame: () => import('./components/FermiGame').then((m) => ({ default: m.FermiGame })),
  MeetingGame: () => import('./components/MeetingGame').then((m) => ({ default: m.MeetingGame })),
  GreeksGame: () => import('./components/GreeksGame').then((m) => ({ default: m.GreeksGame })),
  GuessGame: () => import('./components/GuessGame').then((m) => ({ default: m.GuessGame })),
  KellyGame: () => import('./components/KellyGame').then((m) => ({ default: m.KellyGame })),
  BacktestGame: () => import('./components/BacktestGame').then((m) => ({ default: m.BacktestGame })),
  SignalGame: () => import('./components/SignalGame').then((m) => ({ default: m.SignalGame })),
  PairsGame: () => import('./components/PairsGame').then((m) => ({ default: m.PairsGame })),
  ExpiryGame: () => import('./components/ExpiryGame').then((m) => ({ default: m.ExpiryGame })),
  RiskGame: () => import('./components/RiskGame').then((m) => ({ default: m.RiskGame })),
  VwapGame: () => import('./components/VwapGame').then((m) => ({ default: m.VwapGame })),
  ReadBookGame: () => import('./components/ReadBookGame').then((m) => ({ default: m.ReadBookGame })),
  MarketGame: () => import('./components/MarketGame').then((m) => ({ default: m.MarketGame })),
  PayoffGame: () => import('./components/PayoffGame').then((m) => ({ default: m.PayoffGame })),
  Results: () => import('./components/Results').then((m) => ({ default: m.Results })),
  Settings: () => import('./components/Settings').then((m) => ({ default: m.Settings })),
  ProgressScreen: () => import('./components/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
  CallIt: () => import('./components/modes/CallIt').then((m) => ({ default: m.CallIt })),
  Exchange: () => import('./components/modes/Exchange').then((m) => ({ default: m.Exchange })),
  TermLines: () => import('./components/modes/TermLines').then((m) => ({ default: m.TermLines })),
  HeadlineDesk: () => import('./components/modes/HeadlineDesk').then((m) => ({ default: m.HeadlineDesk })),
  Finnections: () => import('./components/modes/Finnections').then((m) => ({ default: m.Finnections })),
};
const Careers = lazy(LOADERS.Careers);
const MockRound = lazy(LOADERS.MockRound);
const DeskCase = lazy(LOADERS.DeskCase);
const Drill = lazy(LOADERS.Drill);
const Glossary = lazy(LOADERS.Glossary);
const Guide = lazy(LOADERS.Guide);
const Lesson = lazy(LOADERS.Lesson);
const FermiGame = lazy(LOADERS.FermiGame);
const MeetingGame = lazy(LOADERS.MeetingGame);
const GreeksGame = lazy(LOADERS.GreeksGame);
const GuessGame = lazy(LOADERS.GuessGame);
const KellyGame = lazy(LOADERS.KellyGame);
const BacktestGame = lazy(LOADERS.BacktestGame);
const SignalGame = lazy(LOADERS.SignalGame);
const PairsGame = lazy(LOADERS.PairsGame);
const ExpiryGame = lazy(LOADERS.ExpiryGame);
const RiskGame = lazy(LOADERS.RiskGame);
const VwapGame = lazy(LOADERS.VwapGame);
const ReadBookGame = lazy(LOADERS.ReadBookGame);
const MarketGame = lazy(LOADERS.MarketGame);
const PayoffGame = lazy(LOADERS.PayoffGame);
const Results = lazy(LOADERS.Results);
const Settings = lazy(LOADERS.Settings);
const ProgressScreen = lazy(LOADERS.ProgressScreen);
const CallIt = lazy(LOADERS.CallIt);
const Exchange = lazy(LOADERS.Exchange);
const TermLines = lazy(LOADERS.TermLines);
const HeadlineDesk = lazy(LOADERS.HeadlineDesk);
const Finnections = lazy(LOADERS.Finnections);

function prefetchScreens() {
  for (const load of Object.values(LOADERS)) void load().catch(() => undefined);
}

function Spinner() {
  return <div className="flex min-h-[60dvh] items-center justify-center text-sm font-bold text-ink-3">Loading…</div>;
}

type Tab = 'home' | 'progress' | 'guide' | 'glossary' | 'settings';

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
};

type Screen =
  | { name: Tab; sheet?: string; q?: string }
  | { name: 'careers' }
  | { name: 'mock'; round: string }
  | { name: Exclude<ModeId, 'path'> }
  | { name: 'lesson'; plan: LessonPlan; seed: number; mode?: Exclude<ModeId, 'path'> }
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
  // A unit sheet opened over the career map or the guide, and where to come back to after a lesson started from one.
  const [overlay, setOverlay] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Screen | null>(null);
  // The mode the Learn tab returns to, and the area the modes share (a line, a sector).
  const [mode, setMode] = useState<ModeId>('path');
  const [area, setArea] = useState<string | null>(null);
  const originY = useRef(0);
  const restoreY = useRef<number | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    loadProgress().then((p) => {
      setProgress(p);
      // Open in the learner's chosen mode; Path (Home) unless they picked another in Settings.
      const m = landingMode(p);
      setMode(m);
      if (m !== 'path') setScreen({ name: m });
    });
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

  const { account, setAccount, sync, syncNow, signedOut, site, setSite } = useAccount(progress, update);
  // Modes the admin switched off for everyone are hidden from learners; the admin keeps them, to test.
  const isAdmin = account.kind === 'in' && account.me.admin;
  const access = useMemo(() => ({ off: site.modesOff, admin: isAdmin, setOff: (modesOff: string[]) => setSite({ modesOff }) }), [site.modesOff, isAdmin, setSite]);
  const canOpen = useCallback((m: ModeId) => isAdmin || modesOn(site.modesOff).includes(m), [isAdmin, site.modesOff]);
  const cards = useCards(account, progress);
  // If the mode on screen (or the one Learn returns to) is switched off, go back to Path.
  const shownMode = isModeId(screen.name) ? screen.name : null;
  useEffect(() => {
    if (account.kind === 'loading') return;
    if (!canOpen(mode)) setMode('path');
    if (shownMode && !canOpen(shownMode)) setScreen({ name: 'home' });
  }, [account.kind, canOpen, mode, shownMode]);

  // Fetching cards for a lesson about to start, and anything that stopped one.
  // What is being fetched from the server before a screen opens, as the line to show.
  const [fetching, setFetching] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const y = restoreY.current;
    restoreY.current = null;
    window.scrollTo(0, 0);
    // Coming back to the career map or the guide: return to the same spot, once it has drawn.
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
    setOverlay(null);
  }, [screen.name]);

  // Once Home is showing, fetch the other screens while the learner reads it.
  useEffect(() => {
    if (!progress) return;
    if (window.requestIdleCallback) window.requestIdleCallback(prefetchScreens, { timeout: 2000 });
    else window.setTimeout(prefetchScreens, 1200);
  }, [progress]);

  // Keyboard: 1 to 9 answer and Enter goes on, in games, cases and mocks; "/" searches the glossary.
  useGameKeys(['game', 'case', 'mock', 'results'].includes(screen.name));
  const tabScreen = (TABS as { id: string }[]).some((t) => t.id === screen.name) || ['careers', 'lines', 'callit', 'exchange'].includes(screen.name);
  const toSearch = useCallback(() => {
    if (!tabScreen) return;
    setScreen((s) => (s.name === 'glossary' ? s : { name: 'glossary' }));
    // The glossary may still be loading: try for about a second.
    let tries = 60;
    const focus = () => {
      const el = document.getElementById('glossary-search');
      if (el) el.focus();
      else if (tries-- > 0) requestAnimationFrame(focus);
    };
    requestAnimationFrame(focus);
  }, [tabScreen]);
  useSlashKey(toSearch);

  if (!progress || cards.status !== 'ready') {
    return <CardsGate status={progress ? cards.status : 'loading'} onRetry={cards.retry} />;
  }

  /**
   * Build a lesson, first fetching the cards of any term in it that this device
   * doesn't have yet (new terms, an area test's terms). The plan is built again
   * from the same seed once they are here, so it asks with the real cards.
   */
  const prepare = async (make: (seed: number) => LessonPlan | null, test?: string): Promise<{ plan: LessonPlan; seed: number } | null> => {
    const seed = Date.now() % 2_147_483_647;
    let plan = make(seed);
    if (!plan) return null;
    const need = planTermIds(plan).filter((id) => !hasCard(id));
    if (!need.length) return { plan, seed };
    setFetching('Getting your terms…');
    const failed = await ensureCards(need, test);
    setFetching(null);
    if (failed) {
      setNotice(failed);
      return null;
    }
    plan = make(seed);
    if (!plan) return null;
    if (planTermIds(plan).some((id) => !hasCard(id))) {
      setNotice('Some of these terms could not be loaded. Try again in a moment.');
      return null;
    }
    return { plan, seed };
  };

  const run = async (make: (seed: number) => LessonPlan | null, test?: string) => {
    if (fetching) return;
    const ready = await prepare(make, test);
    if (ready) setScreen({ name: 'lesson', ...ready });
    else setOrigin(null);
  };
  // Leaving a lesson, drill, game or results goes back to where it was started from.
  const back = () => {
    if (origin) restoreY.current = originY.current;
    setScreen(origin ?? { name: 'home' });
    setOrigin(null);
  };
  /**
   * Drills, games and desk cases each have their own screen. A desk case, and a
   * game whose content comes from the server, is fetched first if this device
   * doesn't have it. Resolves to whether the screen opened.
   */
  const drill = async (unitId: string): Promise<boolean> => {
    const pack = packOf(unitId);
    if (pack && !hasPack(pack)) {
      if (fetching) return false;
      setFetching(pack.startsWith('case:') ? 'Getting the case…' : 'Getting the game ready…');
      const failed = await ensurePacks([pack]);
      setFetching(null);
      if (failed) {
        setNotice(failed);
        return false;
      }
    }
    setScreen({ name: practiceKind(unitId) ?? 'drill', unitId, seed: Date.now() % 2_147_483_647 });
    return true;
  };
  // Opened from somewhere to come back to: forget that place if it didn't open.
  const drillFrom = (unitId: string) =>
    void drill(unitId).then((opened) => {
      if (!opened) setOrigin(null);
    });
  // One track: when the learner is on a drill, game or case, the next step is that unit.
  const start = (ignoreNewCap: boolean) => {
    const d = drillUp(progress, today);
    if (d) void drill(d);
    else void run((seed) => buildLesson(progress, today, seededRng(seed), ignoreNewCap));
  };
  const practiseWeak = () => void run((seed) => buildWeakSpots(progress, seededRng(seed)));
  const practise = (unitId: string) => void run((seed) => buildPractice(progress, unitId, seededRng(seed)));
  const takeTest = (categoryId: string) =>
    void run((seed) => (categoryId === PHASE3 ? buildPhase3Test(seededRng(seed)) : buildTest(categoryId, seededRng(seed))), categoryId);
  const pick = (unitId: string | null) => update(withFocus(progress, unitId));
  const goMode = (want: ModeId) => {
    const m = canOpen(want) ? want : 'path';
    setMode(m);
    setScreen(m === 'path' ? { name: 'home' } : { name: m });
  };
  const onTab = (name: Tab) => (name === 'home' ? goMode(mode) : setScreen({ name }));
  // A lesson started from a mode: answers are tallied for it, and finishing comes back to it.
  const runIn = (m: Exclude<ModeId, 'path'>) => async (make: (rng: ReturnType<typeof seededRng>) => LessonPlan | null) => {
    if (fetching) return;
    const from = screen;
    const y = window.scrollY;
    const ready = await prepare((seed) => make(seededRng(seed)));
    if (!ready) return;
    setOrigin(from);
    originY.current = y;
    setScreen({ name: 'lesson', ...ready, mode: m });
  };
  const depot = (unitId: string) => {
    setOrigin(screen);
    originY.current = window.scrollY;
    drillFrom(unitId);
  };

  const body = (() => {
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
          onQuit={back}
          mode={screen.mode}
        />
      );
    case 'lines':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <TermLines progress={progress} today={today} area={area} onArea={setArea} onMode={goMode} onRun={runIn('lines')} onDepot={depot} />
        </WithTabs>
      );
    case 'callit':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <CallIt progress={progress} today={today} onProgress={update} onMode={goMode} />
        </WithTabs>
      );
    case 'exchange':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <Exchange progress={progress} today={today} area={area} onArea={setArea} onProgress={update} onMode={goMode} onRun={runIn('exchange')} />
        </WithTabs>
      );
    case 'headline':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <HeadlineDesk progress={progress} today={today} onProgress={update} onMode={goMode} />
        </WithTabs>
      );
    case 'finnections':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <Finnections progress={progress} today={today} onProgress={update} onMode={goMode} />
        </WithTabs>
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
          onQuit={back}
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
          onQuit={back}
        />
      );
    }
    case 'results': {
      const s = todayStatus(progress, today);
      const last = screen.summary.drill ?? screen.summary.round;
      const nextDrill = drillUp(progress, today);
      const stuck = last && !last.passed && currentUnit(progress, today) === last.unitId;
      // Started from Lines or the Exchange: the way on is back to that mode, not Path's next lesson.
      const fromMode = origin && (origin.name === 'lines' || origin.name === 'exchange' || origin.name === 'callit') ? origin.name : null;
      return (
        <Results
          summary={screen.summary}
          name={firstName(progress)}
          weakLeft={weakSpots(progress).length}
          canContinue={!fromMode && (s.due > 0 || s.newLeft > 0 || !!s.drill)}
          homeLabel={fromMode ? `Back to ${MODE_INFO[fromMode].label}` : undefined}
          nextLabel={nextDrill && nextDrill === last?.unitId ? 'Try again' : nextDrill ? `Next: a ${KIND_LABEL[practiceKind(nextDrill) ?? 'drill']}` : 'Next lesson'}
          onHome={back}
          onNext={() => start(false)}
          onSnooze={
            stuck
              ? () => {
                  let p = snoozeDrill(progress, last.unitId, today);
                  if (p.focus === last.unitId) p = withFocus(p, null);
                  update(p);
                  back();
                }
              : undefined
          }
        />
      );
    }
    case 'progress':
      return (
        <WithTabs tab="progress" onTab={onTab}>
          <ProgressScreen progress={progress} today={today} onWeak={practiseWeak} />
        </WithTabs>
      );
    case 'glossary':
      return (
        <WithTabs tab="glossary" onTab={onTab}>
          <Glossary progress={progress} initialQuery={screen.q} />
        </WithTabs>
      );
    case 'guide':
      return (
        <WithTabs tab="guide" onTab={onTab}>
          <Guide
            progress={progress}
            today={today}
            log={guideLog}
            onLog={setGuideLog}
            onOpenUnit={setOverlay}
            onFocus={pick}
            onTest={takeTest}
            onStart={() => start(false)}
            onGo={(where, q) => setScreen(where === 'careers' ? { name: 'careers' } : where === 'glossary' ? { name: 'glossary', q } : { name: where })}
          />
        </WithTabs>
      );
    case 'settings':
      return (
        <WithTabs tab="settings" onTab={onTab}>
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
        <WithTabs tab="home" onTab={onTab}>
          <Careers
            progress={progress}
            onBack={() => setScreen({ name: 'home' })}
            onOpenUnit={setOverlay}
            onOpenMock={(round) => setScreen({ name: 'mock', round })}
          />
        </WithTabs>
      );
    case 'mock':
      return <MockRound key={screen.round} round={screen.round} progress={progress} today={today} onProgress={update} onBack={() => setScreen({ name: 'careers' })} />;
    default:
      return (
        <WithTabs tab="home" onTab={onTab}>
          <div className="mx-auto max-w-xl px-4 pt-5 lg:max-w-6xl lg:px-8 lg:pt-8">
            <ModeBar progress={progress} today={today} mode="path" onMode={goMode} />
          </div>
          <Home
            progress={progress}
            today={today}
            onStart={start}
            onPractice={practise}
            onWeak={practiseWeak}
            onFocus={pick}
            onTest={takeTest}
            onDrill={(id) => void drill(id)}
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
  })();
  const overlayFrom = screen.name === 'careers' || screen.name === 'guide' ? screen : null;
  // Starting something from the sheet remembers this screen, so finishing or quitting comes back here.
  const fromOverlay = (f: () => void) => () => {
    setOrigin(overlayFrom);
    originY.current = window.scrollY;
    f();
  };
  return (
    <ModeAccessContext.Provider value={access}>
    <Suspense fallback={<Spinner />}>
      {body}
      {overlay && overlayFrom && (
        <UnitSheets
          unitId={overlay}
          progress={progress}
          today={today}
          onClose={() => setOverlay(null)}
          onPractice={(id) => fromOverlay(() => practise(id))()}
          onDrill={(id) => fromOverlay(() => drillFrom(id))()}
          onFocus={pick}
          onTest={(id) => fromOverlay(() => takeTest(id))()}
          onPhase3Key={() => update(withPhase3Key(progress))}
        />
      )}
      <CardsToast fetching={fetching} notice={notice} onClose={() => setNotice(null)} />
    </Suspense>
    </ModeAccessContext.Provider>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunken px-1 py-0.5 font-sans text-[10px] font-bold text-ink-2">{children}</kbd>;
}

const TABS: { id: Tab; label: string; icon: typeof PathIcon }[] = [
  { id: 'home', label: 'Learn', icon: PathIcon },
  { id: 'progress', label: 'Progress', icon: ChartIcon },
  { id: 'guide', label: 'Guide', icon: ChatIcon },
  { id: 'glossary', label: 'Glossary', icon: BookIcon },
  { id: 'settings', label: 'Settings', icon: GearIcon },
];

function WithTabs({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode }) {
  return (
    <>
      {/* Laptops: a sidebar on the left, and the page sits beside it. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-violet/25 bg-surface/80 px-4 py-6 backdrop-blur-md lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="h-9 w-9" />
          <span className="font-wordmark text-[23px] font-light tracking-[0.04em] text-ink">fintermship</span>
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
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-extrabold transition ${active ? 'bg-violet-soft text-violet-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}
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
      <div className="lg:pl-60">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </div>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pt-2 backdrop-blur-md lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1 text-[11px] font-extrabold tracking-wide transition ${active ? 'text-violet-ink' : 'text-ink-3 hover:text-ink-2'}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${active ? 'bg-violet-soft' : ''}`}>
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
