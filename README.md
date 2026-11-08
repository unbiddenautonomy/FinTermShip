# FinTermShip

A Duolingo-style web app for learning and remembering trading and market terms, tailored to the Indian market.

What it has now:

- 653 terms in 11 categories (plus 60 in phase 3), each with a definition, desk-style examples, a fill-in sentence and hand-written wrong options, plus worked sums and true-or-false checks. They include the Indian F&O screen (CE and PE, option writers, long and short build-up, max pain, IV rank, participant-wise OI, delivery percentage) and the numbers a PM asks about a strategy (hit rate, profit factor, expectancy, Calmar, IC, gross and net exposure, PnL attribution, markouts). About 110 of them are phrases heard in meetings and on desks, in nine short units: research reviews ("it's just beta", "too many knobs"), signal research, PM and risk meetings ("de-gross", "pain trade"), managing a trade, F&O and vol desk talk ("put base", "skew is bid") and execution chatter ("pay up", "bips versus arrival").
- Lessons that go past definitions: besides picking meanings, filling gaps and working sums, learners decode a dense desk line, say a plain sentence the way a trader would, pick the strongest reply to a PM or risk manager, spot a term used wrongly, and hear terms said aloud (CE, bips, PCR) and pick what they mean. 72 talk items so far, each tied to the terms it needs, so a learner only sees one once they've met those terms.
- 6 timed drills (mental maths, percentages and basis points, probability, expected value, Bayes, counting), with typed answers and questions generated fresh every round.
- 10 games, each with a pass mark checked by simulating thousands of plays:
  - Make a market: quote a bid and ask on the total of three dice while traders, some of whom know the next die, deal with you.
  - Payoff builder: buy and sell calls, puts and futures until your payoff matches the target, from single options up to condors and parity trades.
  - Greeks PnL: a book's delta, gamma, vega and theta in rupees, then a move in spot, IV and time; call the PnL, then see how it splits.
  - Guess the number: correlation from a scatter, annual vol from a price chart, and which return series has fat tails.
  - Fermi estimates: a minute to estimate a size or a count, scored in powers of ten, with sourced answers for the facts.
  - Morning meeting: short clips from a morning meeting, a research review, a risk call, the F&O and execution desks, broker calls and event days (48 in all), each with two questions on what the people meant.
  - Backtest detective: six backtest reports that look too good, each with one flaw (look-ahead, survivorship, missing costs, overfitting, data snooping, a small sample, bad data, or returns that are just the market). Tap the line that gives it away, then name it. 44 reports on 11 Indian strategies.
  - Signal lab: grids of in-sample Sharpe ratios over 25 settings of a signal. Bin the noise, and take the middle of a real edge rather than a lucky lone peak; then see every setting's true Sharpe. Plus how high luck reaches after many tries (the idea behind the deflated Sharpe ratio) and how fast an edge decays.
  - Kelly betting (phase 3): size bets on three biased coins, one with no edge, judged on your sizing rather than your luck.
  - Pairs trader (phase 3): trade the z-score of three pairs week by week, entering at ±2, closing near 0 and stopping at ±4. One pair breaks partway through, and each call is judged against the rules from the position you hold.
- 7 desk cases (a short straddle into the Budget, working a big buy order, cash-futures arbitrage, and in phase 3 an iron condor through expiry week, hedging a portfolio before the Budget, a pairs trade that breaks, and taking a trend system from backtest to live), each a short story of linked decisions with the reasoning behind every option.
- Rates, macro and the rupee (RBI policy, liquidity, government bonds, USDINR), bond maths (yield, duration, PV01), and SEBI's current algo and F&O rules, each dated and sourced.
- A career map: the main quant and trading jobs and the usual interview rounds, each linked to the units that prepare for it.
- A guide chat with no AI model. It answers from the app's own content: what a term means (typos allowed, and contract names such as NIFTY 24500 PE), the difference between two terms, which unit teaches a topic, an area test if you already know it, where to start, which units prepare for a role, and how the app works. From its answers you can pick a unit to learn next, open it, or take a test. Phase 3 stays hidden until it opens, and it never gives out the password.
- One track: the core units of every area first, then the rest. Term lessons, drills, games and cases sit on the same path; a drill, game or case holds up the path until it is passed (or skipped for the day).
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

## Adding or editing games

A game unit is a unit with `"kind": "game"` and `"game"` set to one of `market`, `payoff`, `greeks`, `kelly`, `guess`, `fermi`, `meeting`, `backtest`, `signal` or `pairs`. Each game's rules and pass marks are in its own file in `src/lib` (`market.ts`, `payoff.ts`, `greeks.ts`, `kelly.ts`, `guess.ts`, `fermi.ts`, `meeting.ts`, `backtest.ts`, `signal.ts`, `pairs.ts`), its screen is in `src/components`, and `src/lib/games.ts` says how big a round is, the pass rule and how a record reads. `src/lib/market.test.ts` and `src/lib/games.test.ts` play thousands of rounds to check that sound play passes and guessing doesn't.

Fermi questions are in `src/data/fermi.json`. A question that rests on a fact (a population, a count of accounts) needs a `source` link and an `asOf` date; a question you can work out (seconds in a session) needs neither. `npm run check:terms` checks them.

Meeting clips are in `src/data/meetings.json`: a setting, three to six lines, two questions with the right option written first, and the term ids the clip uses. `npm run check:terms` checks that every setting has enough clips, that the right option isn't much longer than the others, and that the terms exist and aren't in phase 3.

Backtest reports are in `src/data/backtests.json`. Each strategy has six clean lines (universe, data, signal and fills, costs, testing, result) and a list of cases; each case swaps one line for a flawed one, names the flaw, explains it in `why`, and gives the headline Sharpe, annual return and worst fall. `npm run check:terms` checks that each flaw sits in a line where it fits, that the flawed line differs from the clean one, and that every flaw appears in at least three strategies.

Signal lab and Pairs trader draw their data fresh each round. Their generators reject draws a careful player couldn't get right (noise that beats what luck gives, a pair that hits its stop without breaking), and `src/lib/games.test.ts` checks that across hundreds of rounds.

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
