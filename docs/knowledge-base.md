# Knowledge base for a vector database

`tools/build-knowledge-base.mjs` turns the syllabus into `knowledge-base.jsonl`, a file of chunks ready to embed into a vector database. A chatbot can then look up the right chunks and answer questions about finance and markets from them. Nothing in the app uses this file.

```
node tools/build-knowledge-base.mjs [out-dir]     # default glossary-out/ (gitignored)
```

Run it again whenever the terms change. The output holds the whole syllabus, which the app never sends to a browser, so keep it out of the repo and out of `public/`, and only load it into a database you control.

## What is in it

3,166 chunks today, every one written from `src/data` (nothing new is written by hand, so it is as correct as the app's content):

| Type | Count | What it answers |
|---|---|---|
| `term` | 963 | "What is X?", "How is X calculated?", "What does it mean when X rises?" Each chunk has the term and its other names, area and unit, short line, definition, formula, what a rise or fall means, note, how it's said, example sentences, true facts and common mistakes, worked calculations, desk-talk lines, and the terms it is easily mixed up with. Median 860 characters, at most about 1,800. |
| `comparison` | 2,187 | "What's the difference between X and Y?" One chunk per pair the app marks as easy to mix up or overlapping, with both definitions. |
| `area` | 16 | "What should I learn about options?" The terms in each area, unit by unit. |

## Format

One JSON object per line:

```json
{
  "id": "term:repo-rate",
  "type": "term",
  "title": "repo rate",
  "text": "repo rate (also called policy repo rate, policy rate)\nTopic: Rates, macro and the rupee, The RBI and policy rates.\nIn short: ...",
  "questions": ["What is repo rate?", "What does repo rate mean?"],
  "metadata": {
    "term_id": "repo-rate", "names": ["repo rate", "policy repo rate", "policy rate"],
    "area": "macro", "area_name": "Rates, macro and the rupee", "unit": "The RBI and policy rates",
    "core": true, "difficulty": 1, "basic": false, "phase3": false,
    "related": ["sdf", "msf", "inflation-target"],
    "as_of": "2026-11", "time_sensitive": true, "source": "https://www.rbi.org.in/..."
  }
}
```

- `id` is stable across rebuilds, so re-running and upserting by `id` updates chunks instead of duplicating them. A term renamed or removed in the syllabus leaves its old chunk behind: delete ids that are no longer in the file.
- `text` is what to embed and what to give the model as context. Every chunk names its own term and topic, so it reads correctly on its own.
- `questions` are sample questions the chunk answers. Embedding them as extra vectors that point to the same chunk (or adding them to the embedded text) helps short questions find the right chunk.
- `metadata` is for filters and display: `area` to narrow a search, `phase3` to hide the phase 3 strategies from people who don't have them, `related` to pull in neighbouring terms, `time_sensitive` and `as_of` to warn that a figure may be out of date.

## Loading it

A vector database is not trained: each chunk's `text` is turned into a vector by an embedding model and stored, and a question is matched to the nearest vectors.

1. Embed each line's `text` with one embedding model, and store the vector with `id`, `text` and `metadata`. The chunks are short enough for any embedding model, so don't split them further.
2. At question time, embed the question, fetch the top 5 to 8 chunks, and pass their `text` to the chat model with an instruction to answer only from them.
3. For "what is X" questions, prefer the `term` chunk: a simple way is to also match the question against `metadata.names`, and put that term's chunk first. Without this, the comparison chunks that mention X can rank above X's own chunk.
4. When a retrieved chunk has `time_sensitive: true`, have the bot say the figure is as of `as_of` and point to `source`.

## Limits

- It covers what the app teaches: terms and how traders and analysts use them, with an Indian market focus. It has no prices, news, or company data, and it is not investment advice; the chatbot should say so when asked what to buy or sell.
- 79 terms carry figures with an as-of date (lot sizes, rates, tax rules). They go stale; rebuild after the content is updated.
- The phase 3 areas (Options and futures strategies, Arbitrage and systematic strategies) are included and flagged with `phase3`.
