import { useMemo, useRef, useState } from 'react';
import { rupees } from '../lib/greeks';
import { coinText, judge, KELLY, kellyFraction, newKellyGame, pathAt, pct, scoreKelly, settle, type BetVerdict } from '../lib/kelly';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { GameFrame, Verdict, type GameProps } from './GameFrame';
import { Dice } from './icons';
import { Button } from './ui';

const VERDICT: Record<BetVerdict, string> = {
  sized: 'well sized',
  small: 'too small',
  big: 'on the big side',
  over: 'overbet',
  out: 'sat out, rightly',
  in: 'bet with no edge',
};

export function KellyGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const game = useMemo(() => newKellyGame(seededRng(seed)), [seed]);
  const total = game.coins.length * KELLY.flipsPerCoin;
  const [bets, setBets] = useState<number[][]>(() => game.coins.map(() => []));
  const [bank, setBank] = useState<number[]>([KELLY.start]);
  const [fraction, setFraction] = useState(0);
  const [last, setLast] = useState<{ win: boolean; stake: number; change: number } | null>(null);
  const finished = useRef(false);

  const played = bets.reduce((a, b) => a + b.length, 0);
  const coinIndex = Math.min(game.coins.length - 1, Math.floor(played / KELLY.flipsPerCoin));
  const flipIndex = played - coinIndex * KELLY.flipsPerCoin;
  const coin = game.coins[coinIndex];
  const now = bank[bank.length - 1];
  const coinDone = played > 0 && played % KELLY.flipsPerCoin === 0;
  const [pause, setPause] = useState(false);
  const over = played === total;
  /** The coin just finished, shown in the pause between coins. */
  const doneCoin = coinDone ? Math.floor((played - 1) / KELLY.flipsPerCoin) : -1;

  const flip = () => {
    if (pause || over) return;
    const win = game.flips[coinIndex][flipIndex];
    const after = settle(now, fraction, coin, win);
    setLast({ win, stake: Math.round(now * fraction), change: after - now });
    setBank((b) => [...b, after]);
    setBets((bs) => bs.map((b, i) => (i === coinIndex ? [...b, fraction] : b)));
    if ((played + 1) % KELLY.flipsPerCoin === 0) setPause(true);
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const s = scoreKelly(game, bets);
    const met = [s.checks.sized, s.checks.out, s.checks.over].filter(Boolean).length;
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, met, s.passed, s.bankroll);
    onProgress(p);
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
        firstPass,
        detail: `You turned ${rupees(KELLY.start, false)} into ${rupees(s.bankroll, false)}. The checks are about your sizing, not your luck.`,
        stat: { label: 'Bankroll', value: rupees(s.bankroll, false) },
        notes: [
          {
            title: 'The three checks',
            items: [
              { prompt: `Bets within half to one and a half times Kelly on the coins with an edge (${KELLY.sizedNeeded} of 20)`, shown: `${s.checks.sized ? 'Met' : 'Missed'}: ${s.sized} of 20` },
              { prompt: `Sat out the coin with no edge (${KELLY.outNeeded} of 10 flips)`, shown: `${s.checks.out ? 'Met' : 'Missed'}: ${s.out} of 10` },
              { prompt: 'Never bet more than twice Kelly', shown: `${s.checks.over ? 'Met' : 'Missed'}: ${s.over} overbet${s.over === 1 ? '' : 's'}` },
            ],
          },
          {
            title: 'The same flips, sized by rule',
            items: [
              { prompt: 'Full Kelly on every flip', shown: rupees(pathAt(game, 1), false) },
              { prompt: 'Half Kelly', shown: rupees(pathAt(game, 0.5), false) },
              { prompt: 'Double Kelly', shown: rupees(pathAt(game, 2), false) },
            ],
          },
          {
            title: 'Why desks use half Kelly',
            items: [
              {
                prompt: 'Full Kelly grows fastest on average, but the ride is rough: it falls to half its peak at some point about half the time.',
                shown: 'Half Kelly keeps about three quarters of the growth, and halves its bankroll only about one time in eight. Your edge estimate is never exact, and overbetting costs far more than underbetting.',
              },
            ],
          },
        ],
      },
    });
  };

  const nextCoin = () => {
    if (over) {
      finish();
      return;
    }
    setPause(false);
    setLast(null);
  };

  const k = kellyFraction(game.coins[Math.max(0, doneCoin)]);
  const doneBets = doneCoin >= 0 ? bets[doneCoin] : [];
  const avg = doneBets.length ? doneBets.reduce((a, b) => a + b, 0) / doneBets.length : 0;
  const counts = doneBets.reduce<Record<string, number>>((acc, f) => {
    const v = judge(game.coins[doneCoin], f);
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <GameFrame
      unitId={unitId}
      done={played}
      total={total}
      counter={`Flip ${Math.min(played + 1, total)} of ${total}`}
      icon={<Dice className="h-3.5 w-3.5" />}
      tone="amber"
      started={played > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            You start with <b>{rupees(KELLY.start, false)}</b> and flip three biased coins, ten times each. Before each flip, pick what share of your bankroll to bet. A coin that pays 2 to 1 returns twice your stake as profit when it wins.
          </p>
          <p>
            The Kelly fraction grows your bankroll fastest: <b>(odds × win chance − lose chance) ÷ odds</b>. A coin that wins 60% at even money: (0.6 − 0.4) ÷ 1 = 20%. If that comes out at zero or below, there's no edge: bet nothing.
          </p>
          <p>You pass on how well you size, not on how lucky the flips are.</p>
        </>
      }
    >
      <section aria-label="Coin and bankroll" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">
            {pause || over ? `Coin ${doneCoin + 1} of ${game.coins.length} · done` : `Coin ${coinIndex + 1} of ${game.coins.length} · flip ${flipIndex + 1} of ${KELLY.flipsPerCoin}`}
          </p>
        </div>
        <p className="mt-1 text-lg font-extrabold text-ink">{coinText(pause || over ? game.coins[doneCoin] : coin)}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-ink-3">Bankroll</p>
            <p className="num text-3xl font-extrabold text-ink">{rupees(now, false)}</p>
          </div>
          <Spark values={bank} />
        </div>
        {last && (
          <p className={`mt-2 text-sm font-bold ${last.win ? 'text-good-ink' : last.stake ? 'text-bad-ink' : 'text-ink-3'}`} aria-live="polite">
            {last.stake === 0 ? `You sat out. The coin ${last.win ? 'won' : 'lost'}.` : last.win ? `Won: ${rupees(last.change)}` : `Lost: ${rupees(last.change)}`}
          </p>
        )}
      </section>

      {pause || over ? (
        <Verdict
          good={doneCoin >= 0 && (k === 0 ? (counts.out ?? 0) >= KELLY.outNeeded : (counts.sized ?? 0) >= 7 && !counts.over)}
          title={k === 0 ? 'That coin had no edge' : `Kelly for that coin: ${pct(k)}`}
          next={over ? 'See how you did' : 'Next coin'}
          onNext={nextCoin}
        >
          <p className="leading-relaxed text-ink-2">
            {k === 0
              ? `${coinText(game.coins[doneCoin])}: every rupee bet loses on average, so the right size is nothing.`
              : `You bet ${pct(avg)} on average. `}
            {Object.entries(counts)
              .map(([v, c]) => `${c} ${VERDICT[v as BetVerdict]}`)
              .join(', ')}
            .
          </p>
        </Verdict>
      ) : (
        <section aria-label="Your bet" className="mt-4">
          <p className="mb-2 text-sm font-bold text-ink-2">
            Bet <b className="num text-ink">{pct(fraction)}</b> of your bankroll: <b className="num text-ink">{rupees(Math.round(now * fraction), false)}</b>
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Share of bankroll to bet">
            {KELLY.chips.map((c) => {
              const f = c / 100;
              const on = Math.abs(f - fraction) < 1e-9;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFraction(f)}
                  className={`num min-w-[3.5rem] rounded-xl border-2 px-3 py-2 text-sm font-extrabold transition ${on ? 'border-amber bg-amber-soft text-amber-ink' : 'border-line bg-surface text-ink-2'}`}
                >
                  {c}%
                </button>
              );
            })}
          </div>
          <Button className="mt-4 w-full text-base" onClick={flip} disabled={now === 0}>
            {fraction === 0 ? 'Sit this flip out' : 'Flip'}
          </Button>
          {now === 0 && (
            <Button variant="secondary" className="mt-3 w-full" onClick={() => setBets(game.coins.map((_, i) => [...bets[i], ...Array(KELLY.flipsPerCoin - bets[i].length).fill(0)]))}>
              Bankrupt: skip to the end
            </Button>
          )}
        </section>
      )}
    </GameFrame>
  );
}

/** A small line of the bankroll so far. */
function Spark({ values }: { values: number[] }) {
  const W = 120;
  const H = 40;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const n = Math.max(values.length - 1, 1);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / n) * W).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-28" aria-hidden="true">
      <path d={d} fill="none" className="stroke-amber" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
