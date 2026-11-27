# fintermship brief

Read this first. It is the one page a new session needs; keep it current. Last updated 26 November 2026. Where this page and the code disagree, the code wins: fix this page.

## What it is

A Duolingo-style web app for learning and remembering trading, market and quant terms, tailored to the Indian market. It is for Nachi and their team, who are learning as they go so they can talk with traders and portfolio managers and prepare for quant roles. It is not for experts: every item carries its own explanation.

- **Repo:** `unbiddenautonomy/fintermship` (private; GitHub may still show the old name FinTermShip). Default branch `main`.
- **Live:** https://fintermship.workiket.workers.dev (invite-only sign-in). Pull request previews: `https://<branch>-fintermship.workiket.workers.dev`, with their own database.
- **Stack:** React 19, TypeScript, Vite 6, Tailwind 3, Vitest; a Cloudflare Worker (`worker/`) serves the app and the API; Cloudflare D1 (SQLite) for accounts and sync (`fintermship` live, `fintermship-preview` for previews). Node 22 (`.nvmrc`). Free Cloudflare plan only: no paid services, no card on file.
- **Content today:** 963 terms in 17 areas (864 in 15 areas plus 99 in two phase 3 areas), 72 desk-talk items, 6 drills, 14 games, 9 desk cases, 93 headlines, 48 Finnections boards, Call It decks built from the syllabus plus 369 hand-written claims, a career map and a rule-based Guide chat (no AI model). The README has the full list.
- **Six modes** share one record of each term and one scoreboard (Learning / Due / Known, Strength, Coverage): Path (the default, the original lesson track), Term Lines (metro map), Call It (true/false cards), Recall Exchange (terms as stocks), Headline Desk and Finnections. Each mode has its own sessions and look; nothing carries over mid-session.

## Standing rules

- **Linux runners only** (`ubuntu-latest`) for any GitHub Actions workflow; never macOS or Windows. There are no workflows today; don't add workflows or triggers without asking.
- **Fewer, larger commits.** Batch related changes into one commit and push once per piece of work.
- **Every push costs a Cloudflare build** (free plan, limited build minutes). Test locally first, push only when ready, no work-in-progress or fix-up pushes, no branches pushed just for a preview unless Nachi needs one.
- **Docs and tooling must not deploy.** Keep docs in `docs/` and rough tools in `tools/`. Cloudflare skips them only through the dashboard's Build watch paths (see "Deploy" below). `[skip ci]` in a commit message is not documented to stop a Cloudflare build.
- **Never commit local test artifacts:** screenshots, scratch scripts, temp data, logs, local databases. Screenshots go in the project's shared files, not the repo.
- **Keep every useful script, spec and prompt in the repo,** never only in the project folder.
- **Run the checks before pushing:** `npm test`, `npm run lint`, `npm run build` (the build also validates content and fails if term content or the term list leaks into `dist/`).

## How Nachi likes to work

- Merge your own PRs once checks pass; don't ask each time. Exceptions: anything that can't be undone, or when Nachi says to wait.
- Write the complete change in one go; test near the end, not after every step.
- Short, plain replies. Lead with the result. Recommend one option instead of listing many.
- Make samples first for anything new and visual (new modes, looks, logos), at easy, medium and hard where it applies, and give an honest verdict: Nachi dislikes "try-hard" or pretentious results.
- Nachi pushes back on vague claims ("are we really sure?"). Verify thoroughly before saying something is done or checked; say what wasn't checked.
- Content correctness comes first: wrong or ambiguous questions hurt the app's image.
- Name things in plain words (no three-letter codes), and write "fintermship" in lowercase everywhere.

## Design rules

- **Brand:** Nachi's bull-and-bear medallion logo; the theme comes from its two colours, deep green (`--brand`) and copper. Wordmark is lowercase "fintermship" in Outfit Light. Body text Manrope, headings Fraunces, numbers JetBrains Mono. Right and wrong stay a soft green and red in every theme.
- **Themes:** Auto, Light (ivory), Seasonal, Dark. Seasonal replaced White (PR 87): its palette, garland, Today-card sprite and badge follow the date, from Diwali to F1 (`docs/specs/seasonal-themes.md`; art drawn by `scripts/season-art.py`). A texture switch adds the brushed texture sampled from the logo itself, never generated noise.
- **Not generic.** Avoid the default "AI app" look (beige cards everywhere, pill buttons, one earthy accent). Each mode keeps its own visual language: Path trail, metro map, card deck, trading board, newspaper, tile grid. Don't copy another app's look.
- **Menus:** one current-mode button that opens a picker of cards, each drawn in its mode's own look, with a lock and "N terms to go" when closed. No rows of mode tabs.
- **Backdrops and popups:** sheets and popups cover the whole page (laptop included); closing returns you exactly where you were (career map, Guide, glossary scroll). The glossary page scrolls as a whole.
- **Term Lines:** lines named in words, a list overview with progress bars, the network map folded away until tapped, each line a continuous strip; rails and stations in a smooth polished-metal finish (`src/components/modes/metal.ts`).
- **Art and motion:** seasonal motifs only in empty space, never under text. Motion is subtle (card tilt and flip, a glow on right, a short shake on wrong) and off under reduced motion.
- **Laptop gets its own layout** (sidebar), not a stretched phone screen.

## Decided: don't reopen

The full log with reasons is `docs/decisions.md`. In short: the browser gets only what the learner has reached (no full term list, answers marked on the server, no daily caps); invite-only accounts, one code per person; one password opens both the quant switch and phase 3 (hash only, in `UNLOCK_HASH`); the 10-second speed rule is dropped; very basic terms go through the easy-terms quiz (right = never again, wrong = back twice); overlapping terms never appear as each other's wrong options; Path is the default landing, changeable in Settings; no SQL, no interview soft skills, never teach coding; Chain, Trade Ticket and Teach the Intern are dropped.

## Open items

1. **Seasonal themes:** merged (PR 87). Check the 2028 to 2030 Navratri dates; Hindu festival dates run out after 2030.
2. **Cloudflare Build watch paths:** Nachi to set them in the dashboard (below). Until then docs pushes still deploy.
3. **Approved modes not yet built:** QuantWord (crossword), Chart Tag, Shock Desk, Name the Regime, Limit Breach, Factor Sort. Squawk Box is parked for much later. Hand-naming the Exchange tickers is scheduled last.
4. **UI plan** (`docs/plans/ui-plan.md`): mostly not built (Path in area colours, lesson screen, copy cuts, week strip, mode accents, locked-mode art).
5. **From the 18 November analysis** (`docs/analysis/`): password reset, longer sessions, security headers, self-hosted fonts.
6. **Nachi's calls:** run tests in the Cloudflare build (costs build minutes)? Lower the 20-new-terms-a-day default? The buyback-arbitrage tax wording may be out of date after the 2026 Budget.
7. **Later, from the first plan:** small reward "infomercials", flowcharts and explanations once the main app is done.

## Deploy

Cloudflare Workers Builds is connected to the repo: a push to `main` deploys production; other branches get a preview (`npx wrangler preview`, `previews` block in `wrangler.jsonc`). Build command `npm run build`, deploy `npx wrangler deploy`. Setup steps, D1 and secrets are in the README.

**To stop docs-only pushes deploying** (dashboard only, nothing in the repo can do it): Workers & Pages → fintermship → Settings → Build → Build watch paths. Keep Include `*` and set Exclude to `docs/*`, `tools/*`, `*.md`. A push that also changes code still builds. To save more, turn off builds for non-production branches in the same Build settings, and turn them on again when a preview is needed.

## Where things are

- `README.md`: features, how content is stored and checked, who sees what, accounts, deploy setup.
- `CLAUDE.md`: rules for Claude sessions.
- `docs/decisions.md`: decision log. `docs/specs/`: specs (seasonal themes). `docs/plans/`: plans (UI plan). `docs/analysis/`: the 18 November analysis. `docs/design/concepts/`: the four original design concept mockups (open the HTML in a browser).
- `scripts/`: build-time checks and generators (`validate-terms`, `build-outline`, `build-modes`, `check-bundle`, `hash-password`). `tools/`: rough one-off tools kept out of the build. The glossary and chatbot knowledge-base tools are not part of the app and are gitignored, kept outside the repo.
- Content: `src/data/` (terms, talk, cases, meetings, fermi, backtests, careers, modes). Worker: `worker/`. Tests sit next to the code (`*.test.ts`).
- Kept outside the repo, in the project's shared files: screenshots, videos, the old source zips (v0.1 to v0.4), uploaded logo images.
