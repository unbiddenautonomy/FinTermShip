/**
 * The guide: a chat box that answers from the app's own content, with no AI
 * model. What the learner types is matched, typos allowed, against term names
 * and aliases, unit and area names, career roles and a short list of help
 * topics, and a few sentence patterns read the intent ("what is", "teach me",
 * "I know", "where do I start"). Phase 3 content stays hidden until it opens.
 */
import careerData from '../data/careers.json';
import { categories, categoryOfUnit, isPhase3Area, termById } from './content';
import { phase3Open } from './phase3';
import type { CareerMap, Progress } from './types';

export const careers = careerData as CareerMap;

/** What the learner seems to want: a definition, a lesson, a test, or no clear ask. */
export type Intent = 'define' | 'teach' | 'know' | 'any';

export type Target = { kind: 'term' | 'unit' | 'area' | 'role'; id: string };

export type HelpAction = 'settings' | 'careers' | 'glossary' | 'home';

export interface HelpTopic {
  id: string;
  /** Strong topics answer at once; weak ones only when nothing in the content matches well. */
  strong: boolean;
  match: RegExp;
  text: string;
  action?: HelpAction;
}

export type Reply =
  | { kind: 'term'; termId: string; intent: Intent }
  | { kind: 'unit'; unitId: string; intent: Intent; termId?: string }
  | { kind: 'area'; categoryId: string; intent: Intent }
  | { kind: 'role'; roleId: string }
  | { kind: 'careers' }
  | { kind: 'route' }
  | { kind: 'compare'; termIds: [string, string] }
  | { kind: 'help'; topic: HelpTopic }
  | { kind: 'locked3'; name: string; unitId: string }
  | { kind: 'choices'; options: { label: string; target: Target }[]; intent: Intent }
  | { kind: 'text'; text: string; action?: HelpAction }
  | { kind: 'none'; query: string };

// ---------------------------------------------------------------------------
// Text handling

/** Lower case, "F&O" → "fno", "SEBI's" → "sebi", "I'm" → "im", "%" → "percent", everything but letters and digits → spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[’']/g, '')
    .replace(/(\p{L})\s*&\s*(\p{L})/gu, '$1n$2')
    .replace(/%/g, ' percent ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const STOP = new Set(
  'a an the of in on for to me my about is are was be what whats which does do did how i im please can could you would will should explain define definition meaning means mean tell teach learn study know knew already want wanna like get some more this that it its and or with case term terms word called call it so just really quick quickly bit little'.split(
    ' ',
  ),
);
/** Filler that never tells two names apart ("in the money" keeps its "in"). */
const NAME_STOP = new Set(['a', 'an', 'the', 'of', 'and', 'case']);

/** The words of a phrase without filler. "call" is filler only in "what do you call", so it stays when it's the whole ask. */
const tokens = (s: string) => {
  const all = normalize(s).split(' ').filter(Boolean);
  const kept = all.filter((t) => !STOP.has(t));
  return kept.length ? kept : all.filter((t) => t === 'call' || t === 'case');
};
const nameWords = (s: string) => normalize(s).split(' ').filter((t) => t && !NAME_STOP.has(t));

const stem = (t: string) => (t.length >= 5 ? t.replace(/(ing|ed|es|s|e)$/, '') : t);

/** Edit distance with transpositions (optimal string alignment). */
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[m][n];
}

/** How alike two words are, 0 to 1. Short words (abbreviations) must match exactly. */
function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length <= 3 || b.length <= 3) return 0;
  if (stem(a) === stem(b)) return 0.95;
  if (a.length >= 4 && b.startsWith(a)) return 0.75 + (0.2 * a.length) / b.length;
  const allowed = Math.min(a.length, b.length) >= 8 ? 2 : 1;
  if (Math.abs(a.length - b.length) > allowed) return 0;
  const d = distance(a, b);
  if (d > allowed) return 0;
  return 1 - d / Math.max(a.length, b.length);
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** How well a query matches a name: both ways, so extra words on either side cost. */
function nameScore(q: string[], name: string[], qAll: string[]): number {
  if (!q.length || !name.length) return 0;
  const best = (t: string, list: string[]) => Math.max(...list.map((x) => wordSim(t, x)));
  const p = sum(q.map((t) => best(t, name))) / q.length;
  const r = sum(name.map((t) => best(t, q))) / name.length;
  let score = p && r ? (2 * p * r) / (p + r) : 0;
  // A name of two or more words (or one long word) said inside a longer sentence.
  const joined = ` ${qAll.join(' ')} `;
  if ((name.length >= 2 || name[0].length >= 7) && joined.includes(` ${name.join(' ')} `)) {
    score = Math.max(score, 0.86 + 0.1 * Math.min(1, name.length / q.length));
  }
  return score;
}

// ---------------------------------------------------------------------------
// The index: every name a learner might type, pointing at what it names

/** Extra names: abbreviations, short forms and common ways people ask. */
const SYNONYMS: Record<string, string[]> = {
  'area:basics': ['basics', 'market basics', 'money basics'],
  'area:india': ['india', 'indian market', 'indian markets', 'indian stock market'],
  'area:trading': ['order types', 'orders', 'trade types'],
  'area:options': ['options', 'options and greeks'],
  'area:instruments': ['futures', 'instruments', 'futures and bonds'],
  'area:quant': ['quant', 'risk', 'statistics', 'stats', 'quant and risk'],
  'area:skills': ['maths', 'math', 'probability', 'puzzles', 'brain teasers', 'quant maths'],
  'area:desk': ['desk talk', 'jargon', 'trading jargon', 'lingo', 'slang'],
  'area:conditions': ['market conditions', 'regimes'],
  'area:macro': ['macro', 'rates', 'economy', 'monetary policy', 'currency', 'forex', 'fx'],
  'area:micro': ['microstructure', 'micro', 'market structure'],
  'area:execution': ['execution', 'execution costs'],
  'area:strategies': ['strategies', 'trading strategies', 'futures strategies'],
  'area:systematic': ['systematic', 'systematic trading', 'algo strategies', 'quant strategies'],
  'unit:k1': ['mental math', 'arithmetic'],
  'unit:f4': ['bonds', 'bond maths'],
  'unit:k4': ['ev'],
  'unit:k5': ['bayes', 'bayes theorem', 'conditional probability'],
  'unit:k6': ['combinatorics', 'permutations', 'combinations'],
  'unit:s6': ['market making', 'market making game', 'dice game'],
  'unit:s8': ['cards market', 'card game', 'market on cards'],
  'unit:s9': ['headline game', 'news game', 'event risk game'],
  'unit:s10': ['big orders', 'order size game', 'inventory game'],
  'unit:s11': ['rival game', 'rival market maker', 'competing market maker'],
  'unit:o9': ['payoff builder', 'payoff game', 'build a payoff', 'payoff puzzles'],
  'unit:q15': ['risk desk', 'risk game', 'limits game', 'approve or reject'],
  'unit:x8': ['beat vwap', 'vwap game', 'execution game', 'work an order'],
  'unit:s12': ['read the book', 'order book game', 'next tick', 'markout game', 'queue game'],
  'unit:o13': ['expiry day game', 'expiry game', 'straddle game', 'short straddle game'],
  'unit:o10': ['greeks pnl', 'greek pnl', 'greeks game', 'pnl game', 'greeks p and l'],
  'unit:q8': ['guess the number', 'guess the correlation', 'correlation game', 'vol game', 'chart game'],
  'unit:k7': ['fermi', 'fermi estimates', 'fermi questions', 'estimation', 'estimates', 'guesstimates', 'market sizing'],
  'unit:z6': ['kelly betting', 'kelly game', 'betting game', 'bet sizing game'],
  'unit:s7': ['sebi rules', 'algo rules', 'fno rules'],
  'unit:q9': ['research review', 'research meeting', 'research talk', 'quant meeting talk', 'quant lingo'],
  'unit:q10': ['signal research', 'alpha research talk'],
  'unit:q11': ['pm talk', 'portfolio manager talk', 'pm lingo'],
  'unit:q12': ['risk meeting', 'risk talk', 'risk lingo'],
  'unit:d6': ['trade management', 'managing trades', 'trading psychology'],
  'unit:o11': ['fno talk', 'fno slang', 'option trader talk', 'options slang'],
  'unit:o12': ['vol talk', 'premium selling talk', 'option desk talk'],
  'unit:x5': ['execution talk', 'sales trader talk', 'execution lingo'],
  'unit:x6': ['order talk', 'order desk', 'dealing desk talk'],
  'unit:x7': ['meeting game', 'meetings', 'listening game', 'meeting practice', 'follow a meeting'],
  'unit:q13': ['backtest detective', 'backtest game', 'spot the flaw', 'bad backtests', 'find the flaw'],
  'unit:q14': ['signal lab', 'signal game', 'overfitting game', 'parameter tuning', 'tune a signal'],
  'unit:z7': ['pairs trader', 'pairs game', 'pairs trading game', 'spread game', 'z score game'],
  'term:pe-ratio': ['p e', 'p e ratio', 'pe ratio', 'pe multiple'],
  'term:participant-wise-oi': ['fii long short ratio', 'long short ratio', 'fii positions'],
  'term:realised-volatility': ['rv', 'realized volatility', 'realized vol'],
  'term:sortino-ratio': ['sortino'],
  'term:max-drawdown': ['drawdown', 'drawdowns'],
  'term:expected-shortfall': ['es'],
  'term:pov-algo': ['pov'],
  'term:repo-rate': ['repo'],
  'term:g-sec': ['gsec', 'gilts', 'government bond'],
  'term:t-bill': ['tbill', 'tbills'],
  'term:usdinr': ['usdinr', 'usd inr rate', 'rupee dollar'],
  'term:demat-account': ['demat'],
  'term:circuit-limit': ['circuit', 'circuits'],
  'term:sl-m-order': ['slm'],
  'term:zero-day-option': ['0dte', 'zero dte'],
  'term:iron-condor': ['condor'],
  'term:butterfly-spread': ['butterfly', 'fly'],
  'term:pairs-trading': ['pairs', 'pair trade', 'pairs trade'],
  'term:bull-market': ['bull'],
  'term:bear-market': ['bear'],
  'term:volatility-skew': ['skew'],
  'term:skewness': ['skew'],
  'term:volatility-smile': ['smile'],
  'term:hft': ['high frequency', 'high frequency trading'],
  'term:medium-frequency-trading': ['medium frequency'],
  'term:low-frequency-trading': ['low frequency'],
  'term:fno': ['fno segment'],
  'term:pnl': ['pl', 'p l'],
  'term:stop-loss': ['stoploss'],
  'term:implied-volatility': ['implied volatility'],
  'term:black-scholes': ['black scholes merton', 'bs model'],
  'role:quant-trader': ['qt', 'quantitative trader', 'quant trading'],
  'role:quant-researcher': ['qr', 'quantitative researcher', 'quant research', 'researcher'],
  'role:quant-developer': ['quant dev', 'qd', 'developer', 'quant programmer'],
  'role:execution-trader': ['execution trading'],
  'role:risk-manager': ['risk analyst', 'risk management'],
  'role:rates-fx-trader': ['rates trader', 'fx trader', 'currency trader', 'forex trader'],
};

interface Entry {
  target: Target;
  label: string;
  /** Each name as words; synonyms score a hair below real names so a real name wins a tie. */
  names: { words: string[]; text: string; weight: number }[];
}

const KEY = (t: Target) => `${t.kind}:${t.id}`;

function buildIndex(): Entry[] {
  const out: Entry[] = [];
  const add = (target: Target, label: string, names: string[]) => {
    const syn = SYNONYMS[KEY(target)] ?? [];
    out.push({
      target,
      label,
      names: [...names.map((n) => ({ words: nameWords(n), text: normalize(n), weight: 1 })), ...syn.map((n) => ({ words: nameWords(n), text: normalize(n), weight: 0.99 }))].filter((n) => n.words.length),
    });
  };
  for (const c of categories) {
    add({ kind: 'area', id: c.id }, c.name, [c.name]);
    for (const u of c.units) add({ kind: 'unit', id: u.id }, u.name.replace(/^Case: /, 'Desk case: '), [u.name.replace(/^Case:\s*/, '')]);
    for (const t of c.terms) add({ kind: 'term', id: t.id }, t.term, [t.term, ...(t.aliases ?? [])]);
  }
  for (const r of careers.roles) add({ kind: 'role', id: r.id }, r.title, [r.title]);
  return out;
}

const index = buildIndex();
const entryOf = new Map(index.map((e) => [KEY(e.target), e]));

/** How much each kind of thing suits each intent. */
const FIT: Record<Intent, Record<Target['kind'], number>> = {
  define: { term: 1, unit: 0.9, area: 0.88, role: 0.9 },
  teach: { term: 0.95, unit: 1, area: 0.98, role: 0.9 },
  know: { term: 0.93, unit: 0.97, area: 1, role: 0.9 },
  any: { term: 1, unit: 0.98, area: 0.97, role: 0.97 },
};

export interface Match {
  target: Target;
  label: string;
  score: number;
}

/** The best matches for a phrase, best first. */
export function search(text: string, intent: Intent = 'any'): Match[] {
  const q = tokens(text);
  const qAll = nameWords(text);
  if (!q.length) return [];
  const out: Match[] = [];
  for (const e of index) {
    let best = 0;
    // Matching without the filler words costs a little, so "risk on" means risk-on, not risk.
    const trimmed = q.length < qAll.length ? 0.97 : 1;
    for (const n of e.names) best = Math.max(best, nameScore(q, n.words, qAll) * n.weight * trimmed, qAll.length ? nameScore(qAll, n.words, qAll) * n.weight : 0);
    if (best >= 0.5) out.push({ target: e.target, label: e.label, score: best * FIT[intent][e.target.kind] });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Help topics: how the app works, in its own terms

export const HELP: HelpTopic[] = [
  {
    id: 'password',
    strong: true,
    match: /\b(password|passcode|pass code|pin(?! risk)|007)\b/,
    text: "I can't share the password. Whoever gave you the app can tell you. It opens Go straight to quant in Settings, and phase 3.",
  },
  {
    id: 'about',
    strong: true,
    match: /^(help|menu|what can you do|what do you do|who are you|what are you|how do you work|are you (an )?ai|are you a bot)\b/,
    text: 'I answer from what is in this app: its terms, units, desk cases, career map and settings. I don\'t use an AI model, so I can\'t discuss open questions, but I can find a term, open the right unit, offer a test, or tell you how the app works. Try "what is theta", "teach me option strategies", "I already know options" or "where do I start".',
  },
  {
    id: 'backup',
    strong: true,
    match: /\b(back ?up|restore|new phone|other device|another device|transfer|sync|move my progress|lose my progress|lost my progress|save my progress)\b/,
    text: 'Progress is saved in this browser on this device after every answer. It does not move to other devices on its own, and clearing browser data erases it. To keep it safe or move it, use Save backup in Settings, then Load backup on the other device.',
    action: 'settings',
  },
  {
    id: 'reset',
    strong: true,
    match: /\b(reset|start over|erase|delete my progress|clear my progress|wipe)\b/,
    text: 'Reset progress is at the bottom of Settings, under Start over. It erases all progress on this device and keeps your settings. Save a backup first if you might want it back.',
    action: 'settings',
  },
  {
    id: 'goal',
    strong: true,
    match: /\b(daily goal|new terms (per|a|each) day|how many (new )?terms|too (many|much)( new)? (terms|words|cards|questions|reviews|lessons)|(its|it is|this is|thats|that is) too (many|much|fast|slow)|too (fast|slow)|slow (it )?down|speed (it )?up|minutes a day|time a day)\b/,
    text: 'Set your daily goal in Settings: 5, 10, 15, 20, 30 or 40 new terms a day. Reviews of terms you have met come on top, and the screen shows about how many minutes a day your choice takes.',
    action: 'settings',
  },
  {
    id: 'quant',
    strong: true,
    match: /\b(go straight to quant|quant (switch|track|first|mode)|skip to quant|straight to quant|jump to quant)\b/,
    text: 'Go straight to quant, in Settings, opens maths and probability, quant and risk, options, and microstructure, and puts them first on your path. It asks for the password.',
    action: 'settings',
  },
  {
    id: 'phase3',
    strong: true,
    match: /\b(phase (3|three)|readiness test|unlock (the )?strateg|open (the )?strateg)/,
    text: 'Phase 3, trading strategies, comes at the end of the path. It opens with the password and a readiness test: 20 questions on options, futures, risk and backtesting, with 16 right to pass and one try a day. Once open, its units are on your path like any other.',
  },
  {
    id: 'voice',
    strong: true,
    match: /\b(voice|sound|audio|speaker|pronounce|pronunciation|read aloud|hear)\b/,
    text: "Turn on Speaker buttons in Settings to hear terms read aloud with your device's voice. Each term card then has a speaker button, and many terms also show how they're said.",
    action: 'settings',
  },
  {
    id: 'install',
    strong: true,
    match: /\b(install|home screen|app icon|download (the )?app|add to home)\b/,
    text: 'On iPhone, open the app in Safari, tap Share, then Add to Home Screen. Safari can clear a website\'s saved progress after 7 days unused, and the home screen app keeps it. On Android, use the browser menu\'s Add to Home screen or Install app.',
  },
  {
    id: 'streak',
    strong: true,
    match: /\b(streak|xp|points|experience points)\b/,
    text: 'You earn XP for every finished lesson, drill, game or case. Your streak counts the days in a row on which you finished at least one. Miss a day and it starts again from 1.',
  },
  {
    id: 'reviews',
    strong: false,
    match: /\b(reviews?|spaced repetition|come back|comes back|forget|forgetting|how often|schedule|ladder|steps?)\b/,
    text: 'Each term climbs a ladder of 6 steps. A quick right answer moves it up and pushes its next review out: 1, 3, 7, 16, 35, then 120 days. Core terms come back 20% sooner. A wrong answer drops it 2 steps and brings it back tomorrow.',
  },
  {
    id: 'tests',
    strong: false,
    match: /\b(tests?|skip (an )?area|skip ahead|placement|unlock|locked)\b/,
    text: "Each area's advanced units open once you've met its core terms and passed its core drills. If you already know an area, take its test from a locked unit: pass with 80% and its advanced units open. You get one try a day.",
  },
  {
    id: 'practice',
    strong: false,
    match: /\b(drills?|games?|desk cases?|cases)\b/,
    text: 'Drills, games and desk cases sit on the path between lessons. Drills are timed rounds of maths. The games have you quote a market, build option payoffs, call a book\'s Greeks PnL, read correlation and vol off charts, make Fermi estimates, follow short meeting clips, find the flaw in a backtest and tune a signal without fooling yourself; phase 3 adds sizing bets and trading a pair that breaks. Desk cases are short stories of linked decisions. Pass one to move on, or skip a failed one until tomorrow.',
    action: 'home',
  },
  {
    id: 'choose',
    strong: false,
    match: /\b(choose|pick|change (my )?(unit|lesson|topic)|jump|skip|what order|order of)\b/,
    text: 'Tap any unit on the path to see its terms. Learn this next puts it first, after any earlier units in the same area that it builds on. Or just tell me what you want to learn, such as "teach me order types".',
    action: 'home',
  },
  {
    id: 'glossary',
    strong: false,
    match: /\b(glossary|list of (all )?terms|all terms|look up|search)\b/,
    text: "The Glossary tab lists every term you can reach, with search and filters for terms you've met and terms that need work.",
    action: 'glossary',
  },
];

const helpById = new Map(HELP.map((h) => [h.id, h]));

// ---------------------------------------------------------------------------
// Reading the ask

const ROUTE = /^(where (do|should|can) i (start|begin)|how (do|should) i (start|begin)|what (should|do|can) i (learn|do|study|start)( first| next| now)?|what( is)? next|next|continue|start|begin|start learning|(im|i am) (new|a beginner)|new here|beginner|where am i|what now)\b/;
const CAREER = /\b(interviews?|careers?|jobs?|hired|hiring|internships?|placements?|become an?|work as|roles?)\b/;
const COMPARE = /\b(difference between|differences between|compare|versus|vs|differ(ent)? from)\b/;
const COMPARE_SETUP = /\b(what( is| are)?( the)? (difference|differences) between|difference between|differences between|compare|how (is|are|do|does))\b/g;
const HELLO = /^(hi|hello|hey|hiya|namaste|yo|good (morning|afternoon|evening))\b/;
const THANKS = /^(thanks|thank you|thx|ty|cool|ok|okay|great|nice|got it|perfect)\b/;
const INTENTS: [Intent, RegExp][] = [
  ['know', /\b(i (already )?know|(im|i am) (good|fine|comfortable|familiar|ok|solid|strong) (at|with|in)|(ive|i have) (done|learned|learnt|studied|covered)|already know|skip|test me|let me test)\b/],
  ['teach', /\b(teach|learn|study|practi[sc]e|lessons? (on|about|in)|get better at|improve|work on|start with|open (the )?(unit|lesson)|show me (the )?(unit|lesson)|take me to)\b/],
  ['define', /\b(what|whats|define|definition|meaning|means|mean by|explain|tell me about|who (is|are)|how does|how do .* work)\b/],
];

function readIntent(t: string): Intent {
  for (const [intent, re] of INTENTS) if (re.test(t)) return intent;
  return 'any';
}

/** Words that set up a question but don't name its subject. */
const SETUP = /\b(i (already )?know( about)?|(im|i am) (good|fine|comfortable|familiar|ok|solid|strong) (at|with|in)|(ive|i have) (done|learned|learnt|studied|covered)|teach me( about)?|i want to (learn|know|study)( about)?|show me|take me to|tell me about|what( is| are)?|whats|how does|how do|get better at|work on|lessons? (on|about|in)|let me test|test me on|meaning of|mean by)\b/g;

function subject(t: string): string {
  return t.replace(SETUP, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Answering

function phase3Unit(target: Target): string | null {
  if (target.kind === 'term') {
    const t = termById.get(target.id);
    return t && isPhase3Area(categoryOfUnit(t.unit)?.id ?? '') ? t.unit : null;
  }
  if (target.kind === 'unit') return isPhase3Area(categoryOfUnit(target.id)?.id ?? '') ? target.id : null;
  if (target.kind === 'area' && isPhase3Area(target.id)) return categories.find((c) => c.id === target.id)!.units[0].id;
  return null;
}

/** The reply for one thing the learner named. */
export function replyFor(target: Target, intent: Intent, p: Progress): Reply {
  const locked = phase3Unit(target);
  if (locked && !phase3Open(p)) return { kind: 'locked3', name: entryOf.get(KEY(target))?.label ?? '', unitId: locked };
  switch (target.kind) {
    case 'term':
      return intent === 'teach' ? { kind: 'unit', unitId: termById.get(target.id)!.unit, intent, termId: target.id } : intent === 'know' ? { kind: 'area', categoryId: categoryOfUnit(termById.get(target.id)!.unit)!.id, intent } : { kind: 'term', termId: target.id, intent };
    case 'unit':
      return intent === 'know' ? { kind: 'area', categoryId: categoryOfUnit(target.id)!.id, intent } : { kind: 'unit', unitId: target.id, intent };
    case 'area':
      return { kind: 'area', categoryId: target.id, intent };
    case 'role':
      return { kind: 'role', roleId: target.id };
  }
}

function choose(matches: Match[], intent: Intent, p: Progress, query: string): Reply {
  const top = matches[0];
  if (!top || top.score < 0.6) return { kind: 'none', query };
  const close = matches.filter((m) => m.score >= top.score - 0.05);
  if (top.score >= 0.82 && close.length === 1) return replyFor(top.target, intent, p);
  const options = (top.score >= 0.82 ? close : matches.filter((m) => m.score >= top.score - 0.15)).slice(0, 3);
  if (options.length === 1) return { kind: 'choices', options: [{ label: options[0].label, target: options[0].target }], intent };
  return { kind: 'choices', options: options.map((m) => ({ label: m.label, target: m.target })), intent };
}

/** "difference between theta and vega": both sides as terms, or null. */
function compare(t: string, p: Progress): Reply | null {
  const rest = subject(t.replace(COMPARE_SETUP, ' ')).replace(/\b(differ|different)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const words = rest.split(' ');
  let best: { score: number; ids: [string, string] } | null = null;
  words.forEach((w, i) => {
    if (!['and', 'vs', 'versus', 'or', 'with', 'from'].includes(w)) return;
    const a = search(words.slice(0, i).join(' '), 'define').filter((m) => m.target.kind === 'term')[0];
    const b = search(words.slice(i + 1).join(' '), 'define').filter((m) => m.target.kind === 'term')[0];
    if (a && b && a.target.id !== b.target.id) {
      const score = Math.min(a.score, b.score);
      if (score >= 0.75 && (!best || score > best.score)) best = { score, ids: [a.target.id, b.target.id] };
    }
  });
  if (!best) return null;
  const { ids } = best as { ids: [string, string] };
  for (const id of ids) {
    const r = replyFor({ kind: 'term', id }, 'define', p);
    if (r.kind === 'locked3') return r;
  }
  return { kind: 'compare', termIds: ids };
}

/** Everything the guide can say back to one message. */
const CONTRACT = /\b\d+(?: \d+)* (ce|pe)\b/;

export function answer(text: string, p: Progress): Reply {
  const t = normalize(text);
  if (!t) return { kind: 'text', text: 'Ask me about a term, a topic, or what to learn next.' };
  if (HELLO.test(t) && normalize(t).split(' ').length <= 3)
    return { kind: 'text', text: 'Hello! Ask me about any term ("what is theta"), a topic to learn ("teach me option strategies"), or "where do I start".' };
  if (THANKS.test(t) && normalize(t).split(' ').length <= 3) return { kind: 'text', text: 'Glad to help. Ask again any time.' };

  for (const h of HELP) if (h.strong && h.match.test(t)) return { kind: 'help', topic: h };
  if (ROUTE.test(t)) return { kind: 'route' };

  if (COMPARE.test(t)) {
    const c = compare(t, p);
    if (c) return c;
  }

  // A contract name such as "NIFTY 24500 PE": the strike followed by CE or PE.
  const contract = CONTRACT.exec(t);
  if (contract) return { kind: 'term', termId: contract[1] === 'ce' ? 'ce-option' : 'pe-option', intent: 'define' };

  let intent = readIntent(t);
  const subj = subject(t);
  let matches = search(subj, intent);
  // A verb inside a name doesn't say what the learner wants: "what is improve the bid" asks for a term.
  const named = matches[0] && entryOf.get(KEY(matches[0].target))?.names.find((n) => ` ${t} `.includes(` ${n.text} `));
  if (named) {
    const rest = readIntent(` ${t} `.replace(` ${named.text} `, ' ').trim());
    if (rest !== intent) {
      intent = rest;
      matches = search(subj, intent);
    }
  }

  if (CAREER.test(t)) {
    const role = matches.find((m) => m.target.kind === 'role' && m.score >= 0.75);
    return role ? { kind: 'role', roleId: role.target.id } : { kind: 'careers' };
  }

  const weak = HELP.find((h) => !h.strong && h.match.test(t));
  if (weak && !(matches[0]?.score >= 0.85)) return { kind: 'help', topic: weak };
  return choose(matches, intent, p, text.trim());
}

export function helpTopic(id: string): HelpTopic | undefined {
  return helpById.get(id);
}

/** Ideas to show before the first message. */
export const STARTERS = ['Where do I start?', 'What is theta?', 'Teach me order types', 'I already know options', 'Prepare me for quant interviews', 'How do I back up my progress?'];
