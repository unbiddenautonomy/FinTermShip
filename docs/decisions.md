# Decision log

What Nachi decided in the project chat (4 to 23 November 2026). These are settled: don't reopen them without Nachi asking. Where the code shows how a decision was built, the file is named.

## Product and audience

- **Audience:** newcomers to markets by default; the aim is fluency on desks and in meetings with traders and PMs, and readiness for quant roles. Nachi and the team learn alongside the app, so every item explains itself.
- **India first:** Indian market terms come early and appear in every area. Commodities come after a basic grasp, private markets later, crypto last.
- **Pace:** assume heavy use. A first pass covers the common (core) terms of every area before going deep, so nobody waits months to meet common terms. Default 20 new terms a day; reviews capped at 80 a day (`src/lib/scheduler.ts`).
- **One track:** term lessons, drills, games and cases sit on one path. Learners may pick any open unit; advanced units open per area by finishing its core units or passing its area test.
- **Phase 3 (trading strategies):** at the end of the track, opened by the password plus a 20-question readiness test (16 to pass).
- **Quant switch:** in Settings, behind the same password, puts the quant areas first.
- **Content approval:** Claude verifies and approves content itself; Nachi doesn't review each card.
- **Out of scope:** SQL, interview soft skills, and teaching coding anywhere in the app. The interview-date question was removed.
- **Company fundamentals** include what a rising or falling number means for traders, and which documents to open on results day.
- **Basic terms:** an easy-terms quiz before the first lesson (existing learners get it once from Home). Right means the term never comes back; wrong means it comes back twice (`src/lib/easy.ts`).
- **Ambiguity:** when two options both fit, the extra one is swapped for a clearly wrong option; fill-the-blank questions stay on. Overlapping terms never appear as each other's wrong options, in Call It too (PR 83).
- **Speed rule:** dropped. A right answer moves a term up however long it took (PR 77).
- **Open everything (admin):** treats every term as learnt in all modes and practice, without changing Exchange scores (PR 81). On by default for the admin, with a switch to see the learner view.

## Modes

- The original app stays as **Path**, the default landing; each learner can pick another opening mode in Settings.
- Modes share one syllabus and one record per term, and the same KPIs; each mode has its own sessions and progress, and nothing switches mid-session.
- A right Call It answer can never make a term Known; picking a meaning or a true/false call never makes a term Known on its own.
- Modes unlock by terms met, not by days. A locked mode shows how many terms it needs.
- Approved and built: Term Lines, Call It, Recall Exchange, Headline Desk, Finnections.
- Approved, not built: QuantWord (crossword, named by Nachi), Chart Tag (only with a good set of examples at varying difficulty), Shock Desk, Name the Regime, Limit Breach, Factor Sort. Keep them separate modes; merge only if samples show one is too thin.
- Parked for much later (don't reject, don't build): Squawk Box.
- Dropped: Chain, Trade Ticket, Teach the Intern, and the maths/MBA-style ideas (Ballpark, Higher or Lower, In Order, Red Pen, Formula Builder, Client Chat).
- Headline Desk and Finnections content is fixed, written and checked by Claude (not generated on the fly), plentiful, across subjects and levels.
- Exchange tickers keep generated names for now; hand-naming them is the last step of the plan.
- Mode selection is one current-mode button with a picker of cards, not tabs.

## Privacy of content

- Opening Inspect must not reveal the syllabus, even to invited users. The browser gets only what the learner has reached: no full term list (the app ships a skeleton of areas, units and counts), cards only for reached terms, rounds dealt and answers marked by the Worker, search on the server (3+ letters, 8 results). See "Who sees the content" in the README.
- No daily caps on lessons, cases or games; only rate limits and an hourly ceiling on new terms to stop scripts.
- Learners can still pick any unit, search, and use the career map. Long lists load in sections, 15 units at a time.

## Accounts and hosting

- Free Cloudflare only (Workers, D1 free tier; no credit card). Invite-only sign-up; the admin email signs up without a code; each invite works once and carries quant and phase 3 access.
- The admin email lives in `wrangler.jsonc` (a dashboard secret never reached the running Worker); a runtime secret `ADMIN_EMAIL` still wins if set.
- Previews use their own D1 database, `fintermship-preview`.
- The app runs in the browser (installable as a web app); no native desktop app.

## Look and feel

- Theme from Nachi's own logo (green and copper); lowercase "fintermship" in Outfit Light everywhere. Earlier lilac and "no green" direction was replaced by this.
- Right/wrong stay a soft green and red in every theme.
- Texture switch uses texture sampled from the logo.
- Seasonal themes replace White (spec: `docs/specs/seasonal-themes.md`, PR 87).
- UI: targeted changes over a full revamp unless there's a really good reason (`docs/plans/ui-plan.md`).
- Term Lines: calmer list overview, folded network map, metallic rails (PR 86). Three-letter area codes removed everywhere (PR 85).
- Back during a lesson leaves without an "are you sure" prompt; answers are kept, the round bonus is lost.

## Working rules

- Linux runners only; fewer, larger commits; one push per finished piece of work; no WIP pushes or preview-only branches; no local test artifacts in the repo; screenshots in the project files.
- Claude merges its own PRs once checks pass.
