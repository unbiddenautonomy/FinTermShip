import { useMemo, useRef, useState } from 'react';
import { settleFocus } from '../lib/choose';
import { points } from '../lib/market';
import {
  BEST_TURNS_NEEDED,
  DECK,
  HEADLINE,
  isHeadlineTurn,
  LEVELS,
  levelChecks,
  levelFair,
  newLevelGame,
  playLevelTurn,
  rivalQuote,
  scoreLevel,
  shownAt,
  STEP,
  type CheckId,
  type LevelGame,
  type LevelNo,
  type LevelScore,
  type LevelTurn,
} from '../lib/mmlevels';
import { recordRound } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { finishLesson } from '../lib/scheduler';
import type { Quote } from '../lib/market';
import { GameFrame, type GameProps } from './GameFrame';
import { Dice } from './icons';
import { Button, Stepper } from './ui';

/** Prices to two decimals at most, without trailing zeros. */
const fmt = (x: number) => String(Math.round(x * 100) / 100);
/** Fair value to one decimal. */
const fair1 = (x: number) => String(Math.round(x * 10) / 10);
const lots = (n: number) => (n === 0 ? 'flat' : `${n > 0 ? 'long' : 'short'} ${Math.abs(n)} lot${Math.abs(n) === 1 ? '' : 's'}`);
const lotWord = (n: number) => `${n} lot${n === 1 ? '' : 's'}`;

/** The starting quote: fair value before anything is shown, 1 point wide. */
function startQuote(game: LevelGame): Quote {
  const mid = Math.floor(levelFair(game, 1));
  return { bid: mid, ask: mid + 1 };
}

export function MarketLevelGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit, level }: GameProps & { level: LevelNo }) {
  const spec = LEVELS[level];
  const game = useMemo(() => newLevelGame(level, seededRng(seed)), [level, seed]);
  const [turns, setTurns] = useState<LevelTurn[]>([]);
  const [quote, setQuote] = useState<Quote>(() => startQuote(game));
  const [phase, setPhase] = useState<'quote' | 'result'>('quote');
  const finished = useRef(false);

  const last = turns[turns.length - 1];
  const position = last?.position ?? 0;
  const turn = phase === 'quote' ? turns.length + 1 : turns.length;
  const over = phase === 'result' && turn === spec.turns;
  const shown = over ? spec.count : phase === 'quote' ? shownAt(level, turn) : shownAt(level, turn + 1);
  const revealedNow = phase === 'result' && spec.revealAfter.includes(turn);
  const maxPrice = spec.source === 'cards' ? 45 : 30;
  const rival = level === 5 && phase === 'quote' ? rivalQuote(levelFair(game, turn)) : null;
  const headlineDue = phase === 'quote' && isHeadlineTurn(game, turn);
  const headlineNow = phase === 'result' && isHeadlineTurn(game, turn);

  const nudge = (side: 'bid' | 'ask' | 'both', d: number) =>
    setQuote((q) => {
      let { bid, ask } = q;
      if (side === 'bid' || side === 'both') bid += d;
      if (side === 'ask' || side === 'both') ask += d;
      bid = Math.max(0, bid);
      ask = Math.min(maxPrice, ask);
      if (ask - bid < STEP) {
        if (side === 'bid') ask = bid + STEP;
        else bid = ask - STEP;
      }
      return { bid, ask };
    });

  const submit = () => {
    setTurns((t) => [...t, playLevelTurn(game, t.length + 1, quote, position)]);
    setPhase('result');
  };

  const finish = (all: LevelTurn[]) => {
    if (finished.current) return;
    finished.current = true;
    const s = scoreLevel(game, all);
    const ids = levelChecks(level);
    const met = ids.filter((id) => s.checks[id]).length;
    const before = progress.drills?.[unitId];
    let p = recordRound(progress, unitId, met, s.passed, today, s.pnl);
    p = settleFocus(p);
    const xp = 5 + 2 * met + (s.passed ? 5 : 0);
    p = finishLesson(p, today, xp);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: met,
      firstTryTotal: ids.length,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed: s.passed,
        firstPass: s.passed && !before?.passed,
        detail: `The total was ${s.total}. You ended ${lots(s.position)}, and made ${points(s.pnl)} points.`,
        stat: { label: 'P&L', value: points(s.pnl) },
        notes: reviewNotes(game, all, s),
      },
    });
  };

  const next = () => {
    if (over) finish(turns);
    else setPhase('quote');
  };

  const width = quote.ask - quote.bid;
  const mid = (quote.bid + quote.ask) / 2;
  const left = DECK.filter((c) => !game.items.slice(0, shown).includes(c));

  return (
    <GameFrame
      unitId={unitId}
      done={turns.length}
      total={spec.turns}
      counter={`Turn ${Math.min(turn, spec.turns)} of ${spec.turns}`}
      icon={<Dice className="h-3.5 w-3.5" />}
      rules={<Rules level={level} />}
      started={turns.length > 0}
      onQuit={onQuit}
    >
      <section aria-label={spec.source === 'cards' ? 'Cards' : 'Dice'} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {game.items.map((d, i) => (
            <span
              key={i}
              className={`num flex items-center justify-center text-2xl font-extrabold ${spec.source === 'cards' ? 'h-16 w-11 rounded-lg' : 'h-14 w-14 rounded-2xl'} ${
                i < shown ? 'animate-pop bg-ink text-bg' : 'border-2 border-dashed border-line text-ink-3'
              }`}
              aria-label={i < shown ? `${spec.source === 'cards' ? 'Card' : 'Die'} ${i + 1}: ${d}` : `${spec.source === 'cards' ? 'Card' : 'Die'} ${i + 1}: hidden`}
            >
              {i < shown ? d : '?'}
            </span>
          ))}
        </div>
        {spec.source === 'cards' && (
          <p className="mt-3 text-center text-sm text-ink-3">
            Left in the deck: <span className="num font-bold text-ink-2">{left.join(' ')}</span>
          </p>
        )}
        {game.headline && game.headline.turn < turn + (phase === 'result' ? 1 : 0) && (
          <p className="mt-2 text-center text-sm text-ink-3">
            Headline: the total moves <b className="text-ink-2">{game.headline.shift > 0 ? `up ${game.headline.shift}` : `down ${-game.headline.shift}`}</b>.
          </p>
        )}
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-ink-3">Position</span>
          <span className="num font-extrabold text-ink">
            {lots(position)}
            {spec.riskLimit && <span className="font-bold text-ink-3"> · limit {spec.riskLimit}</span>}
          </span>
        </div>
      </section>

      {phase === 'quote' ? (
        <section aria-label="Your quote" className="mt-4 space-y-3">
          {headlineDue && (
            <div className="animate-pop rounded-2xl bg-amber-soft p-4">
              <p className="font-extrabold text-ink">A headline is due at the end of this turn.</p>
              <p className="mt-1 text-sm text-ink-2">It will move the total 3 or 4 points, up or down. Fast traders already know which.</p>
            </div>
          )}
          {rival && (
            <div className="flex items-center justify-between rounded-2xl bg-sunken px-4 py-3 text-sm">
              <span className="font-bold text-ink-2">Rival's quote</span>
              <span className="num text-lg font-extrabold text-ink">
                {fmt(rival.bid)} / {fmt(rival.ask)}
              </span>
            </div>
          )}
          <Stepper label="Bid: you buy at" value={quote.bid} onDown={() => nudge('bid', -STEP)} onUp={() => nudge('bid', STEP)} />
          <Stepper label="Ask: you sell at" value={quote.ask} onDown={() => nudge('ask', -STEP)} onUp={() => nudge('ask', STEP)} />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-ink-3">
              Spread <b className="num text-ink-2">{fmt(width)}</b> · mid <b className="num text-ink-2">{fmt(mid)}</b>
            </span>
            <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => nudge('both', -STEP)}>
              Both −{STEP}
            </Button>
            <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => nudge('both', STEP)}>
              Both +{STEP}
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
              <p className="font-extrabold text-ink">{tradeLine(last, spec.limit)}</p>
              <p className="mt-1 text-sm text-ink-2">Now {lots(last.position)}.</p>
            </div>
            {headlineNow && game.headline && (
              <div className="animate-pop rounded-2xl bg-ink p-4 text-bg">
                <p className="font-extrabold">
                  Headline: the total moves {game.headline.shift > 0 ? 'up' : 'down'} {Math.abs(game.headline.shift)}.
                </p>
                <p className="mt-1 text-sm opacity-80">Re-centre your quotes on the new fair value.</p>
              </div>
            )}
            {revealedNow && (
              <div className="animate-pop rounded-2xl bg-ink p-4 text-bg">
                <p className="font-extrabold">
                  {spec.source === 'cards' ? 'Card' : 'Die'} {shown} comes up {game.items[shown - 1]}.
                </p>
                <p className="mt-1 text-sm opacity-80">Move your quotes to the new fair value.</p>
              </div>
            )}
            {over && (
              <div className="animate-pop rounded-2xl bg-ink p-4 text-bg">
                <p className="font-extrabold">
                  {spec.source === 'cards' ? 'Last card' : 'Last die'}: {game.items[spec.count - 1]}. The total is {scoreLevel(game, turns).total}.
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
                {t.rival && <span className="text-ink-3"> · rival {fmt(t.rival.bid)} / {fmt(t.rival.ask)}</span>}
              </span>
              <span className="num shrink-0 font-bold text-ink-2">
                {t.fill
                  ? `${t.fill.side} ${t.fill.lots > 1 ? `${t.fill.lots} ` : ''}at ${fmt(t.fill.price)}`
                  : t.blocked
                    ? 'at limit'
                    : t.rivalFill
                      ? 'went to rival'
                      : 'no trade'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </GameFrame>
  );
}

function Rules({ level }: { level: LevelNo }) {
  const spec = LEVELS[level];
  if (level === 2)
    return (
      <>
        <p>
          The total is five cards from a deck of 1 to 10, one of each, dealt without putting them back. A card is shown after turns 2, 4, 6 and 8, and the last at the end, when
          every lot you hold is settled at the total.
        </p>
        <p>
          Fair value is the cards shown plus, for each hidden card, the average of the cards left in the deck. With nothing shown that's 5 × 5.5 = 27.5. Show the 10, and each of
          the four hidden cards is worth 45 ÷ 9 = 5, so fair value is 10 + 20 = 30.
        </p>
        <p>As before, some traders already know the next card. You can hold at most {spec.limit} lots either way.</p>
      </>
    );
  if (level === 3)
    return (
      <>
        <p>Three dice, as in the first game, shown after turns 3 and 6 and at the end. Fair value is the dice shown plus 3.5 for each hidden die.</p>
        <p>
          One turn ends with a headline that moves the total 3 or 4 points, up or down. You'll see which turn before you quote. On that turn most traders already know the number,
          so quote at least {HEADLINE.minWidth} wide. After it, add the move to fair value.
        </p>
      </>
    );
  if (level === 4)
    return (
      <>
        <p>Three dice, as in the first game. Fair value is the dice shown plus 3.5 for each hidden die.</p>
        <p>
          Traders now deal 1 to 3 lots. The ones who already know the next die always deal 3, so a 3-lot trade is a warning. Risk wants you within {spec.riskLimit} lots after
          every turn; a trade that would take you past {spec.limit} is turned away.
        </p>
        <p>Lean your quotes against your position: lower both when you're long, raise both when you're short.</p>
      </>
    );
  return (
    <>
      <p>Three dice, as in the first game. Fair value is the dice shown plus 3.5 for each hidden die.</p>
      <p>
        A rival quotes fair value ± 1 every turn and never leans. Traders deal at the best bid or ask. If you're better, you get the whole trade; at the same price, a coin decides;
        behind it, you get nothing.
      </p>
      <p>
        Be at the best price on at least one side on {BEST_TURNS_NEEDED} of {spec.turns} turns, and don't beat the rival on both sides at once.
      </p>
    </>
  );
}

function tradeLine(t: LevelTurn, limit: number): string {
  if (t.fill) {
    const n = lotWord(t.fill.lots);
    return t.fill.side === 'sold' ? `A trader bought ${n} from you at ${fmt(t.fill.price)}.` : `A trader sold you ${n} at ${fmt(t.fill.price)}.`;
  }
  if (t.blocked) return `A trader wanted to deal, but it would have taken you past your ${limit}-lot limit.`;
  if (t.rivalFill) {
    const n = lotWord(t.rivalFill.lots);
    return t.rivalFill.side === 'sold' ? `A trader bought ${n} from the rival at ${fmt(t.rivalFill.price)}.` : `A trader sold the rival ${n} at ${fmt(t.rivalFill.price)}.`;
  }
  return 'Nobody traded at those prices.';
}

const CHECK_TEXT: Record<CheckId, (game: LevelGame, s: LevelScore) => { prompt: string; shown: string }> = {
  mid: (g, s) => {
    const spec = LEVELS[g.level];
    return {
      prompt: `Mid within ${spec.midTolerance} point${spec.midTolerance === 1 ? '' : 's'} of fair value on ${spec.midTurnsNeeded} of ${s.midOf} turns${g.headline ? ' (not counting the headline turn)' : ''}`,
      shown: `${s.checks.mid ? 'Met' : 'Missed'}: ${s.midTurns} of ${s.midOf}`,
    };
  },
  width: (g, s) => ({
    prompt: `Spread no wider than ${LEVELS[g.level].maxWidth} points${g.headline ? ' on the other turns' : ''}`,
    shown: `${s.checks.width ? 'Met' : 'Missed'}: widest was ${fmt(s.widest)}`,
  }),
  headline: (_g, s) => ({
    prompt: `At least ${HEADLINE.minWidth} wide on the headline turn`,
    shown: `${s.checks.headline ? 'Met' : 'Missed'}: you were ${fmt(s.headlineWidth ?? 0)} wide`,
  }),
  inventory: (g, s) => ({
    prompt: `Never more than ${LEVELS[g.level].riskLimit} lots either way`,
    shown: `${s.checks.inventory ? 'Met' : 'Missed'}: most was ${lotWord(s.maxPosition)}`,
  }),
  best: (g, s) => ({
    prompt: `At the best price on at least one side on ${BEST_TURNS_NEEDED} of ${LEVELS[g.level].turns} turns`,
    shown: `${s.checks.best ? 'Met' : 'Missed'}: ${s.bestTurns} of ${LEVELS[g.level].turns}`,
  }),
  inside: (_g, s) => ({
    prompt: 'Never better than the rival on both sides at once',
    shown: s.checks.inside ? 'Met' : `Missed: turn${s.insideTurns.length === 1 ? '' : 's'} ${s.insideTurns.join(', ')}`,
  }),
  flat: (g, s) => ({
    prompt: `End within ${lotWord(LEVELS[g.level].flatAtEnd)} of flat`,
    shown: `${s.checks.flat ? 'Met' : 'Missed'}: ended ${lots(s.position)}`,
  }),
};

/** The review: the checks, where the money went, and what this level was about. */
function reviewNotes(game: LevelGame, turns: LevelTurn[], s: LevelScore) {
  const spec = LEVELS[game.level];
  const edgeOf = (f: NonNullable<LevelTurn['fill']>) => (f.side === 'sold' ? f.price - s.total : s.total - f.price) * f.lots;
  let knew = 0;
  let rest = 0;
  let knewTrades = 0;
  for (const t of turns) {
    if (!t.fill) continue;
    if (t.fill.informed) {
      knew += edgeOf(t.fill);
      knewTrades++;
    } else rest += edgeOf(t.fill);
  }
  const notes = [
    { title: `The ${levelChecks(game.level).length} checks`, items: levelChecks(game.level).map((id) => CHECK_TEXT[id](game, s)) },
    {
      title: 'Where the money went',
      items: [
        { prompt: `Traders who knew what was coming (${knewTrades} trade${knewTrades === 1 ? '' : 's'})`, shown: `${points(knew)} points to you` },
        { prompt: 'Everyone else', shown: `${points(rest)} points to you` },
      ],
    },
  ];
  if (game.level === 2) {
    notes.push({
      title: 'Fair value as the cards came out',
      items: spec.revealAfter.map((after, i) => {
        const t = turns.find((x) => x.turn === after + 1);
        const seen = game.items.slice(0, i + 1);
        const naive = seen.reduce((a, b) => a + b, 0) + 5.5 * (spec.count - i - 1);
        return { prompt: `After ${seen.join(', ')}`, shown: `fair ${fair1(t?.fair ?? 0)}, not ${fair1(naive)} at 5.5 a card` };
      }),
    });
  }
  if (game.level === 3 && game.headline) {
    const h = turns.find((t) => t.turn === game.headline!.turn);
    notes.push({
      title: 'The headline turn',
      items: [
        {
          prompt: `Turn ${game.headline.turn}: the total moved ${game.headline.shift > 0 ? 'up' : 'down'} ${Math.abs(game.headline.shift)}`,
          shown: h?.fill ? `You ${h.fill.side} at ${fmt(h.fill.price)}, ${points(edgeOf(h.fill))} points to you` : 'Nobody traded with you',
        },
      ],
    });
  }
  if (game.level === 4) {
    const big = turns.filter((t) => t.fill && t.fill.lots === 3);
    if (big.length)
      notes.push({
        title: 'The 3-lot trades',
        items: big.map((t) => ({
          prompt: `Turn ${t.turn}: a trader ${t.fill!.side === 'sold' ? 'bought' : 'sold'} 3 at ${fmt(t.fill!.price)}`,
          shown: `${points(edgeOf(t.fill!))} points to you`,
        })),
      });
  }
  if (game.level === 5) {
    const won = turns.filter((t) => t.fill).length;
    const lost = turns.filter((t) => t.rivalFill).length;
    notes.push({
      title: 'You and the rival',
      items: [
        { prompt: `Trades you won (${won})`, shown: `${points(s.pnl)} points` },
        { prompt: `Trades the rival won (${lost})`, shown: `${points(s.rivalPnl)} points` },
      ],
    });
  }
  const off = turns.filter((t) => !isHeadlineTurn(game, t.turn) && Math.abs((t.quote.bid + t.quote.ask) / 2 - t.fair) > spec.midTolerance);
  if (off.length)
    notes.push({
      title: 'Turns off fair value',
      items: off.map((t) => ({
        prompt: `Turn ${t.turn}: fair value ${fair1(t.fair)}`,
        shown: `You quoted ${fmt(t.quote.bid)} / ${fmt(t.quote.ask)}, mid ${fmt((t.quote.bid + t.quote.ask) / 2)}`,
      })),
    });
  return notes;
}
