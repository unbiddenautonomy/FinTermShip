import { shuffle, type Rng } from './questions';
import type { DrillRecord, Progress } from './types';

/**
 * Timed drills: rounds of generated questions with typed answers.
 * 'num' answers are plain numbers, 'pct' answers are in percent (the % sign is optional),
 * and 'prob' answers are probabilities typed as a fraction, a decimal or a percentage.
 */
export type AnswerKind = 'num' | 'pct' | 'prob';

export interface DrillQuestion {
  prompt: string;
  answer: number;
  kind: AnswerKind;
  /** The answer as shown after a miss. */
  shown: string;
  /** How to get there, shown after every answer. */
  why: string;
  /** The question asks for a decimal, so a fraction is not accepted, and the decimal must be exact. */
  decimalOnly?: boolean;
}

export interface DrillSpec {
  count: number;
  /** Pass: at least this many right... */
  passRight: number;
  /** ...within this many seconds (time spent reading feedback does not count). */
  targetSec: number;
  /** What the round covers, shown on the unit card. */
  about: string;
  make: (rng: Rng) => DrillQuestion[];
}

// ---------- small maths helpers ----------

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function fracText(n: number, d: number): string {
  if (n === 0) return '0';
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/** Up to `dp` decimals, trailing zeros dropped. */
function dec(x: number, dp = 3): string {
  return String(Number(x.toFixed(dp)));
}

/** Indian digit grouping for whole numbers, e.g. 10,00,000. */
export function num(x: number): string {
  const neg = x < 0;
  const [whole, frac] = dec(Math.abs(x), 2).split('.');
  const grouped = whole.length > 3 ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}` : whole;
  return `${neg ? '−' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

const rupees = (x: number) => (x < 0 ? `−₹${num(-x)}` : `₹${num(x)}`);

function prob(n: number, d: number, prompt: string, why: string): DrillQuestion {
  const text = fracText(n, d);
  const shown = text.includes('/') ? `${text} (about ${Number((n / d).toPrecision(3))})` : text;
  return { prompt, answer: n / d, kind: 'prob', shown, why };
}

function plain(answer: number, prompt: string, why: string, unit: '' | '₹' = ''): DrillQuestion {
  return { prompt, answer, kind: 'num', shown: unit ? rupees(answer) : num(answer), why };
}

/** Every outcome of rolling `n` dice. */
function rolls(n: number): number[][] {
  let out: number[][] = [[]];
  for (let i = 0; i < n; i++) out = out.flatMap((r) => [1, 2, 3, 4, 5, 6].map((f) => [...r, f]));
  return out;
}

/** Fill a round from weighted templates, skipping repeated prompts. */
function round(rng: Rng, plan: [number, (rng: Rng) => DrillQuestion][]): DrillQuestion[] {
  const out: DrillQuestion[] = [];
  const seen = new Set<string>();
  for (const [times, make] of plan) {
    let made = 0;
    for (let guard = 0; made < times && guard < 50; guard++) {
      const q = make(rng);
      if (seen.has(q.prompt)) continue;
      seen.add(q.prompt);
      out.push(q);
      made++;
    }
  }
  return shuffle(out, rng);
}

// ---------- k1 Mental maths ----------

function mulOneDigit(rng: Rng): DrillQuestion {
  let a = int(rng, 12, 98);
  if (a % 10 === 0) a += 3;
  const b = int(rng, 3, 9);
  const tens = a - (a % 10);
  return plain(a * b, `${a} × ${b}`, `${tens} × ${b} + ${a % 10} × ${b} = ${tens * b} + ${(a % 10) * b} = ${num(a * b)}`);
}

function mulFriendly(rng: Rng): DrillQuestion {
  const type = pick(rng, ['eleven', 'quarter', 'five', 'hundred', 'fifteen'] as const);
  if (type === 'eleven') {
    const a = int(rng, 13, 89);
    return plain(a * 11, `${a} × 11`, `${a} × 10 + ${a} = ${a * 10} + ${a} = ${num(a * 11)}`);
  }
  if (type === 'quarter') {
    const a = 4 * int(rng, 3, 24);
    return plain(a * 25, `${a} × 25`, `× 25 is × 100 ÷ 4: ${a} ÷ 4 = ${a / 4}, so ${num(a * 25)}`);
  }
  if (type === 'five') {
    const t = int(rng, 1, 9);
    const a = 10 * t + 5;
    return plain(a * a, `${a} × ${a}`, `For a number ending in 5: ${t} × ${t + 1} = ${t * (t + 1)}, then add 25: ${num(a * a)}`);
  }
  if (type === 'hundred') {
    const a = int(rng, 91, 98);
    const b = int(rng, 91, 98);
    const x = 100 - a;
    const y = 100 - b;
    return plain(a * b, `${a} × ${b}`, `Both are near 100: ${a} − ${y} = ${a - y} hundreds, plus ${x} × ${y} = ${x * y}: ${num(a * b)}`);
  }
  const a = 2 * int(rng, 6, 29);
  return plain(a * 15, `${a} × 15`, `${a} × 10 + half of that: ${a * 10} + ${a * 5} = ${num(a * 15)}`);
}

function divide(rng: Rng): DrillQuestion {
  const d = pick(rng, [3, 4, 6, 7, 8, 9, 12, 15, 25]);
  const q = int(rng, 12, d >= 12 ? 40 : 99);
  return plain(q, `${num(d * q)} ÷ ${d}`, `${d} × ${q} = ${num(d * q)}`);
}

function decimalTimes(rng: Rng): DrillQuestion {
  const type = pick(rng, ['half', 'oneHalf', 'quarter', 'fifth'] as const);
  if (type === 'half') {
    const b = 2 * int(rng, 7, 49);
    return plain(b / 2, `0.5 × ${b}`, `0.5 is a half: ${b} ÷ 2 = ${b / 2}`);
  }
  if (type === 'oneHalf') {
    const b = 2 * int(rng, 7, 39);
    return plain(b * 1.5, `1.5 × ${b}`, `${b} + half of ${b} = ${b} + ${b / 2} = ${b * 1.5}`);
  }
  if (type === 'quarter') {
    const b = 4 * int(rng, 4, 40);
    return plain(b / 4, `0.25 × ${b}`, `0.25 is a quarter: ${b} ÷ 4 = ${b / 4}`);
  }
  const b = 5 * int(rng, 4, 40);
  return plain(b / 5, `0.2 × ${b}`, `0.2 is a fifth: ${b} ÷ 5 = ${b / 5}`);
}

function addSubtract(rng: Rng): DrillQuestion {
  const a = int(rng, 240, 980);
  const b = int(rng, 112, 480);
  if (rng() < 0.5) {
    const r = Math.ceil(b / 100) * 100;
    return plain(a + b, `${a} + ${b}`, `${a} + ${r} − ${r - b} = ${num(a + r)} − ${r - b} = ${num(a + b)}`);
  }
  const big = Math.max(a, b + 120);
  const r = Math.ceil(b / 100) * 100;
  return plain(big - b, `${big} − ${b}`, `${big} − ${r} + ${r - b} = ${big - r} + ${r - b} = ${num(big - b)}`);
}

// ---------- k2 Percentages, fractions and basis points ----------

function percentOf(rng: Rng): DrillQuestion {
  for (;;) {
    const p = pick(rng, [5, 10, 12.5, 15, 20, 25, 30, 40, 60, 75]);
    const base = pick(rng, [40, 80, 120, 160, 200, 240, 320, 360, 400, 480, 640, 800, 1200, 1600, 2400]);
    const ans = (p * base) / 100;
    if (!Number.isInteger(ans * 2)) continue;
    const tenth = num(base / 10);
    const why =
      p === 12.5
        ? `12.5% is 1/8: ${num(base)} ÷ 8 = ${num(ans)}`
        : p === 25
          ? `25% is 1/4: ${num(base)} ÷ 4 = ${num(ans)}`
          : p === 10
            ? `10% is a tenth: ${num(base)} ÷ 10 = ${num(ans)}`
            : p === 5
              ? `10% is ${tenth}, and 5% is half of that: ${num(ans)}`
              : `10% is ${tenth}, so ${p}% is ${p / 10} × ${tenth} = ${num(ans)}`;
    return plain(ans, `${p}% of ${num(base)}`, why);
  }
}

const FRACTIONS: [number, number][] = [
  [1, 8], [3, 8], [5, 8], [7, 8], [1, 16], [3, 16], [5, 16], [1, 20], [3, 20], [7, 20], [1, 40], [3, 40], [2, 5], [3, 5], [1, 25], [3, 25], [3, 4],
];

function fractionToDecimal(rng: Rng): DrillQuestion {
  const [n, d] = pick(rng, FRACTIONS);
  const unit = 1 / d;
  return {
    ...plain(n / d, `${n}/${d} as a decimal`, n === 1 ? `1 ÷ ${d} = ${dec(unit, 4)}` : `1/${d} = ${dec(unit, 4)}, so ${n}/${d} = ${n} × ${dec(unit, 4)} = ${dec(n / d, 4)}`),
    shown: dec(n / d, 4),
    decimalOnly: true,
  };
}

function percentChange(rng: Rng): DrillQuestion {
  for (;;) {
    const a = pick(rng, [40, 50, 80, 120, 160, 200, 250, 400, 500, 800]);
    const c = pick(rng, [-50, -40, -25, -20, -15, -10, -5, 5, 10, 12.5, 15, 20, 25, 40, 50]);
    const b = a * (1 + c / 100);
    if (!Number.isInteger(b)) continue;
    return {
      prompt: `${num(a)} to ${num(b)}: % change? (− for a fall)`,
      answer: c,
      kind: 'pct',
      shown: `${num(c)}%`,
      why: `(${num(b)} − ${num(a)}) ÷ ${num(a)} = ${num(b - a)} ÷ ${num(a)} = ${num(c)}%`,
    };
  }
}

function basisPoints(rng: Rng): DrillQuestion {
  if (rng() < 0.5) {
    const x = pick(rng, [0.05, 0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1.25, 2]);
    return plain(Math.round(x * 100), `${x}% in basis points`, `1% is 100 bp, so ${x}% = ${Math.round(x * 100)} bp`);
  }
  const bp = pick(rng, [5, 10, 20, 25, 50]);
  const lakh = pick(rng, [10, 20, 40, 50, 80]);
  const ans = (lakh * 100_000 * bp) / 10_000;
  return plain(ans, `${bp} bp of ₹${lakh} lakh, in rupees`, `₹${lakh} lakh = ${rupees(lakh * 100_000)}. 1 bp is 1/10,000, so ${bp} bp = ${rupees(lakh * 100_000)} × ${bp} ÷ 10,000 = ${rupees(ans)}`, '₹');
}

function percentReverse(rng: Rng): DrillQuestion {
  for (;;) {
    const p = pick(rng, [10, 20, 25, 40, 50, 75]);
    const whole = 20 * int(rng, 2, 40);
    const part = (whole * p) / 100;
    if (!Number.isInteger(part)) continue;
    return plain(whole, `${num(part)} is ${p}% of what?`, `${num(part)} ÷ ${p / 100} = ${num(whole)}`);
  }
}

// ---------- k3 Probability: coins, dice and cards ----------

function diceTotal(rng: Rng): DrillQuestion {
  const s = pick(rng, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const hits = rolls(2).filter(([a, b]) => a + b === s);
  return prob(hits.length, 36, `Two dice: chance the total is ${s}?`, `${hits.length} of the 36 outcomes add to ${s}: ${hits.map(([a, b]) => `${a}+${b}`).join(', ')}`);
}

function diceTotalAtLeast(rng: Rng): DrillQuestion {
  const s = pick(rng, [9, 10, 11]);
  const hits = rolls(2).filter(([a, b]) => a + b >= s);
  return prob(hits.length, 36, `Two dice: chance the total is ${s} or more?`, `${hits.length} of the 36 outcomes add to ${s} or more`);
}

function atLeastOneSix(rng: Rng): DrillQuestion {
  const n = pick(rng, [2, 3]);
  const all = rolls(n);
  const hits = all.filter((r) => r.includes(6)).length;
  return prob(hits, all.length, `Roll ${n} dice: chance of at least one six?`, `1 − chance of no six = 1 − (5/6)^${n} = 1 − ${5 ** n}/${6 ** n} = ${fracText(hits, all.length)}`);
}

function coinsExactly(rng: Rng): DrillQuestion {
  const n = pick(rng, [3, 4, 5]);
  const k = int(rng, 1, n - 1);
  const ways = choose(n, k);
  return prob(ways, 2 ** n, `Flip ${n} coins: chance of exactly ${k} head${k === 1 ? '' : 's'}?`, `${ways} of the ${2 ** n} equally likely sequences have ${k} head${k === 1 ? '' : 's'}`);
}

function coinsAtLeastOne(rng: Rng): DrillQuestion {
  const n = pick(rng, [2, 3, 4]);
  const total = 2 ** n;
  return prob(total - 1, total, `Flip ${n} coins: chance of at least one head?`, `Only all tails misses: 1 − 1/${total} = ${total - 1}/${total}`);
}

const ONE_CARD: [string, number][] = [
  ['a heart', 13],
  ['an ace', 4],
  ['a picture card (J, Q or K)', 12],
  ['a red king', 2],
  ['a heart or a king', 16],
  ['a black ace', 2],
];

function oneCard(rng: Rng): DrillQuestion {
  const [what, count] = pick(rng, ONE_CARD);
  const why = what === 'a heart or a king' ? '13 hearts plus the 3 other kings = 16 of 52 cards' : `${count} of the 52 cards`;
  return prob(count, 52, `One card from a full deck: chance it is ${what}?`, why);
}

function twoCards(rng: Rng): DrillQuestion {
  const [what, count] = pick(rng, [['aces', 4], ['hearts', 13], ['kings', 4], ['black cards', 26]] as [string, number][]);
  const n = count * (count - 1);
  return prob(n, 52 * 51, `Two cards, no replacement: chance both are ${what}?`, `${count}/52 × ${count - 1}/51 = ${fracText(n, 52 * 51)}`);
}

function oneDie(rng: Rng): DrillQuestion {
  const [what, faces] = pick(rng, [
    ['an even number', [2, 4, 6]],
    ['more than 4', [5, 6]],
    ['a prime (2, 3 or 5)', [2, 3, 5]],
    ['not a six', [1, 2, 3, 4, 5]],
  ] as [string, number[]][]);
  return prob(faces.length, 6, `One die: chance of ${what}?`, `${faces.length} of the 6 faces`);
}

function twoDiceCompare(rng: Rng): DrillQuestion {
  if (rng() < 0.5) {
    return prob(6, 36, 'Two dice: chance they show the same number?', 'Whatever the first shows, the second matches it 1 time in 6');
  }
  const hits = rolls(2).filter(([a, b]) => a > b).length;
  return prob(hits, 36, 'Two dice: chance the first is higher than the second?', `6 of 36 are ties; the other 30 split evenly, so ${hits}/36`);
}

// ---------- k4 Expected value ----------

function diceAverage(rng: Rng): DrillQuestion {
  const n = int(rng, 1, 4);
  return plain(3.5 * n, n === 1 ? 'Expected value of one die roll?' : `Expected total of ${n} dice?`, n === 1 ? '(1 + 2 + 3 + 4 + 5 + 6) ÷ 6 = 3.5' : `Each die averages 3.5, so ${n} × 3.5 = ${3.5 * n}`);
}

function payPerPip(rng: Rng): DrillQuestion {
  const k = pick(rng, [2, 4, 6, 10, 20, 50]);
  return plain(3.5 * k, `Roll a die and win ₹${k} times the number. Fair price to play, in ₹?`, `The average roll is 3.5, so ${k} × 3.5 = ${rupees(3.5 * k)}`, '₹');
}

const BETS: [string, number, number][] = [
  ['1/4', 1, 4],
  ['1/3', 1, 3],
  ['2/5', 2, 5],
  ['1/2', 1, 2],
  ['3/5', 3, 5],
  ['2/3', 2, 3],
];

function betValue(rng: Rng): DrillQuestion {
  const [p, n, d] = pick(rng, BETS);
  const win = d * int(rng, 2, 30) * 10;
  const lose = d * int(rng, 1, 20) * 10;
  const a = (win * n) / d;
  const b = (lose * (d - n)) / d;
  return plain(
    a - b,
    `You win ₹${num(win)} with chance ${p} and lose ₹${num(lose)} otherwise. Expected profit per bet, in ₹?`,
    `${p} × ${num(win)} − ${fracText(d - n, d)} × ${num(lose)} = ${num(a)} − ${num(b)} = ${rupees(a - b)}`,
    '₹',
  );
}

function fairSix(rng: Rng): DrillQuestion {
  const x = pick(rng, [60, 100, 120, 300, 600]);
  return plain(x / 6, `A six pays ₹${x}; anything else pays nothing. Fair price to roll, in ₹?`, `Chance of a six is 1/6: ${x} ÷ 6 = ${rupees(x / 6)}`, '₹');
}

function waiting(rng: Rng): DrillQuestion {
  const [prompt, n, why] = pick(rng, [
    ['Expected flips of a fair coin until the first head?', 2, 'Each flip works with chance 1/2, so you wait 1 ÷ 1/2 = 2 flips on average'],
    ['Expected rolls of a die until the first six?', 6, 'Each roll works with chance 1/6, so you wait 6 rolls on average'],
    ['Expected rolls of a die until a 5 or a 6?', 3, 'Each roll works with chance 2/6 = 1/3, so you wait 3 rolls on average'],
  ] as [string, number, string][]);
  return plain(n, prompt, why);
}

function countSixes(rng: Rng): DrillQuestion {
  const n = pick(rng, [6, 12, 18, 30, 60, 90]);
  return plain(n / 6, `Expected number of sixes in ${n} rolls of a die?`, `Each roll is a six with chance 1/6: ${n} × 1/6 = ${n / 6}`);
}

function classicValue(rng: Rng): DrillQuestion {
  return pick(rng, [
    plain(
      4.25,
      'Roll a die. You may roll once more, but then you must keep the second roll. Expected value if you play well?',
      'Reroll on 1, 2 or 3 (below the 3.5 average). Half the time you keep 4, 5 or 6 (average 5); half the time you get 3.5. (5 + 3.5) ÷ 2 = 4.25',
    ),
    {
      ...plain(161 / 36, 'Expected value of the higher of two dice?', 'The higher is k with chance (2k − 1)/36. Adding k × (2k − 1)/36 for k = 1 to 6 gives 161/36, about 4.47'),
      shown: '161/36 (about 4.47)',
    },
    {
      ...plain(35 / 12, 'Variance of one die roll?', 'Average of the squares is 91/6; the square of the average is 3.5² = 12.25. 91/6 − 12.25 = 35/12, about 2.92'),
      shown: '35/12 (about 2.92)',
    },
  ]);
}

// ---------- k5 Conditional probability and Bayes ----------

function atLeastOneHead(rng: Rng): DrillQuestion {
  const n = pick(rng, [2, 3]);
  const total = 2 ** n;
  return prob(1, total - 1, `${n} coins are flipped. At least one is heads. Chance ${n === 2 ? 'both are' : 'all three are'} heads?`, `${total - 1} sequences have a head, and only 1 of them is all heads`);
}

function firstDieGivenTotal(rng: Rng): DrillQuestion {
  for (;;) {
    const s = int(rng, 4, 10);
    const a = int(rng, 1, 6);
    const hits = rolls(2).filter(([x, y]) => x + y === s);
    if (!hits.some(([x]) => x === a)) continue;
    return prob(1, hits.length, `Two dice add to ${s}. Chance the first shows ${a}?`, `${hits.length} outcomes add to ${s} (${hits.map(([x, y]) => `${x}+${y}`).join(', ')}), and 1 of them starts with ${a}`);
  }
}

function nextCard(rng: Rng): DrillQuestion {
  const [what, left, how] = pick(rng, [
    ['an ace', 3, 'aces'],
    ['a king', 3, 'kings'],
    ['a heart', 12, 'hearts'],
  ] as [string, number, string][]);
  return prob(left, 51, `You draw ${what} and keep it. Chance the next card is also ${what}?`, `${left} ${how} are left among 51 cards: ${fracText(left, 51)}`);
}

const BAYES: { story: (b: number, h: number, f: number) => string; things: string; real: string; hit: string }[] = [
  {
    story: (b, h, f) => `${b}% of stocks double this year. A screen flags ${h}% of those and ${f}% of the rest. A stock is flagged. Chance it doubles?`,
    things: 'stocks',
    real: 'double',
    hit: 'flagged',
  },
  {
    story: (b, h, f) => `Big up days are ${b}% of days. A signal fires on ${h}% of big up days and ${f}% of other days. It fired today. Chance today is a big up day?`,
    things: 'days',
    real: 'are big up days',
    hit: 'with a signal',
  },
];

function bayes(rng: Rng): DrillQuestion {
  const b = pick(rng, [1, 2, 5, 10]);
  const h = pick(rng, [60, 80, 90]);
  const f = pick(rng, [5, 10, 20]);
  // Out of 10,000: 100b are the real thing, of which b×h are flagged; (100 − b)×f others are flagged.
  const x = b * h;
  const y = (100 - b) * f;
  const s = pick(rng, BAYES);
  const q = prob(
    x,
    x + y,
    s.story(b, h, f),
    `Out of 10,000 ${s.things}: ${num(100 * b)} ${s.real}, and ${h}% of those = ${num(x)} ${s.hit}. Of the other ${num(10_000 - 100 * b)}, ${f}% = ${num(y)} ${s.hit} too. So ${num(x)} ÷ ${num(x + y)} ≈ ${dec((100 * x) / (x + y), 1)}%`,
  );
  return { ...q, shown: `about ${dec((100 * x) / (x + y), 1)}%` };
}

function independent(rng: Rng): DrillQuestion {
  const a = pick(rng, [2, 3, 4, 5, 6]);
  const b = pick(rng, [2, 3, 4, 5]);
  if (rng() < 0.5) {
    return prob(a * b, 100, `A and B are independent. P(A) = 0.${a}, P(B) = 0.${b}. Chance both happen?`, `0.${a} × 0.${b} = ${dec((a * b) / 100, 2)}`);
  }
  const n = 10 * a + 10 * b - a * b;
  return prob(n, 100, `A and B are independent. P(A) = 0.${a}, P(B) = 0.${b}. Chance at least one happens?`, `1 − (1 − 0.${a})(1 − 0.${b}) = 1 − ${dec(((10 - a) * (10 - b)) / 100, 2)} = ${dec(n / 100, 2)}`);
}

// ---------- k6 Counting and combinations ----------

function chooseStocks(rng: Rng): DrillQuestion {
  const n = int(rng, 5, 10);
  const k = int(rng, 2, Math.min(4, n - 2));
  const top = Array.from({ length: k }, (_, i) => n - i).join(' × ');
  return plain(choose(n, k), `Ways to choose ${k} stocks from ${n}?`, `(${top}) ÷ ${k}! = ${num(choose(n, k))}`);
}

function ranking(rng: Rng): DrillQuestion {
  const n = int(rng, 4, 8);
  return plain(n * (n - 1) * (n - 2), `Ways to give 1st, 2nd and 3rd place among ${n} traders?`, `${n} × ${n - 1} × ${n - 2} = ${n * (n - 1) * (n - 2)}`);
}

function arrange(rng: Rng): DrillQuestion {
  const n = int(rng, 4, 6);
  return plain(factorial(n), `Ways to line up ${n} different orders in a queue?`, `${n}! = ${Array.from({ length: n }, (_, i) => n - i).join(' × ')} = ${factorial(n)}`);
}

function headsWays(rng: Rng): DrillQuestion {
  const n = int(rng, 4, 7);
  const k = int(rng, 2, n - 2);
  return plain(choose(n, k), `Ways to get exactly ${k} heads in ${n} flips?`, `Choose which ${k} of the ${n} flips are heads: ${n}C${k} = ${choose(n, k)}`);
}

function gridPaths(rng: Rng): DrillQuestion {
  const a = int(rng, 2, 4);
  const b = int(rng, 2, 4);
  return plain(choose(a + b, a), `Paths ${a} steps right and ${b} steps up, moving only right or up?`, `Pick which ${a} of the ${a + b} steps go right: ${a + b}C${a} = ${choose(a + b, a)}`);
}

function pairsFromDeck(): DrillQuestion {
  return plain(1326, 'Ways to pick 2 cards from a 52-card deck?', '52 × 51 ÷ 2 = 1,326');
}

// ---------- the drills ----------

export const DRILLS: Record<string, DrillSpec> = {
  k1: {
    count: 10,
    passRight: 9,
    targetSec: 150,
    about: 'Multiply, divide, add and subtract in your head, with tricks for 11s, 25s, numbers ending in 5 and numbers near 100.',
    make: (rng) => round(rng, [[3, mulOneDigit], [2, mulFriendly], [2, divide], [1, decimalTimes], [2, addSubtract]]),
  },
  k2: {
    count: 10,
    passRight: 9,
    targetSec: 180,
    about: 'Percentages of a number, percentage change, fractions as decimals, and basis points on rupee amounts.',
    make: (rng) => round(rng, [[3, percentOf], [2, fractionToDecimal], [2, percentChange], [2, basisPoints], [1, percentReverse]]),
  },
  k3: {
    count: 8,
    passRight: 7,
    targetSec: 300,
    about: 'Chances with coins, dice and a deck of cards. Type a fraction such as 1/6, a decimal or a percentage.',
    make: (rng) =>
      round(rng, [[1, diceTotal], [1, (r) => (r() < 0.5 ? diceTotalAtLeast(r) : twoDiceCompare(r))], [1, atLeastOneSix], [1, coinsExactly], [1, coinsAtLeastOne], [1, oneCard], [1, twoCards], [1, oneDie]]),
  },
  k4: {
    count: 8,
    passRight: 7,
    targetSec: 360,
    about: 'The average result of dice games and bets: fair prices, expected profit and waiting times.',
    make: (rng) => round(rng, [[1, diceAverage], [1, payPerPip], [2, betValue], [1, fairSix], [1, waiting], [1, countSixes], [1, classicValue]]),
  },
  k5: {
    count: 6,
    passRight: 5,
    targetSec: 360,
    about: 'Chances that change with what you already know, and Bayes: how likely a flagged stock or a fired signal is to be right.',
    make: (rng) => round(rng, [[1, atLeastOneHead], [1, firstDieGivenTotal], [1, nextCard], [2, bayes], [1, independent]]),
  },
  k6: {
    count: 8,
    passRight: 7,
    targetSec: 300,
    about: 'Counting choices, rankings and paths, and using counts to find card chances.',
    make: (rng) => round(rng, [[2, chooseStocks], [1, ranking], [1, arrange], [1, headsWays], [1, gridPaths], [1, twoCards], [1, () => pairsFromDeck()]]),
  },
};

// ---------- answers ----------

export interface Parsed {
  value: number;
  /** Decimal places typed; Infinity for a fraction (which must be exact). */
  decimals: number;
  fraction: boolean;
  percent: boolean;
}

export function parseAnswer(raw: string): Parsed | null {
  let s = raw.trim().toLowerCase().replace(/[\s,₹]/g, '').replace(/^rs\.?/, '').replace(/[−–—]/g, '-');
  let percent = false;
  if (s.endsWith('%')) {
    percent = true;
    s = s.slice(0, -1);
  }
  const f = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (f) {
    const d = Number(f[2]);
    if (!d) return null;
    return { value: Number(f[1]) / d, decimals: Infinity, fraction: true, percent };
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const dot = s.indexOf('.');
  return { value: Number(s), decimals: dot < 0 ? 0 : s.length - dot - 1, fraction: false, percent };
}

export type Verdict = 'right' | 'wrong' | 'fraction' | 'unreadable';

/**
 * A typed answer is right when it equals the answer, or rounds to it at the
 * precision typed (0.17 for 1/6) while staying close (within 5% for chances,
 * 2% otherwise), so "0.00" can't pass for 1/221.
 */
export function checkAnswer(q: DrillQuestion, raw: string): Verdict {
  const a = parseAnswer(raw);
  if (!a) return 'unreadable';
  if (a.fraction && q.decimalOnly) return 'fraction';
  let value = a.value;
  let decimals = a.decimals;
  if (q.kind === 'prob' && a.percent) {
    value /= 100;
    decimals += 2;
  }
  const diff = Math.abs(value - q.answer);
  if (diff < 1e-9) return 'right';
  if (!Number.isFinite(decimals) || q.decimalOnly) return 'wrong';
  const roundTol = 0.5 * 10 ** -decimals + 1e-9;
  const relTol = (q.kind === 'prob' ? 0.05 : 0.02) * Math.abs(q.answer);
  return diff <= roundTol && diff <= relTol ? 'right' : 'wrong';
}

export const ANSWER_HINT: Record<AnswerKind, string> = {
  num: 'Type a number',
  pct: 'Type the % change',
  prob: 'A fraction like 1/6, a decimal or a %',
};

// ---------- records ----------

export function drillPassed(p: Progress, unitId: string): boolean {
  return !!p.drills?.[unitId]?.passed;
}

/** A drill holds up the path until it is passed, unless it was skipped for today. */
export function drillBlocks(p: Progress, unitId: string, today: string): boolean {
  const r = p.drills?.[unitId];
  return !r?.passed && r?.snoozed !== today;
}

export function drillPasses(unitId: string, right: number, ms: number): boolean {
  const spec = DRILLS[unitId];
  return !!spec && right >= spec.passRight && ms <= spec.targetSec * 1000;
}

export function recordDrill(p: Progress, unitId: string, right: number, ms: number, today: string): Progress {
  const spec = DRILLS[unitId];
  if (!spec) return p;
  const r: DrillRecord = p.drills?.[unitId] ?? { rounds: 0, passed: false, bestRight: 0, last: today };
  const pass = drillPasses(unitId, right, ms);
  const next: DrillRecord = {
    ...r,
    rounds: r.rounds + 1,
    last: today,
    passed: r.passed || pass,
    bestRight: Math.max(r.bestRight, right),
  };
  if (right >= spec.passRight) next.bestMs = Math.min(r.bestMs ?? ms, ms);
  if (next.passed) delete next.snoozed;
  return { ...p, drills: { ...p.drills, [unitId]: next } };
}

export function snoozeDrill(p: Progress, unitId: string, today: string): Progress {
  const r: DrillRecord = p.drills?.[unitId] ?? { rounds: 0, passed: false, bestRight: 0, last: today };
  return { ...p, drills: { ...p.drills, [unitId]: { ...r, snoozed: today } } };
}

/** m:ss */
export function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
