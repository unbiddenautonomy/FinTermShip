# FinTermShip improvement analysis

> **Status (23 November 2026):** most of this was fixed in PRs 77 to 80: sync bugs 1 to 3, the speed rule (dropped), bugs 4 to 8, the phone overflow, back button and refresh, contrast and landmarks, smaller sync payloads. Still open: password reset, sessions that end 30 days after sign-in, security headers (CSP, nosniff, frame, referrer), self-hosting the fonts, fetching a lesson's marks ahead of time, the 7-day review forecast, and running tests in the Cloudflare build (Nachi's call). Line numbers below are from 18 November and have moved.

18 November 2026. Analysis only: no code was changed, committed or pushed.

## Summary

The app is solid underneath, and there is clear scope for improvement. All 338 tests pass, build and lint are clean, and I found no way to read answers or content out of the shipped app. The scope sits in four places: sync loses some learner data, one scheduling rule slows learners down, phones show layout and navigation faults, and each answer costs more network than it needs to.

| Priority | What | Why it matters | Size |
|---|---|---|---|
| 1 | Sync drops Headline Desk and Finnections levels | Levels fall back to 1 after every sync, so the level system never sticks | Small |
| 2 | Sync brings back cleared values and lets an older copy undo a review | Un-picked units, cleared names and newer reviews revert | Small |
| 3 | The 10-second rule | A learner who reads at an average pace meets about a fifth fewer terms in ten weeks | Small, needs a decision |
| 4 | Sideways overflow in Headline Desk, a blank app when a screen fails to load, shortcuts that fire with Ctrl or Cmd | Visible breakage | Small |
| 5 | One whole-progress upload per answer | 47 to 126 KB up and down, about once per answer | Medium |
| 6 | Back button, first-run layout, text contrast | Affects every session | Medium |

Each finding is marked **Reproduced** (I ran the repo's code or the built app against a local copy of the server), **Measured**, or **Read** (from code only).

## Fix first: bugs

Three of these lose or distort saved progress, and all eight are small fixes.

| # | Bug | Evidence | Where | Fix |
|---|---|---|---|---|
| 1 | Sync wipes `level`, `good` and `seen` for Headline Desk and Finnections. A record at level 3 came back with only sessions, answers, right and last. | Reproduced | `src/lib/sync.ts:84`: `mergeModes` copies a fixed list of fields | Merge the three fields (level and good from the copy played last, `seen` by latest date). Add mode cases to `sync.test.ts`, which has none. |
| 2 | Cleared values return after sync: an un-picked unit, a cleared name or target. | Reproduced | `sync.ts:57-61`: object spreads, so a missing key loses | Store an explicit empty value, or a changed-at time per field. |
| 3 | An older copy can undo a newer review. The term copy with the higher `seen` count wins, even when the other was reviewed later. | Reproduced | `sync.ts:26` | Compare the last review date first. |
| 4 | Lesson shortcuts ignore modifier keys. Ctrl+2 and Cmd+1 each answered a question. The same handler takes T and F, so Ctrl+F or Ctrl+T would answer a true or false question. | Reproduced | `src/components/Lesson.tsx:225` | Return early when Ctrl, Cmd or Alt is held. |
| 5 | When a screen's script fails to load, the whole app goes blank with no message. | Reproduced by blocking the Glossary script | `src/App.tsx:530`: no error boundary around the lazy screens | One error boundary with a reload button. |
| 6 | Headline Desk overflows sideways on phones: 20 px at 390 px wide, 35 px at 375, 50 px at 360. The streak and XP chips are cut off. Finnections overflows 8 px at 375 and Exchange 3 px at 360. | Measured | `src/components/modes/ModeBar.tsx:57`: the mode name row cannot shrink | `min-w-0` and truncate on the name. |
| 7 | 24 of 963 pick-the-term prompts have the gap glued to other letters, including the first term every learner meets ("share" gives "____holder meetings"). | Measured | `src/lib/questions.ts:133`: replaces the name with no word boundary | Blank on word boundaries, and add the check to `check:terms`. |
| 8 | Backtest, Desk case, Fermi and Meeting swallow a failed mark, so a tap does nothing when offline. Lessons handle this well ("You seem to be offline"). | Read | `BacktestGame.tsx:59`, `DeskCase.tsx:91`, `FermiGame.tsx:43`, `MeetingGame.tsx:64` | Show the lesson's message. |

## Learning design

The 10-second rule holds back correct answers. A correct review only moves a term up when it is answered within 10 seconds of the question appearing (`src/lib/scheduler.ts:100`), and the clock includes reading time and any time the tab is hidden (`Lesson.tsx:162`).

| Ten weeks at 85% accuracy | Terms met | Known | Mastered |
|---|---|---|---|
| The repo's simulation as written (every answer takes 6 s) | 864 | 780 | 179 |
| Same simulation, answer time from reading at 240 words a minute | 699 to 710 | 521 to 537 | 106 to 130 |
| Reading at 200 words a minute | 611 | | |
| Reading at 180 words a minute | 534 | | |

- 76% of pick-the-term prompts (median 40 words) and 83% of desk-talk prompts (median 69 words) cannot be read in 10 seconds at 240 words a minute. About 95% of worked sums miss it once 8 seconds are allowed for the sum.
- These formats are the ones used at the higher steps, so the rule bites hardest where terms should be graduating.
- Options: scale the limit with the prompt's length, pause the clock while the tab is hidden, or drop the limit for sums and desk talk. Whichever is chosen, `src/lib/simulation.test.ts:81` should use reading-based times, because today it cannot see this.

Smaller points:

| Point | Evidence | Suggestion |
|---|---|---|
| The Home ring counts only new terms. It showed "0 of 20 new" with 76 reviews due, so on a review-heavy day it never moves. | Measured | Count the day's reviews too. |
| The wrong-answer sheet fully covers the fourth option, which was the correct one in the case captured. | Measured, screenshot | Pad the options so they scroll clear of the sheet. |
| Refresh or the back button mid-lesson drops the lesson. Answers already given are kept. | Reproduced | Offer to resume. |
| Progress has no forecast of coming reviews, and the Glossary shows the next review as a raw date such as 2026-11-25. | Read | A seven-day forecast, and "in 3 days". |

## Modes

The level reset in bug 1 is the main problem in the modes. All five modes opened and dealt content for a three-week learner. I did not play full rounds in each, so difficulty and balance are not assessed here.

| Point | Evidence | Suggestion |
|---|---|---|
| On phones the mode picker shows names only. "Lines", "Call It" and "Exchange" get no description below 640 px. | Measured (`ModePicker.tsx`, `hidden sm:block`) | Show a one-line description on phones. |
| The picker does not hold keyboard focus. Tab moves into the page behind it, and focus is not returned to the Switch button on close. | Reproduced | Trap focus and restore it. |
| Each mode spends about a third of a phone screen on the shared header and numbers strip before its own content. | Measured | Collapse the strip inside modes. |
| The "/" search shortcut is off in Headline Desk and Finnections. | Read (`App.tsx:230`) | Add both to the list. |

## UX, accessibility and performance

**Navigation and first run**

- The app keeps no browser history. The back button mid-lesson leaves the app, a refresh always lands on Home, and no screen can be linked to. Reproduced. Push a history entry per screen and confirm before leaving a lesson.
- On a first run at 390 by 844, "Start lesson" starts at 851 px, below the fold, under a strip of zeros and the optional About you form. The first green button a new learner sees is "Save". Measured, screenshot. Hide the strip until it has numbers, and ask About you after the first lesson.
- While an answer is being marked, the options disable but the tapped one is not highlighted and nothing shows work in progress. Reproduced with a 2.5 second delay.

**Accessibility** (axe run on the five tabs and a lesson, light and dark)

- In the light theme the secondary text colour (`ink-3`, #727a70) is 4.39:1 on cards and 3.72:1 on tinted backgrounds, against the 4.5:1 minimum. There are 13 to 34 instances per screen, some at 10 px. #626a60 passes on both. The dark theme passes.
- The tab screens have no `main` landmark and Home has no `h1`. `aria-label` on plain spans (streak days, ticks) is ignored by screen readers. Two progress rings are `role="img"` with no label.
- The lesson question screen passed with no findings.

**Network cost**

- The first lesson (17 questions, 56 seconds) made 18 `/api/mark`, 15 `PUT /api/progress` and 4 `/api/modes` calls. Each PUT uploads the whole progress and gets it all back: 47 KB at three weeks, 126 KB at six months, uncompressed on the way up. Push at lesson end and when the app is hidden, send only changed terms, or reply with nothing when the server has nothing new.
- Opening the app fetches the progress and then always pushes it straight back, 47 KB each way, even when nothing changed (`src/components/useAccount.ts:97`).
- `/api/session` and `/api/round` upload the whole progress (53 KB) to deal a lesson or a round.
- Every answer waits on a server round trip. The mark does not depend on the pick (`worker/session.ts`), so a lesson's marks could be fetched in the background after dealing with no loss of protection. Feedback would be instant and a started lesson could finish offline.
- Fonts: four families from Google Fonts, about 138 KB, through a render-blocking third-party stylesheet (`index.html:17`). Self-host them and drop one.

**Account and server** (Read)

- A forgotten password cannot be recovered. Changing it needs the current one, and the admin screen cannot reset it (`worker/index.ts:394`, `:592`).
- Sessions end 30 days after sign-in, even for someone who uses the app daily (`worker/index.ts:67`).
- Pages are served without Content-Security-Policy, `nosniff`, frame or referrer headers.
- The admin list parses every learner's whole progress on each load (`worker/index.ts:551`). Fine now, slow later.

## Code quality and tests

The code is in good shape, and the gaps are in what guards it. It is typed throughout, lint reports 0 errors and 4 warnings, and I read the Worker's marking code without finding a bug.

- Tests and lint gate nothing. The Cloudflare build runs `npm run build`, which runs neither `vitest` nor `eslint`, and there is no CI workflow. 28 of the 31 test seconds are `guide.test.ts`, so the rest could join the build for about 3 seconds.
- The bugs above sit where tests are missing: mode sync, cleared values, slow answers in the simulation, keyboard handling.
- The README is out of date. It says 653 terms in 11 categories and 60 in phase 3 (now 963 in 17 areas, 99 in phase 3) and "10 games" (14), and it describes sign-up, file serving and the outline as they used to be.
- Dead code: `settings.interviewDate` and `projects` in `src/lib/types.ts` are never used, and `drill()` always resolves true, so the `if (!opened)` branch in `drillFrom` cannot run.

## Suggested order of work

Six pieces, grouped so pushes and builds stay few.

| # | Piece | Covers | Size |
|---|---|---|---|
| 1 | Sync correctness | Bugs 1 to 3, with tests | Small |
| 2 | Speed rule | The chosen option in `review()`, plus the simulation test | Small |
| 3 | Quick fixes | Bugs 4 to 8 | Small |
| 4 | Sync cost | Fewer and smaller uploads, no push after an unchanged pull | Medium |
| 5 | Navigation and first run | History entries, leave confirm, first-run layout, picker descriptions and focus | Medium |
| 6 | Accessibility and housekeeping | Contrast, landmarks, tests in the build, README, password reset, headers | Small each |

Two calls are yours: whether to loosen or drop the speed rule, and whether fetching a lesson's marks ahead of time fits how you want content protected.

Not covered: full rounds in every mode and game, real devices and Safari, and a screen reader.

Screenshots are not in the repo. They stay in the project's shared files under `analysis/screenshots/`: `headline-desk-375px-overflow.png`, `first-run-390px.png` and `wrong-answer-sheet-covers-options.png`.
