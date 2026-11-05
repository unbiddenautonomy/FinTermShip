# FinTermShip

A Duolingo-style web app for learning and remembering trading and market terms, tailored to the Indian market.

This is version 0.1, the first playable step of the plan:

- 101 terms in 2 categories (Money and market basics, Indian market essentials), each with a definition, desk-style examples, a fill-in sentence and hand-written wrong options.
- A two-pass path: the core units of every category first, then the rest.
- 5 exercise formats: new-term card, pick the meaning, pick the term, match pairs, fill the gap.
- A 7-step spaced repetition ladder (1, 3, 7, 16, 35, 120 days; core terms 20% sooner).
- Progress saved in the browser (IndexedDB), with backup export and import.
- Speaker buttons using the browser's built-in voice (Indian English when available).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scheduler and lesson tests
npm run check:terms  # validates every term card
npm run build      # checks terms, type-checks, builds to dist/
```

## Adding or editing terms

Terms live in `src/data/terms/*.json`, one file per category. `npm run check:terms` fails if a card is missing a field, has a broken fill-in sentence, gives the answer away, or points at an unknown confusable term. Facts that change (rules, tax rates, timings) carry `asOf` and `source`.

## Deploy to Cloudflare

The app is a static site served by a Cloudflare Worker named `fintermship`. `wrangler.jsonc` tells Cloudflare to run `npm run build` and serve `dist/` as static files, sending unknown paths to `index.html`.

1. In the Cloudflare dashboard, go to **Workers & Pages**, then **Create**, then **Import a repository**, and pick this repository.
2. Keep the defaults: Cloudflare reads `wrangler.jsonc`, so the build and deploy commands can stay as suggested (`npm run build`, `npx wrangler deploy`).
3. Every push to `main` publishes a new version. Other branches and pull requests get a preview from `npx wrangler preview`, which needs the `previews` block in `wrangler.jsonc` (empty means it uses the same settings).

To check the config locally without publishing: `npx wrangler versions upload --dry-run`.
