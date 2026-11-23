# fintermship UI plan

Written 14 November 2026. Copied from the project's Claude Doc so it lives in the repo.

> **Status (23 November 2026):** only partly done. Item 1 is partly in (a combo flame and light motion, PR 76). Item 4 is partly in (a Known/Due/Learning bar, PR 59). Items 2, 3, 5, 6, 7 and 8 are not built. Note that item 3's "area code" is out of date: the three-letter area codes were removed in PR 85 and must not come back; use the area's name.

## Verdict: targeted, not a revamp

Make targeted changes. A full revamp isn't justified yet. The dryness sits in the shell: the Path start screen and the lesson flow, which are what most sessions open on. The parts a revamp would replace are already working.

- The six modes each have their own look: newsprint for Headlines, a trading board for the Exchange, a metro map for Lines, a card deck for Call It. These went in with PRs 50 and 56 and fit their jobs well.
- The layout works. The bottom tabs (Learn, Progress, Guide, Glossary, Settings), the mode switcher and the shared KPI strip were tidied in PR 57. After PR 58 the numbers in the strip, the stations and the Exchange agree.
- A revamp would throw that away to fix something four or five focused PRs can fix. It would also break the consistency PR 58 just restored.

## Why it feels dry

The modes have personality, but Path, the default screen, has almost none. Here is what the screenshots show on a phone (390 px) and a laptop (1366 px):

- **One tone everywhere.** Every card on Path is the same beige with the same weight. Lines already gives each area its own colour (`metro.json`), but Path doesn't use those colours. So the unit list reads as plain text rows with numbered grey circles.
- **Too much explaining.** Nearly every card opens with a paragraph: About you, Your path, Weak spots, the KPI help. On a phone, About you fills the first screen above Today and Start lesson.
- **No reward moments.** A right answer only turns the border green. The whole app has four animations (pop, shake, sheet, tape), with no burst, combo, count-up or streak moment. A Duolingo-style app depends on these.
- **An empty lesson screen.** A meaning question puts four options in the top half of the phone and leaves the bottom 45% blank. Nothing shows the term's area or that the term matters.
- **Bare numbers.** Known, Due, Strength and Coverage are four mono numbers with no bar, trend or colour, other than Due in amber. Learning, Due and Known now add up to Met, so they can be drawn as one bar.
- **A grey week strip.** The seven grey dots read as empty, even on a 6-day streak.

## Targeted improvements

Eight changes, ordered by how much dryness each removes per hour of work. Effort is S (under a day) or M (one to two days).

| # | Change | Where | What it fixes | Effort |
| --- | --- | --- | --- | --- |
| 1 | Reward moments: a burst on a right answer, a combo counter at 3 in a row, an XP count-up and a "+N Known" chip on the results screen, a streak flame when the day's goal is met. All of it respects reduced motion. | Lesson, Results, all modes | No reward moments | M |
| 2 | Path in area colours: each unit row gets its area's colour stripe and code from `metro.json`, and the path spine is drawn as a coloured line, not grey circles. | Home (Path) | One tone everywhere | M |
| 3 | Lesson screen: an area-coloured band with the area code over the term, a segmented progress bar, and options that sit lower on a phone. After an answer, the example sentence fills the space. | Lesson | Empty lesson screen | S |
| 4 | KPI strip with visuals: one stacked bar of Learning, Due and Known (they add to Met), a small Strength gauge, and a 7-day trend arrow on Coverage. Tap opens the explainer, as now. | ModeBar | Bare numbers | S |
| 5 | Cut copy: each card intro becomes one line or goes. About you becomes a small "Add your name" chip shown after the first lesson, not above Today. | Home, Progress, Settings | Too much explaining | S |
| 6 | Week strip: days with practice fill with the brand colour, today shows a goal ring, and the streak shows as a flame row. | Home | Grey week strip | S |
| 7 | Mode accents: each switcher tab picks up its mode's colour when active, such as board green for the Exchange or newsprint for Headlines, so the switch shows what you're entering. | ModeBar | One tone everywhere | S |
| 8 | Locked modes: show the mode's own art (the previews from the old More pop-up) with a "4 terms to go" meter, not a dashed box. | Headline Desk, Finnections | Dry empty states | S |

## What would justify a full revamp

Any one of these would be a strong reason to rethink the whole layout, not just polish it:

- **Learners leave Path for the modes.** If most sessions are spent in Lines, the Exchange or the round modes, the start screen should become a mode hub, and Path should be one mode among six. The per-mode answer tallies on Progress can show this after a few weeks.
- **A native app or tablet-first layout.** The current shell is a web column with a sidebar on laptops.
- **Social features.** Leagues, friends or shared desks need new top-level places that five bottom tabs can't hold.
- **The shell still clashes with the six mode looks after items 1 to 7.** Test this by showing three to five learners the app after those PRs. If it still reads as dry or disjointed, revisit.

## Order of PRs and checks

Four PRs, each small enough to review in one sitting. All of them build on PR 58.

1. **Quick lift:** items 4, 5, 6 and 7 (KPI bar, less copy, week strip, mode accents). This gives the most visible change for the least code.
2. **Path in colour:** item 2.
3. **Lessons that reward:** items 1 and 3.
4. **Locked modes:** item 8.

Each PR gets the same checks:

- Before/after screenshots at 390 px and 1366 px, in Light and Dark, saved to the project files.
- A reduced-motion pass for anything animated.
- `npm run build` (including the bundle check), `eslint` and `vitest`.
- No change to how answers are recorded or how the KPIs are counted, so the PR 58 tests stay green.
