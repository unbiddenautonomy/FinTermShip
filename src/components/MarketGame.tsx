import { useMemo, useRef, useState } from 'react';
import { settleFocus } from '../lib/choose';
import { categoryOfUnit, unitById } from '../lib/content';
import { marketLevel } from '../lib/games';
import { MM, newMarketGame, playTurn, points, scoreGame, shownBefore, type Quote, type TurnResult } from '../lib/market';
import { passRule, recordRound } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { finishLesson } from '../lib/scheduler';
import type { Progress } from '../lib/types';
import { Cross, Dice } from './icons';
import type { LessonSummary } from './Lesson';
import { MarketLevelGame } from './MarketLevelGame';
import { Bar, Button, ConfirmDialog, Pill, Stepper } from './ui';

interface Props {
  unitId: string;
  seed: number;
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onFinish: (summary: LessonSummary) => void;
  onQuit: () => void;
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const lots = (n: number) => (n === 0 ? 'flat' : `${n > 0 ? 'long' : 'short'} ${Math.abs(n)} lot${Math.abs(n) === 1 ? '' : 's'}`);

/** The market game: the dice game at level 1, then levels 2 to 5 on their own screen. */
export function MarketGame(props: Props) {
  const level = marketLevel(props.unitId);
  return level === 1 ? <DiceMarket {...props} /> : <MarketLevelGame {...props} level={level} />;
}

function DiceMarket({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: Props) {
  const game = useMemo(() => newMarketGame(seededRng(seed)), [seed]);
  const unit = unitById.get(unitId);
  const [turns, setTurns] = useState<TurnResult[]>([]);
  const [quote, setQuote] = useState<Quote>({ bid: 10, ask: 11 });
  const [showRules, setShowRules] = useState(true);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const finished = useRef(false);

  const last = turns[turns.length - 1];
  const position = last?.position ?? 0;
  // After quoting, the turn's result shows until the learner moves on.
  const [phase, setPhase] = useState<'quote' | 'result'>('quote');
  const turn = phase === 'quote' ? turns.length + 1 : turns.length;
  const over = phase === 'result' && turn === MM.turns;
  const shown = over ? 3 : phase === 'quote' ? shownBefore(turn) : shownBefore(turn + 1);
  const revealedNow = phase === 'result' && MM.revealAfter.includes(turn);

  const width = quote.ask - quote.bid;
  const mid = (quote.bid + quote.ask) / 2;

  const nudge = (side: 'bid' | 'ask' | 'both', d: number) =>
    setQuote((q) => {
      let { bid, ask } = q;
      if (side === 'bid' || side === 'both') bid += d;
      if (side === 'ask' || side === 'both') ask += d;
      bid = Math.max(0, bid);
      ask = Math.min(30, ask);
      if (ask - bid < MM.step) {
        if (side === 'bid') ask = bid + MM.step;
        else bid = ask - MM.step;
      }
      return { bid, ask };
    });

  const submit = () => {
    setShowRules(false);
    setTurns((t) => [...t, playTurn(game, t.length + 1, quote, position)]);
    setPhase('result');
  };

  const finish = (all: TurnResult[]) => {
    if (finished.current) return;
    finished.current = true;
    const s = scoreGame(game, all);
    const met = [s.checks.mid, s.checks.width, s.checks.flat].filter(Boolean).length;
    const before = progress.drills?.[unitId];
    let p = recordRound(progress, unitId, met, s.passed, today, s.pnl);
    p = settleFocus(p);
    const xp = 5 + 2 * met + (s.passed ? 5 : 0);
    p = finishLesson(p, today, xp);
    onProgress(p);

    // Who made money from whom, with every trade settled at the total.
    let knew = 0;
    let rest = 0;
    let knewTrades = 0;
    for (const t of all) {
      if (!t.fill) continue;
      const edge = t.fill.side === 'sold' ? t.fill.price - s.total : s.total - t.fill.price;
      if (t.fill.informed) {
        knew += edge;
        knewTrades++;
      } else rest += edge;
    }
    const offTurns = all.filter((t) => Math.abs((t.quote.bid + t.quote.ask) / 2 - t.fair) > MM.midTolerance);
    onFinish({
      xp,
      firstTryCorrect: met,
      firstTryTotal: 3,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed: s.passed,
        firstPass: s.passed && !before?.passed,
        detail: `The dice totalled ${s.total}. You ended ${lots(s.position)}, and made ${points(s.pnl)} points.`,
        stat: { label: 'P&L', value: points(s.pnl) },
        notes: [
          {
            title: 'The three checks',
            items: [
              {
                prompt: `Mid within ${MM.midTolerance} point of fair value on ${MM.midTurnsNeeded} of ${MM.turns} turns`,
                shown: `${s.checks.mid ? 'Met' : 'Missed'}: ${s.midTurns} of ${MM.turns}`,
              },
              { prompt: `Spread no wider than ${MM.maxWidth} points`, shown: `${s.checks.width ? 'Met' : 'Missed'}: widest was ${fmt(s.widest)}` },
              { prompt: `End within ${MM.flatAtEnd} lots of flat`, shown: `${s.checks.flat ? 'Met' : 'Missed'}: ended ${lots(s.position)}` },
            ],
          },
          {
            title: 'Where the money went',
            items: [
              {
                prompt: `Traders who knew a die (${knewTrades} trade${knewTrades === 1 ? '' : 's'})`,
                shown: `${points(knew)} points to you`,
              },
              { prompt: 'Everyone else', shown: `${points(rest)} points to you` },
            ],
          },
          ...(offTurns.length
            ? [
                {
                  title: 'Turns off fair value',
                  items: offTurns.map((t) => ({
                    prompt: `Turn ${t.turn}: fair value ${fmt(t.fair)}`,
                    shown: `You quoted ${fmt(t.quote.bid)} / ${fmt(t.quote.ask)}, mid ${fmt((t.quote.bid + t.quote.ask) / 2)}`,
                  })),
                },
              ]
            : []),
        ],
      },
    });
  };

  const next = () => {
    if (over) finish(turns);
    else setPhase('quote');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl lg:max-w-2xl items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2"
          aria-label="Leave game"
        >
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={turns.length} max={MM.turns} className="h-3" label="Game progress" />
        <span className="num w-24 shrink-0 text-right text-sm font-extrabold text-ink-2">
          Turn {Math.min(turn, MM.turns)} of {MM.turns}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-xl lg:max-w-2xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone="violet" icon={<Dice className="h-3.5 w-3.5" />}>
            {unit?.name ?? 'Make a market'}
          </Pill>
        </div>

        {showRules && (
          <div className="mb-4 space-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink-2">
            <p className="font-extrabold text-ink">How it works</p>
            <p>
              You're making a market in the total of three dice. One die is shown after turn 3, one after turn 6, and the last at the end, when every lot you hold is settled at the
              total.
            </p>
            <p>
              Each turn, quote a <b>bid</b> (you buy 1 lot there) and an <b>ask</b> (you sell 1 lot there). One trader comes along. Some already know the next die; the rest trade
              more when your spread is tight.
            </p>
            <p>Fair value is the dice shown plus 3.5 for each hidden die. You can hold at most {MM.limit} lots either way.</p>
          </div>
        )}

        <section aria-label="Dice" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-center gap-3">
            {game.dice.map((d, i) => (
              <span
                key={i}
                className={`num flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold ${
                  i < shown ? 'animate-pop bg-ink text-bg' : 'border-2 border-dashed border-line text-ink-3'
                }`}
                aria-label={i < shown ? `Die ${i + 1}: ${d}` : `Die ${i + 1}: hidden`}
              >
                {i < shown ? d : '?'}
              </span>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-ink-3">Position</span>
            <span className="num font-extrabold text-ink">{lots(position)}</span>
          </div>
        </section>

        {phase === 'quote' ? (
          <section aria-label="Your quote" className="mt-4 space-y-3">
            <Stepper label="Bid: you buy at" value={quote.bid} onDown={() => nudge('bid', -MM.step)} onUp={() => nudge('bid', MM.step)} />
            <Stepper label="Ask: you sell at" value={quote.ask} onDown={() => nudge('ask', -MM.step)} onUp={() => nudge('ask', MM.step)} />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-ink-3">
                Spread <b className="num text-ink-2">{fmt(width)}</b> · mid <b className="num text-ink-2">{fmt(mid)}</b>
              </span>
              <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => nudge('both', -MM.step)}>
                Both −{MM.step}
              </Button>
              <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => nudge('both', MM.step)}>
                Both +{MM.step}
              </Button>
            </div>
            <Button className="w-full text-base" onClick={submit}>
              Quote {fmt(quote.bid)} / {fmt(quote.ask)}
            </Button>
          </section>
        ) : (
          last && (
            <section aria-live="polite" className="mt-4 space-y-3">
              <div className={`rounded-2xl p-4 ${last.fill ? 'bg-sky-soft' : 'bg-sunken'}`}>
                <p className="font-extrabold text-ink">{tradeLine(last)}</p>
                <p className="mt-1 text-sm text-ink-2">Now {lots(last.position)}.</p>
              </div>
              {revealedNow && (
                <div className="animate-pop rounded-2xl bg-ink p-4 text-bg">
                  <p className="font-extrabold">
                    Die {shown} comes up {game.dice[shown - 1]}.
                  </p>
                  <p className="mt-1 text-sm opacity-80">Move your quotes to the new fair value.</p>
                </div>
              )}
              {over && (
                <div className="animate-pop rounded-2xl bg-ink p-4 text-bg">
                  <p className="font-extrabold">
                    Last die: {game.dice[2]}. The total is {game.dice[0] + game.dice[1] + game.dice[2]}.
                  </p>
                </div>
              )}
              <Button className="w-full text-base" onClick={next}>
                {over ? 'See how you did' : 'Next turn'}
              </Button>
            </section>
          )
        )}

        {turns.length > 0 && (
          <ol className="mt-5 divide-y divide-line rounded-2xl border border-line text-sm" aria-label="Your trades">
            {turns.map((t) => (
              <li key={t.turn} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="num text-ink-3">
                  {t.turn}. {fmt(t.quote.bid)} / {fmt(t.quote.ask)}
                </span>
                <span className="num font-bold text-ink-2">{t.fill ? `${t.fill.side} at ${fmt(t.fill.price)}` : t.blocked ? 'at limit' : 'no trade'}</span>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-auto pt-4 text-center text-xs text-ink-3">
          {categoryOfUnit(unitId)?.name} · {passRule(unitId)}
        </p>
      </main>

      {confirmQuit && (
        <ConfirmDialog
          title="Leave this game?"
          body="This game won't count. You can start a fresh one any time."
          confirmLabel="Leave"
          onConfirm={onQuit}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}

function tradeLine(t: TurnResult): string {
  if (t.fill) return t.fill.side === 'sold' ? `A trader bought 1 lot from you at ${fmt(t.fill.price)}.` : `A trader sold you 1 lot at ${fmt(t.fill.price)}.`;
  if (t.blocked) return `A trader wanted to ${t.position > 0 ? 'sell to' : 'buy from'} you, but you're at your ${MM.limit}-lot limit.`;
  return 'Nobody traded at those prices.';
}
