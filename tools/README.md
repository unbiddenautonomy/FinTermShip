# tools/

Rough one-off tools: audits, data fixers, screenshot or test harnesses that aren't part of the build. Nothing here is run by `npm run build` or `npm test`, and ESLint only checks `*.ts`/`*.tsx` files, so scripts here are not linted.

Rules:

- Paths are relative to the repo root (run as `node tools/<name>.mjs` from the root). No absolute paths to a machine or to the project's shared folder.
- Output (screenshots, logs, reports) goes outside the repo or into a gitignored folder, never into a commit.
- Anything that becomes a real build check moves to `scripts/` and gets an `npm run` entry.

Pushes that only touch `tools/` or `docs/` shouldn't deploy: see "Deploy" in `docs/BRIEF.md`.

## Tools

None right now. The glossary and chatbot knowledge-base tools are not part of the app, so they are kept outside the repo (gitignored).
