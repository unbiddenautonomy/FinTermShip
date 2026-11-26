# Notes for Claude

Start with docs/BRIEF.md and keep it current. Keep every useful script, spec and prompt in the repo, never only in the project folder.

## Commits, pushes and CI minutes

Cloudflare build minutes and GitHub Actions minutes are both limited each month, so:

- **Fewer, larger commits.** Commit once per finished piece of work, not after every small step. Squash work-in-progress commits before pushing.
- **Push once, at the end of a task.** Every push starts a Cloudflare Workers build (a production deploy on `main`, a preview on other branches), and the free plan's build minutes are limited, so don't push after each commit, and don't push work in progress.
- **Docs and tools don't deploy.** Put docs in `docs/` and rough tools in `tools/`. Cloudflare skips pushes that only touch those paths once Build watch paths are set in its dashboard (see "Deploy" in `docs/BRIEF.md`). `[skip ci]` is still worth adding to docs-only commits, but it is not documented to stop a Cloudflare build.
- **Linux runners only.** Workflow jobs use `runs-on: ubuntu-latest`. Never macOS or Windows runners: they use minutes 10× and 2× faster.
- **Don't add new workflows or triggers** (for example on every branch push, or on a schedule) without asking first. There are no GitHub Actions workflows today.
- **No local test artifacts in commits:** screenshots, scratch scripts, temp data, logs, local databases. Screenshots go in the project's shared files.
