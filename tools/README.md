# tools/

Rough one-off tools: audits, data fixers, screenshot or test harnesses that aren't part of the build. Nothing here is run by `npm run build` or `npm test`, and ESLint only checks `*.ts`/`*.tsx` files, so scripts here are not linted.

Rules:

- Paths are relative to the repo root (run as `node tools/<name>.mjs` from the root). No absolute paths to a machine or to the project's shared folder.
- Output (screenshots, logs, reports) goes outside the repo or into a gitignored folder, never into a commit.
- Anything that becomes a real build check moves to `scripts/` and gets an `npm run` entry.

Pushes that only touch `tools/` or `docs/` shouldn't deploy: see "Deploy" in `docs/BRIEF.md`.

## Tools

- `build-glossary.mjs`: builds the complete glossary (every term with its explanation, formula, notes, examples and mix-ups) as a searchable page plus a Markdown copy: `node tools/build-glossary.mjs [out-dir]` (default `glossary-out/`, gitignored). The page template is `glossary-page.html`. The output is the whole syllabus, which the app never sends to a browser, so keep it out of the repo and `public/`.
- `build-knowledge-base.mjs`: builds `knowledge-base.jsonl`, the syllabus as chunks for a vector database (terms, mix-up comparisons, areas). Format and loading steps: `docs/knowledge-base.md`.
- `kb-eval/`: 100 test questions for the knowledge base and a scorer (`node tools/kb-eval/score.mjs`). See `docs/knowledge-base.md`.
