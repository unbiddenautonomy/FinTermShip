import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { GuideEntry } from './components/Guide';
import { Home, UnitSheets } from './components/Home';
import { useAccount } from './components/useAccount';
import { useCards } from './components/useCards';
import { wantTerms } from './lib/terms';
import { CardsGate, CardsToast } from './components/CardsGate';
import { useGameKeys, useSlashKey } from './components/useKeys';
import { BookIcon, ChartIcon, ChatIcon, GearIcon, Logo, PathIcon } from './components/icons';
import { withFocus } from './lib/choose';
import { snoozeDrill } from './lib/drills';
import { getCardsVersion, practiceKind } from './lib/content';
import { gameOf } from './lib/games';
import { withPhase3Key } from './lib/phase3';
import { asIfAllMet, withoutAssumed } from './lib/openAll';
import { dayKey } from './lib/dates';
import { EASY_QUIZ, skipEasyQuiz, wantsEasyQuiz } from './lib/easy';
import { drillUp, todayStatus } from './lib/lesson';
import { startSession, type DealtPlan, type Recipe } from './lib/session';
import { canSpeak } from './lib/speech';
import { KIND_LABEL } from './lib/practice';
import { loadProgress, requestPersistence, saveProgress } from './lib/storage';
import { firstName } from './lib/profile';
import { weakSpots } from './lib/weak';
import { currentUnit } from './lib/track';
import { landingMode, type ModeId } from './lib/modes/knowledge';
import { isModeId, modesOn } from './lib/modes/ids';
import { wantRoundStatus } from './lib/modes/roundApi';
import { getRoundStatusVersion, subscribeRoundStatus } from './lib/modes/rounds';
import { ModeAccessContext, OwnProgressContext } from './components/modes/modeAccess';
import { MODE_INFO, ModeBar } from './components/modes/ModeBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { placeAt, type Place, type Screen, type Tab } from './components/route';
import { useHistory } from './components/useHistory';
import type { GameId, Progress } from './lib/types';

// Everything but Home loads on demand, then quietly in the background once Home is up.
/** Sessions that see every term as met while Open everything is on (src/lib/openAll.ts). */
const SEES_ALL = new Set<Recipe['build']>(['practice', 'ride', 'revisit']);

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

/**
 * Screens whose files carry content (the career map, the Guide's replies) or that ask the server
 * as they open load only when the learner opens them. The rest is code, fetched ahead while Home shows.
 */
const ON_OPEN = new Set<keyof typeof LOADERS>(['Careers', 'Guide', 'CallIt', 'Exchange', 'TermLines', 'HeadlineDesk', 'Finnections']);
function prefetchScreens() {
  for (const [name, load] of Object.entries(LOADERS)) if (!ON_OPEN.has(name as keyof typeof LOADERS)) void load().catch(() => undefined);
}

function Spinner() {
  return <div className="flex min-h-[60dvh] items-center justify-center text-sm font-bold text-ink-3">Loading…</div>;
}

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
  /** Set when a screen and its unit sheet were both named by the address, so the sheet survives the change. */
  const keepOverlay = useRef(false);
  /** The screen showing now, for the handlers below, which are made once. */
  const showing = useRef(screen.name);
  showing.current = screen.name;
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  /**
   * Go where an address says: on opening the app, and on Back and Forward. The learner didn't
   * reach this screen from another one, so there is nowhere for a lesson to return to.
   */
  const goTo = useCallback((to: Place, y: number) => {
    // The scroll and the sheet are settled by the effect that watches the screen's name, which
    // only runs when that name changes. A move within one screen settles them here instead.
    const sameScreen = to.screen.name === showing.current;
    keepOverlay.current = !sameScreen && to.overlay !== null;
    if (!sameScreen && y) restoreY.current = y;
    setScreen(to.screen);
    setOverlay(to.overlay);
    setOrigin(null);
    // Home is Path, so the Learn tab goes back to Path rather than the mode that was left behind.
    if (isModeId(to.screen.name)) setMode(to.screen.name);
    else if (to.screen.name === 'home') setMode('path');
  }, []);

  useEffect(() => {
    loadProgress().then((p) => {
      setProgress(p);
      // The address wins: a shared or reloaded link opens its own screen. The bare root names no
      // screen in particular, so the effect below opens the learner's chosen mode there.
      const url = window.location.pathname + window.location.search;
      const at = url === '/' ? null : placeAt(url);
      if (at) goTo(at, 0);
    });
    requestPersistence().then(setPersisted);
    // Roll "today" over if the app stays open past midnight.
    const t = setInterval(() => setToday(dayKey()), 60_000);
    return () => clearInterval(t);
    // Once, as the app opens. `goTo` is made once too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((p: Progress) => {
    setProgress(p);
    // Save after every change, one write at a time.
    saveChain.current = saveChain.current.then(() => saveProgress(p));
  }, []);

  /**
   * Progress as the modes see it: with Open everything on, every term counts as met
   * (src/lib/openAll.ts). What a mode hands back loses those assumed terms before it is saved.
   */
  const own = useRef(progress);
  own.current = progress;
  const termsKnown = getCardsVersion();
  // Again as term names arrive: the admin's come after sign-in, and the view needs every one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => (progress ? asIfAllMet(progress, today) : null), [progress, today, termsKnown]);
  const updateView = useCallback((p: Progress) => update(own.current ? withoutAssumed(p, own.current) : p), [update]);

  const { account, setAccount, sync, synced, syncNow, signedOut, site, setSite } = useAccount(progress, update);
  // Modes the admin switched off for everyone are hidden from learners; the admin keeps them, to test.
  const isAdmin = account.kind === 'in' && account.me.admin;
  const access = useMemo(() => ({ off: site.modesOff, admin: isAdmin, setOff: (modesOff: string[]) => setSite({ modesOff }) }), [site.modesOff, isAdmin, setSite]);
  const canOpen = useCallback((m: ModeId) => isAdmin || modesOn(site.modesOff).includes(m), [isAdmin, site.modesOff]);
  const cards = useCards(account);
  // If the mode on screen (or the one Learn returns to) is switched off, go back to Path.
  const shownMode = isModeId(screen.name) ? screen.name : null;
  useEffect(() => {
    if (account.kind === 'loading') return;
    if (!canOpen(mode)) setMode('path');
    if (shownMode && !canOpen(shownMode)) setScreen({ name: 'home' });
  }, [account.kind, canOpen, mode, shownMode]);

  /**
   * Open in the mode the learner chose in Settings, Path (Home) unless they picked another.
   * It waits for the server's copy, because on a device the learner has just signed in on,
   * this device's own record is empty and knows nothing of what they chose. Only at the bare
   * root: any other address names its own screen, and once the learner has moved it is too late.
   */
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !progress || !synced) return;
    landed.current = true;
    if (showing.current !== 'home' || window.location.pathname + window.location.search !== '/') return;
    const m = landingMode(progress);
    setMode(m);
    if (m !== 'path') setScreen({ name: m });
  }, [progress, synced]);

  // Met terms the app has no name for yet (progress synced from another device): ask for them.
  useEffect(() => {
    if (progress && cards.status === 'ready') wantTerms(progress);
  }, [progress, cards.status]);

  // Whether Headline Desk and Finnections are open: the server says, as the met terms change.
  useSyncExternalStore(subscribeRoundStatus, getRoundStatusVersion);
  const roundsOn = canOpen('headline') || canOpen('finnections');
  useEffect(() => {
    if (view && roundsOn && cards.status === 'ready') void wantRoundStatus(view);
  }, [view, roundsOn, cards.status]);

  // Fetching cards for a lesson about to start, and anything that stopped one.
  // What is being fetched from the server before a screen opens, as the line to show.
  const [fetching, setFetching] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const y = restoreY.current;
    restoreY.current = null;
    window.scrollTo(0, 0);
    // Coming back to a screen: return to the same spot. A screen arrives as its own file and may
    // fetch as it draws, so keep trying for about half a second until the page is long enough.
    if (y) {
      let tries = 30;
      const settle = () => {
        if (document.documentElement.scrollHeight - window.innerHeight >= y) window.scrollTo(0, y);
        else if (tries-- > 0) requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    }
    // A sheet named by the address arrives with its screen, so it isn't one left over from the last.
    if (keepOverlay.current) keepOverlay.current = false;
    else setOverlay(null);
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

  // Leaving a lesson, drill, game or results goes back to where it was started from.
  const back = useCallback(() => {
    if (origin) restoreY.current = originY.current;
    setScreen(origin ?? { name: 'home' });
    setOrigin(null);
  }, [origin]);

  // The address bar and the browser's Back button, both ways (src/components/useHistory.ts).
  const place = useMemo<Place | null>(() => (progress ? { screen, overlay } : null), [progress, screen, overlay]);
  useHistory(place, goTo, back);

  if (!progress || cards.status !== 'ready') {
    return <CardsGate status={progress ? cards.status : 'loading'} onRetry={cards.retry} />;
  }

  /**
   * Ask the server to build a session (worker/session.ts): it comes without its answers, with the
   * cards of the terms it teaches. Null when there is nothing to do, or it could not be built.
   */
  const prepare = async (recipe: Recipe, sayIfEmpty = true): Promise<{ plan: DealtPlan; seed: number } | null> => {
    setFetching('Getting your terms…');
    try {
      // Practice and Term Lines rounds see every term as met while everything is open; lessons, tests and the Exchange see the learner's own.
      const plan = await startSession(recipe, SEES_ALL.has(recipe.build) && view ? view : progress, today);
      if (!plan && sayIfEmpty) setNotice('There is nothing to practise here right now.');
      return plan ? { plan, seed: Date.now() % 2_147_483_647 } : null;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Something went wrong. Try again in a moment.');
      return null;
    } finally {
      setFetching(null);
    }
  };

  const run = async (recipe: Recipe) => {
    if (fetching) return;
    const ready = await prepare(recipe);
    if (ready) setScreen({ name: 'lesson', ...ready });
    else setOrigin(null);
  };
  /**
   * Drills, games and desk cases each have their own screen. A desk case, and a
   * game whose content is on the server, deals its round once the screen opens.
   * Resolves to whether the screen opened.
   */
  const drill = async (unitId: string): Promise<boolean> => {
    setScreen({ name: practiceKind(unitId) ?? 'drill', unitId, seed: Date.now() % 2_147_483_647 });
    return true;
  };
  // Opened from somewhere to come back to: forget that place if it didn't open.
  const drillFrom = (unitId: string) =>
    void drill(unitId).then((opened) => {
      if (!opened) setOrigin(null);
    });
  // One track: when the learner is on a drill, game or case, the next step is that unit.
  const start = (keepGoing: boolean) => {
    const d = drillUp(progress, today);
    if (d) void drill(d);
    else void run({ build: 'lesson', keepGoing, listen: progress.settings.voice && canSpeak() });
  };
  const practiseWeak = () => void run({ build: 'weak' });
  const practise = (unitId: string) => void run({ build: 'practice', unitId });
  const takeTest = (categoryId: string) => void run({ build: 'test', categoryId });
  // The easy-terms quiz, a round at a time. Nothing left to ask means it is done.
  const takeEasyQuiz = async () => {
    if (fetching) return;
    const ready = await prepare({ build: 'easy' }, false);
    if (ready) setScreen({ name: 'lesson', ...ready });
    else {
      // Every everyday term has been asked: the quiz is done.
      update(skipEasyQuiz(progress, today));
      setOrigin(null);
      setScreen({ name: 'home' });
      setNotice('That’s every everyday term checked.');
    }
  };
  const pick = (unitId: string | null) => update(withFocus(progress, unitId));
  const goMode = (want: ModeId) => {
    const m = canOpen(want) ? want : 'path';
    setMode(m);
    setScreen(m === 'path' ? { name: 'home' } : { name: m });
  };
  const onTab = (name: Tab) => (name === 'home' ? goMode(mode) : setScreen({ name }));
  // A lesson started from a mode: answers are tallied for it, and finishing comes back to it.
  const runIn = (m: Exclude<ModeId, 'path'>) => async (recipe: Recipe) => {
    if (fetching) return;
    const from = screen;
    const y = window.scrollY;
    const ready = await prepare(recipe);
    if (!ready) return;
    setOrigin(from);
    originY.current = y;
    setScreen({ name: 'lesson', ...ready, mode: m });
  };
  // A mock round deals its own worked sums when it opens.
  const openMock = (round: string) => setScreen({ name: 'mock', round });
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
          onProgress={update}
          onFinish={(summary) => setScreen({ name: 'results', summary })}
          onQuit={back}
          mode={screen.mode}
        />
      );
    case 'lines':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <TermLines progress={view!} today={today} area={area} onArea={setArea} onMode={goMode} onRun={runIn('lines')} onDepot={depot} />
        </WithTabs>
      );
    case 'callit':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <CallIt progress={view!} today={today} onProgress={updateView} onMode={goMode} />
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
          <HeadlineDesk progress={view!} today={today} onProgress={updateView} onMode={goMode} />
        </WithTabs>
      );
    case 'finnections':
      return (
        <WithTabs tab="home" onTab={onTab}>
          <Finnections progress={view!} today={today} onProgress={updateView} onMode={goMode} />
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
      // A round of the easy-terms quiz leads on to the next one, until it is done.
      const quizOn = screen.summary.test?.categoryId === EASY_QUIZ && wantsEasyQuiz(progress);
      return (
        <Results
          summary={screen.summary}
          name={firstName(progress)}
          weakLeft={weakSpots(progress).length}
          canContinue={quizOn || (!fromMode && (s.due > 0 || s.newLeft > 0 || !!s.drill))}
          homeLabel={fromMode ? `Back to ${MODE_INFO[fromMode].label}` : undefined}
          nextLabel={quizOn ? 'Next round' : nextDrill && nextDrill === last?.unitId ? 'Try again' : nextDrill ? `Next: a ${KIND_LABEL[practiceKind(nextDrill) ?? 'drill']}` : 'Next lesson'}
          onHome={back}
          onNext={() => (quizOn ? void takeEasyQuiz() : start(false))}
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
          <Glossary progress={progress} initialQuery={screen.q} onOpenUnit={setOverlay} />
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
            onOpenMock={openMock}
          />
        </WithTabs>
      );
    case 'mock':
      return <MockRound key={screen.round} round={screen.round} progress={progress} today={today} onProgress={update} onBack={() => setScreen({ name: 'careers' })} />;
    default:
      return (
        <WithTabs tab="home" onTab={onTab}>
          <div className="mx-auto max-w-xl px-4 pt-5 lg:max-w-6xl lg:px-8 lg:pt-8">
            {/* Phones have no sidebar, so the name sits at the top of the start screen. */}
            <div className="mb-4 flex items-center gap-2.5 lg:hidden">
              <Logo className="h-8 w-8" />
              <span className="font-wordmark text-[23px] font-light tracking-[0.04em] text-ink">fintermship</span>
            </div>
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
            onEasyQuiz={() => void takeEasyQuiz()}
            onDrill={(id) => void drill(id)}
            onPhase3Key={() => update(withPhase3Key(progress))}
            onOpenSettings={() => setScreen({ name: 'settings' })}
            onOpenCareers={() => setScreen({ name: 'careers' })}
            sheet={screen.name === 'home' ? (screen.sheet ?? null) : null}
            onSheet={(unitId) => setScreen({ name: 'home', ...(unitId ? { sheet: unitId } : {}) })}
            showInstallHint={isIosBrowser()}
            onProgress={update}
            signedIn={account.kind === 'in'}
          />
        </WithTabs>
      );
  }
  })();
  const overlayFrom = screen.name === 'careers' || screen.name === 'guide' || screen.name === 'glossary' ? screen : null;
  // Starting something from the sheet remembers this screen, so finishing or quitting comes back here.
  const fromOverlay = (f: () => void) => () => {
    setOrigin(overlayFrom);
    originY.current = window.scrollY;
    f();
  };
  return (
    <ModeAccessContext.Provider value={access}>
      <OwnProgressContext.Provider value={progress}>
      <ErrorBoundary>
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
      </ErrorBoundary>
      </OwnProgressContext.Provider>
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
      <main className="lg:pl-60">
        <ErrorBoundary resetKey={tab}>
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </ErrorBoundary>
      </main>
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
