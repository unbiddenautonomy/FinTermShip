# fintermship

New here, or a new Claude session? Start with [docs/BRIEF.md](docs/BRIEF.md): what this is, the standing rules, design rules, decisions and open items.

A Duolingo-style web app for learning and remembering trading and market terms, tailored to the Indian market.

What it has now:

- 864 terms in 15 areas (plus 99 in two phase 3 areas), each with a definition, desk-style examples, a fill-in sentence and hand-written wrong options, plus worked sums and true-or-false checks. They include the Indian F&O screen (CE and PE, option writers, long and short build-up, max pain, IV rank, participant-wise OI, delivery percentage) and the numbers a PM asks about a strategy (hit rate, profit factor, expectancy, Calmar, IC, gross and net exposure, PnL attribution, markouts). About 130 of them are phrases heard in meetings and on desks, in eleven short units: research reviews ("it's just beta", "too many knobs"), signal research, PM and risk meetings ("de-gross", "pain trade"), managing a trade, F&O and vol desk talk ("put base", "skew is bid") and execution chatter ("pay up", "bips versus arrival").
- Lessons that go past definitions: besides picking meanings, filling gaps and working sums, learners decode a dense desk line, say a plain sentence the way a trader would, pick the strongest reply to a PM or risk manager, spot a term used wrongly, and hear terms said aloud (CE, bips, PCR) and pick what they mean. 72 talk items so far, each tied to the terms it needs, so a learner only sees one once they've met those terms.
- 6 timed drills (mental maths, percentages and basis points, probability, expected value, Bayes, counting), with typed answers and questions generated fresh every round.
- 14 games, each with a pass mark checked by simulating thousands of plays:
  - Make a market, in five levels: quote a bid and ask on the total of three dice while traders, some of whom know the next die, deal with you, then on cards, then through a headline that moves the fair value, then against big orders that run the price, then against a rival market maker.
  - Payoff builder: buy and sell calls, puts and futures until your payoff matches the target, from single options up to condors and parity trades.
  - Greeks PnL: a book's delta, gamma, vega and theta in rupees, then a move in spot, IV and time; call the PnL, then see how it splits.
  - Expiry day: three expiry days running a short at-the-money Nifty straddle, checked six times a day. Follow the desk's playbook (stop at half the premium, buy wings before an event, hedge delta, don't chase it after 14:30) and settle what's left at 15:30.
  - Risk desk: you are the risk manager for a long-short book with a futures hedge. Approve or reject trade requests against gross, net, single-stock, VaR and margin limits, and name the limit a rejected trade breaks.
  - Read the book: quick reads of a stock's screen. Call the next tick from the order book and the last trades, say whether a queued bid fills before the price moves, and read markouts after a fill. The tick is drawn from the real odds, so the call is what's scored.
  - Beat VWAP: buy a client's order by 15:30 against the day's VWAP, picking what share of each slice's volume to take. Buying faster costs more and pushes the price, there is a cap you can't go over, and one slice brings a surprise.
  - Guess the number: correlation from a scatter, annual vol from a price chart, and which return series has fat tails.
  - Fermi estimates: a minute to estimate a size or a count, scored in powers of ten, with sourced answers for the facts.
  - Morning meeting: short clips from a morning meeting, a research review, a risk call, the F&O and execution desks, broker calls and event days (48 in all), each with two questions on what the people meant.
  - Backtest detective: six backtest reports that look too good, each with one flaw (look-ahead, survivorship, missing costs, overfitting, data snooping, a small sample, bad data, or returns that are just the market). Tap the line that gives it away, then name it. 44 reports on 11 Indian strategies.
  - Signal lab: grids of in-sample Sharpe ratios over 25 settings of a signal. Bin the noise, and take the middle of a real edge rather than a lucky lone peak; then see every setting's true Sharpe. Plus how high luck reaches after many tries (the idea behind the deflated Sharpe ratio) and how fast an edge decays.
  - Kelly betting (phase 3): size bets on three biased coins, one with no edge, judged on your sizing rather than your luck.
  - Pairs trader (phase 3): trade the z-score of three pairs week by week, entering at ±2, closing near 0 and stopping at ±4. One pair breaks partway through, and each call is judged against the rules from the position you hold.
- 9 desk cases (a short straddle into the Budget, working a big buy order, cash-futures arbitrage, and in phase 3 an iron condor through expiry week, hedging a portfolio before the Budget, an index inclusion trade, a pairs trade that breaks, taking a trend system from backtest to live, and quoting into a heavy bid), each a short story of linked decisions with the reasoning behind every option.
- Rates, macro and the rupee (RBI policy, liquidity, government bonds, USDINR), bond maths (yield, duration, PV01), and SEBI's current algo and F&O rules, each dated and sourced.
- A career map: the main quant and trading jobs and the usual interview rounds, each linked to the units that prepare for it.
- A guide chat with no AI model. It answers from the app's own content: what a term means (typos allowed, and contract names such as NIFTY 24500 PE), the difference between two terms, which unit teaches a topic, an area test if you already know it, where to start, which units prepare for a role, and how the app works. From its answers you can pick a unit to learn next, open it, or take a test. Phase 3 stays hidden until it opens, and it never gives out the password.
- One track: the core units of every area first, then the rest. Term lessons, drills, games and cases sit on the same path; a drill, game or case holds up the path until it is passed (or skipped for the day).
- Learners can pick any open unit to learn next, practise met terms, or take an area test to open its advanced units early.
- A quant switch in Settings, behind a password, opens the quant areas (maths drills, quant and risk, options, futures, microstructure, execution) and puts them first.
- Phase 3, trading strategies, at the end of the track: options and futures strategies (spreads, ratio spreads, butterflies, volatility and dispersion trades, payoffs and costs, hedging with futures), then arbitrage (exchange, ETF, merger, triangular and statistical), HFT, MFT and LFT (holding periods, alpha decay, capacity, speed), and systematic strategies (trend following, mean reversion, pairs and cointegration, volatility targeting, Kelly sizing, event-driven trades). It opens only with the password and a 20-question readiness test on options, futures, risk and backtesting (16 to pass). Once open, picking a strategy unit keeps you on the strategies until they're done.
- New terms slow down before reviews pile up: a day's new terms stop once any of the next four days' reviews would pass the daily cap of 80.
- A 7-step spaced repetition ladder (1, 3, 7, 16, 35, 120 days; core terms 20% sooner).
- Every screen has an address (`/progress`, `/lines`, `/glossary?q=skew`, `/careers?unit=z4`), so Back and Forward move between screens, a refresh lands where you were, and a screen can be shared as a link. A lesson, drill, game or case is dealt by the server from a seed, so it has no address to return to: Back leaves it, and reloading starts afresh (`src/components/route.ts`).
- Progress saved in the browser (IndexedDB), with backup export and import.
- Speaker buttons using the browser's built-in voice (Indian English when available).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173, every term card loaded (no server, no sign-in)
npm test           # scheduler, lesson, drill and path tests
npm run check:terms  # validates every term card
npm run build      # checks terms and the outline, type-checks, builds to dist/, then checks no card is in dist/
```

## Adding or editing terms

Terms live in `src/data/terms/*.json`, one file per category. `npm run check:terms` fails if a card is missing a field, has a broken fill-in sentence, gives the answer away, or points at an unknown confusable term. Facts that change (rules, tax rates, timings) carry `asOf` and `source`.

After editing terms, run `npm run build:outline` (and `npm run build:modes`). It writes two files. The app ships only the skeleton, `src/data/skeleton.json`: areas and units, with how many terms each unit has, and no term names or ids. The outline, `src/data/outline.json`, has each term's name, aliases, unit and confusables, never what it means; only the Worker and the tests read it (`src/lib/syllabus.ts`). Everything else on a term, plus its talk items and Call It claims, is its card, and the Worker sends cards to each learner as they reach the terms (see "Who sees the content" below). The build fails if the outline is out of date, and `scripts/check-bundle.mjs` fails it if any definition, example, fill sentence, worked sum, claim or talk item, or any case step, meeting clip, Fermi working or backtest line, turns up in `dist/`. It also fails on any term id in `dist/` other than the ones the games use by name (`scripts/bundle-terms.json`), or on more than 100 term names, which would mean the list slipped in. `npm run build:modes` writes `src/data/modes/network.json` (which units the Lines network map joins, with no terms in it) and `tickers.json` (the Worker's: a ticker comes with its term's name).

## Adding or editing drills

Drill units live in `src/data/terms/skills.json` (units with `"kind": "drill"` and no terms). Each drill's question makers, round size, pass mark and time limit are in `src/lib/drills.ts`. `src/lib/drills.test.ts` checks hundreds of generated rounds: every answer is recomputed independently (sums, percentages, dice, coins, cards, Bayes) and the shown answer must be accepted when typed.

## Adding or editing talk items

Talk items live in `src/data/talk.json`. Each has a `format` (`decode`, `say`, `reply` or `misuse`), the `term` it practises, any `also` terms the learner must have met first, a `prompt` (not for `misuse`), a `who` for replies, four `options` with the right one first (for `misuse`, the sentence that uses the term wrongly), and a `why`. `npm run check:terms` checks all of this, and that the right option isn't much longer than the others, since length would give it away. `src/lib/talk.test.ts` checks that lessons never show an item before its terms are met.

## Adding or editing desk cases

Cases live in `src/data/cases.json`, keyed by the id of a unit with `"kind": "case"`. Each has a setup, a few facts, and steps; every step has 3 or 4 options, exactly one marked `best`, and a `why` for each option. `npm run check:terms` checks all of this, and that every term a step names exists. A learner passes with all but one best call. Run `npm run build:outline` after editing a case: the outline carries its number of steps and its setup.

Phase 3 areas are term files with `"phase": 3`; none of their units may be core. The readiness test's question pool (`PHASE3_PREREQS`) and the test itself are in `src/lib/phase3prereqs.ts`, which only the Worker reads, and its size in `src/lib/phase3.ts`.

The career map is `src/data/careers.json`: roles and interview rounds, each with the unit ids to practise. `npm run check:terms` checks that those units exist.

The guide's matching, extra names (abbreviations and short forms, in `SYNONYMS`) and help answers (`HELP`) are in `src/lib/guide.ts`. Matching needs every term's name, so it runs in the Worker (`POST /api/guide`, `worker/terms.ts`): the app sends each message there (`src/lib/guideApp.ts`) and turns a picked option into a reply itself (`src/lib/guideReply.ts`). `src/lib/guide.test.ts` checks that every term can be found by its own name, that typos and the usual ways of asking work, and that phase 3 and the password stay hidden. A new term needs nothing extra: the guide indexes it automatically.

## Adding or editing games

A game unit is a unit with `"kind": "game"` and `"game"` set to one of `market`, `payoff`, `greeks`, `kelly`, `guess`, `fermi`, `meeting`, `backtest`, `signal` or `pairs`. Each game's rules and pass marks are in its own file in `src/lib` (`market.ts`, `payoff.ts`, `greeks.ts`, `kelly.ts`, `guess.ts`, `fermi.ts`, `meeting.ts`, `backtest.ts`, `signal.ts`, `pairs.ts`), its screen is in `src/components`, and `src/lib/games.ts` says how big a round is, the pass rule and how a record reads. `src/lib/market.test.ts` and `src/lib/games.test.ts` play thousands of rounds to check that sound play passes and guessing doesn't.

Fermi questions are in `src/data/fermi.json`. A question that rests on a fact (a population, a count of accounts) needs a `source` link and an `asOf` date; a question you can work out (seconds in a session) needs neither. `npm run check:terms` checks them.

Meeting clips are in `src/data/meetings.json`: a setting, three to six lines, two questions with the right option written first, and the term ids the clip uses. `npm run check:terms` checks that every setting has enough clips, that the right option isn't much longer than the others, and that the terms exist and aren't in phase 3.

Backtest reports are in `src/data/backtests.json`. Each strategy has six clean lines (universe, data, signal and fills, costs, testing, result) and a list of cases; each case swaps one line for a flawed one, names the flaw, explains it in `why`, and gives the headline Sharpe, annual return and worst fall. `npm run check:terms` checks that each flaw sits in a line where it fits, that the flawed line differs from the clean one, and that every flaw appears in at least three strategies.

Signal lab and Pairs trader draw their data fresh each round. Their generators reject draws a careful player couldn't get right (noise that beats what luck gives, a pair that hits its stop without breaking), and `src/lib/games.test.ts` checks that across hundreds of rounds.

## The password

The quant switch and phase 3 ask for the same password. The Worker checks it (`POST /api/unlock`, eight wrong tries lock it for 15 minutes) and, once it is right, opens both on the account; the app holds no copy of it. Only a salted PBKDF2 hash is kept, in `UNLOCK_HASH` in `worker/index.ts`. To change the password:

```bash
node scripts/hash-password.mjs "new password"
```

Set the printed hash as a runtime secret named `UNLOCK_HASH` on the Worker (Settings, Variables and secrets), which takes the place of the one in the code, or paste it into `worker/index.ts`. Access granted on an account (below) does the same as the password.

## Who sees the content

Opening Inspect on the app shows what the browser was sent. So the browser is sent only what the learner is doing:

- Signed out, nothing: the sign-in page only (see below).
- Signed in, the app's code and the skeleton (areas, units and how many terms each has). At sign-in the app asks the Worker for the names of the terms the learner has reached (`POST /api/terms`, `worker/terms.ts`), and nothing else. Every lesson, round or case brings the names of the terms it shows, with their mix-ups listed only among terms the learner has reached. A unit's sheet names the terms the learner has reached and counts the rest. To find a term not reached yet, the learner searches the glossary or asks the Guide: both ask the Worker (`POST /api/search`, `POST /api/guide`), which needs 3 letters or more, sends at most 8 names a search, keeps phase 3 terms for accounts with phase 3, and allows 300 searches and guide questions a day per account (the admin has no limit). The path, its locks and every count work from unit sizes, so they need no other names (`src/lib/skeleton.test.ts` checks they come out the same as with the whole syllabus). Term Lines draws every station from the skeleton and names a station once the learner reaches its term (each name comes with its place on the line and its Exchange ticker); stations not met yet show as a count. The career map and the Guide's replies are files of their own, fetched only when the learner opens that screen; the other screens are code and are fetched ahead.
- A term's **card** is fetched only when the learner does something that shows it: opens a met term's sheet, opens a unit, starts a lesson that teaches it. The app gets a card only for a term the learner has reached (used in one of their lessons, tests or rounds, or met in their saved progress), and only the part that teaches it: what it means, examples and notes. What its questions are made from (fill sentence, near misses, worked sums, true-or-false items, desk talk, Call It claims) never leaves the Worker. Cards stay in memory for that visit only. Nothing is kept on the device, and older copies in IndexedDB are deleted (`src/lib/cards.ts`).
- The Worker (`worker/cards.ts`) has no daily allowance: learners take as many lessons, tests, cases and games as they like. Each ask carries at most 80 cards, an account can ask 120 times a minute, and at most 300 terms it has never had before can be used in any hour (a lesson teaches four). Phase 3 terms, cases and rounds go only to accounts with phase 3. The admin can look up any term and has no hourly ceiling. Every term given, and every case, game and round dealt, is recorded, so the admin sees each account's activity.
- Desk cases, meeting clips, Fermi questions and backtest reports are never sent whole (`worker/practice.ts`). Opening a case or game deals one round without its answers: a case's steps without which option is best or why, clips with shuffled options, Fermi questions without the answer, backtest reports without the flaw. Each answer is marked by the Worker, and only then does the right answer and the reason come back. The outline carries each case's length, and its setup for the unit sheet outside phase 3.
- Headline Desk and Finnections rounds are picked by the Worker from the terms the learner has met (`src/lib/modes/roundPick.ts`); the app never has the items or which terms they use, and asks the Worker whether each mode is open and which levels are ready (`POST /api/modes`, counts only). An item can only be marked once it was dealt to that account. Rounds are dealt (`worker/rounds.ts`) without their answers: a headline without its moves, terms or reason, and a board as sixteen shuffled tiles without its groups. Each call is sent to the Worker to be marked; a board's groups come back as they are found, and all of them once the board is over.
- Call It decks are dealt the same way (`worker/callit.ts`): each claim's text, without whether it is true. A call is marked by the Worker, and the truth and the reason come back then.
- Lessons, practice and weak-spot rounds, area tests, the phase 3 test, and the Lines and Exchange rounds are built by the Worker (`worker/session.ts`). The app sends which kind it wants and the learner's progress, and gets each question without its answer, plus the cards of the terms the lesson teaches. Every question carries a token: its answer and reason, sealed with a key only the Worker holds (kept in the `site` table). A pick is marked by sending the token back, and only then do the right answer, the reason and the term's card come. A match is checked one pair at a time. Every term a session asks about must be one the account may have, under the same rules as cards. A mock round's worked sums are dealt sealed the same way, and marked when the round ends.
- Until a met term's card arrives, its sheet says it is being fetched.

What is on screen is always in the browser, and an answer is there once the learner has given theirs. The games that make their rounds in code (the drills, market making, payoffs and the rest) ship their rules with the app. The app's progress is the learner's own record, so a script could claim terms it hasn't met and have lessons built on them; the hourly ceiling on new terms keeps that to about 300 terms an hour, and the admin sees it. The outline (term names, units, the Lines map) stays on the Worker: the app ships only the skeleton, and `scripts/check-bundle.mjs` fails the build if more than 100 term names turn up in `dist/`.

## Accounts and sync

Sign-in is invite-only and runs in the same Worker, in `worker/index.ts`, with a D1 database:

- The admin account (the email in `OWNER_EMAIL` in `wrangler.jsonc`, or in an `ADMIN_EMAIL` runtime secret, which wins) signs up without an invite. In Settings, the admin makes invite codes (each works once, for 14 days, and carries quant and phase 3 access), and can change any account's access or switch it off.
- The app itself is behind sign-in. The Worker runs first for every request (`run_worker_first: true`) and sends the app's files (its scripts, styles and images) only to a signed-in session; anyone else gets a small sign-in page (`worker/signin.ts`) and a 401 for every file, apart from the icons and the web manifest. Built files are cached as `private`, so only that person's browser keeps them.
- Everyone else signs up on that page with an invite code. Passwords are stored as salted PBKDF2 hashes; sign-in sets an HttpOnly session cookie for the whole site for 30 days; eight wrong passwords lock an account for 15 minutes.
- Progress is still saved in the browser first. A signed-in device also sends it to the server, which merges it with what other devices sent (`src/lib/sync.ts`: the further-along copy of each term, score and test wins). Resetting or restoring a backup starts over on every device.
- Tables are created on first use, so there are no migrations. Without a database, `/api/` answers 503 and the app's files stay shut. `npm run dev` runs the app without the Worker, so it needs no sign-in.

To set it up once, in the Cloudflare dashboard:

1. **Storage & databases → D1 → Create database**, named `fintermship`. Copy its database ID into `wrangler.jsonc`:
   ```jsonc
   "d1_databases": [{ "binding": "DB", "database_name": "fintermship", "database_id": "<the ID>" }]
   ```
2. **Workers & Pages → fintermship → Settings → Variables and secrets → Add**: type **Secret**, name `ADMIN_EMAIL`, value your email. Secrets stay put across deploys.
3. After the next deploy, open the sign-in page, pick **I have an invite**, and sign up with that email and no code.

Run it locally with a throwaway database: `npx wrangler dev` with a copy of `wrangler.jsonc` that has any `database_id` and a `vars` entry for `ADMIN_EMAIL`. `worker/api.test.ts` runs the API against SQLite in the tests.

## Deploy to Cloudflare

The app is served by a Cloudflare Worker named `fintermship`. `wrangler.jsonc` tells Cloudflare to run `npm run build` and serve `dist/` as static files, sending unknown paths to `index.html`, which is what gives every screen its own address. The Worker runs first for every request (`run_worker_first`), so it guards the app's files as well as `/api/`.

1. In the Cloudflare dashboard, go to **Workers & Pages**, then **Create**, then **Import a repository**, and pick this repository.
2. Keep the defaults: Cloudflare reads `wrangler.jsonc`, so the build and deploy commands can stay as suggested (`npm run build`, `npx wrangler deploy`).
3. Every push to `main` publishes a new version. Other branches and pull requests get a preview from `npx wrangler preview`, which reads the `previews` block in `wrangler.jsonc`. Previews use their own database, `fintermship-preview`, so their accounts and progress are separate from the live site's: sign up once there with the owner email to get the admin account.

To check the config locally without publishing: `npx wrangler versions upload --dry-run`.
