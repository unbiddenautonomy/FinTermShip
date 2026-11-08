# FinTermShip

A Duolingo-style web app for learning and remembering trading and market terms, tailored to the Indian market.

What it has now:

- 541 terms in 11 categories (plus 60 in phase 3), each with a definition, desk-style examples, a fill-in sentence and hand-written wrong options, plus worked sums and true-or-false checks. They include the Indian F&O screen (CE and PE, option writers, long and short build-up, max pain, IV rank, participant-wise OI, delivery percentage) and the numbers a PM asks about a strategy (hit rate, profit factor, expectancy, Calmar, IC, gross and net exposure, PnL attribution, markouts).
- Lessons that go past definitions: besides picking meanings, filling gaps and working sums, learners decode a dense desk line, say a plain sentence the way a trader would, pick the strongest reply to a PM or risk manager, spot a term used wrongly, and hear terms said aloud (CE, bips, PCR) and pick what they mean. 72 talk items so far, each tied to the terms it needs, so a learner only sees one once they've met those terms.
- 6 timed drills (mental maths, percentages and basis points, probability, expected value, Bayes, counting), with typed answers and questions generated fresh every round.
- A market-making game: quote a bid and ask on the total of three dice while traders, some of whom know the next die, deal with you.
- 7 desk cases (a short straddle into the Budget, working a big buy order, cash-futures arbitrage, and in phase 3 an iron condor through expiry week, hedging a portfolio before the Budget, a pairs trade that breaks, and taking a trend system from backtest to live), each a short story of linked decisions with the reasoning behind every option.
- Rates, macro and the rupee (RBI policy, liquidity, government bonds, USDINR), bond maths (yield, duration, PV01), and SEBI's current algo and F&O rules, each dated and sourced.
- A career map: the main quant and trading jobs and the usual interview rounds, each linked to the units that prepare for it.
- A guide chat with no AI model. It answers from the app's own content: what a term means (typos allowed, and contract names such as NIFTY 24500 PE), the difference between two terms, which unit teaches a topic, an area test if you already know it, where to start, which units prepare for a role, and how the app works. From its answers you can pick a unit to learn next, open it, or take a test. Phase 3 stays hidden until it opens, and it never gives out the password.
- One track: the core units of every area first, then the rest. Term lessons, drills, the game and the cases sit on the same path; a drill, game or case holds up the path until it is passed (or skipped for the day).
- Learners can pick any open unit to learn next, practise met terms, or take an area test to open its advanced units early.
- A quant switch in Settings, behind a password, opens the quant areas (maths drills, quant and risk, options, futures, microstructure, execution) and puts them first.
- Phase 3, trading strategies, at the end of the track: options and futures strategies (spreads, ratio spreads, butterflies, volatility and dispersion trades, payoffs and costs, hedging with futures), then arbitrage (exchange, ETF, merger, triangular and statistical), HFT, MFT and LFT (holding periods, alpha decay, capacity, speed), and systematic strategies (trend following, mean reversion, pairs and cointegration, volatility targeting, Kelly sizing, event-driven trades). It opens only with the password and a 20-question readiness test on options, futures, risk and backtesting (16 to pass). Once open, picking a strategy unit keeps you on the strategies until they're done.
- New terms slow down before reviews pile up: a day's new terms stop once any of the next four days' reviews would pass the daily cap of 80.
- A 7-step spaced repetition ladder (1, 3, 7, 16, 35, 120 days; core terms 20% sooner).
- Progress saved in the browser (IndexedDB), with backup export and import.
- Speaker buttons using the browser's built-in voice (Indian English when available).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scheduler, lesson, drill and path tests
npm run check:terms  # validates every term card
npm run build      # checks terms, type-checks, builds to dist/
```

## Adding or editing terms

Terms live in `src/data/terms/*.json`, one file per category. `npm run check:terms` fails if a card is missing a field, has a broken fill-in sentence, gives the answer away, or points at an unknown confusable term. Facts that change (rules, tax rates, timings) carry `asOf` and `source`.

## Adding or editing drills

Drill units live in `src/data/terms/skills.json` (units with `"kind": "drill"` and no terms). Each drill's question makers, round size, pass mark and time limit are in `src/lib/drills.ts`. `src/lib/drills.test.ts` checks hundreds of generated rounds: every answer is recomputed independently (sums, percentages, dice, coins, cards, Bayes) and the shown answer must be accepted when typed.

## Adding or editing talk items

Talk items live in `src/data/talk.json`. Each has a `format` (`decode`, `say`, `reply` or `misuse`), the `term` it practises, any `also` terms the learner must have met first, a `prompt` (not for `misuse`), a `who` for replies, four `options` with the right one first (for `misuse`, the sentence that uses the term wrongly), and a `why`. `npm run check:terms` checks all of this, and that the right option isn't much longer than the others, since length would give it away. `src/lib/talk.test.ts` checks that lessons never show an item before its terms are met.

## Adding or editing desk cases

Cases live in `src/data/cases.json`, keyed by the id of a unit with `"kind": "case"`. Each has a setup, a few facts, and steps; every step has 3 or 4 options, exactly one marked `best`, and a `why` for each option. `npm run check:terms` checks all of this, and that every term a step names exists. A learner passes with all but one best call.

Phase 3 areas are term files with `"phase": 3`; none of their units may be core. The readiness test's question pool (`PHASE3_PREREQS`) and its size are in `src/lib/phase3.ts`.

The career map is `src/data/careers.json`: roles and interview rounds, each with the unit ids to practise. `npm run check:terms` checks that those units exist.

The guide's matching, extra names (abbreviations and short forms, in `SYNONYMS`) and help answers (`HELP`) are in `src/lib/guide.ts`. `src/lib/guide.test.ts` checks that every term can be found by its own name, that typos and the usual ways of asking work, and that phase 3 and the password stay hidden. A new term needs nothing extra: the guide indexes it automatically.

The market game's rules and pass marks are in `src/lib/market.ts`; `src/lib/market.test.ts` plays thousands of games to check that sound quoting passes and lazy quoting doesn't.

## The password

The quant switch and phase 3 ask for the same password. Only its hash is in the code, in `src/lib/gate.ts`. To change it:

```bash
node scripts/hash-password.mjs "new password"
```

Paste the printed hash into `PASSWORD_HASH`. With no server, this only keeps the password out of plain sight: anyone who reads the code closely can get past it.

## Deploy to Cloudflare

The app is a static site served by a Cloudflare Worker named `fintermship`. `wrangler.jsonc` tells Cloudflare to run `npm run build` and serve `dist/` as static files, sending unknown paths to `index.html`.

1. In the Cloudflare dashboard, go to **Workers & Pages**, then **Create**, then **Import a repository**, and pick this repository.
2. Keep the defaults: Cloudflare reads `wrangler.jsonc`, so the build and deploy commands can stay as suggested (`npm run build`, `npx wrangler deploy`).
3. Every push to `main` publishes a new version. Other branches and pull requests get a preview from `npx wrangler preview`, which needs the `previews` block in `wrangler.jsonc` (empty means it uses the same settings).

To check the config locally without publishing: `npx wrangler versions upload --dry-run`.
