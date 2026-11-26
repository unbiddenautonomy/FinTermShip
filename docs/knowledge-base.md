# Knowledge base for an investor chatbot

`tools/build-knowledge-base.mjs` turns the syllabus, plus investor content written for the chatbot, into chunks ready to embed into a vector database. The chatbot looks up the right chunks and an LLM writes the answer from them. Nothing in the app uses these files.

```
node tools/build-knowledge-base.mjs [out-dir]     # default glossary-out/ (gitignored)
```

It writes two files:

- `knowledge-base-investor.jsonl`: **the one to load for the investor chatbot.** 1,178 chunks, only what an ordinary investor needs: no options trading, F&O, quant research or desk work.
- `knowledge-base.jsonl`: everything, 3,320 chunks, each tagged with its audience, in case you later want options basics or more.

Run it again whenever the content changes. The output holds the whole syllabus, which the app never sends to a browser, so keep it out of the repo and out of `public/`, and only load it into a database you control.

## How the chatbot should split the work

| Part | Does | Example |
|---|---|---|
| Backend (your investment database and code) | Works out every number and every comparison: growth, ratios, the company's own history, the sector median, the benchmark, inflation | "Revenue YoY +12%. 5-year average 15%. Sector median 9%. CPI inflation 5%." |
| Vector database (these chunks) | Explains what a metric means, what moves it, what's normal for which kind of company and the usual traps | `guide:read-growth`, `term:yoy-growth`, `term:it-services-sector` |
| LLM | Puts the two together in plain words, as analysis, never as a buy or sell call | "12% is slower than this company's usual pace but ahead of its sector…" |

Never let the LLM calculate or recall figures: pass them from the backend. Tell it to answer only from the chunks and the figures it is given, to say when it doesn't know, and to decline buy, sell or "which stock will rise" questions.

## What is in it

| Type | All | Investor file | What it answers |
|---|---|---|---|
| `term` | 1,023 | 418 | "What is X?" Term, other names, topic, short line, definition, formula, what a rise or fall means, notes, examples, true facts and common mistakes, worked calculations, and the terms it is mixed up with. |
| `guide` | 12 | 12 | "Is this number good?" How to judge growth, margins, profit quality, P/E, ROE and ROCE, debt, dividend yield, a big price move, fund returns, your own returns, fund risk numbers and shareholding changes. |
| `comparison` | 2,265 | 740 | "What's the difference between X and Y?" One chunk per pair marked as easy to mix up, with both definitions. |
| `area` | 20 | 8 | "What should I know about mutual funds?" The terms in each topic. |

Most of it comes from the app's syllabus (`src/data`), which the build already checks. The rest is in `tools/kb-extra/`, written for the chatbot only in November 2026 and not used by the app:

- `mutual-funds.json` (29): fund types and SEBI categories, expense ratio, exit load, direct and regular plans, growth and IDCW, ELSS, NFO, STP, SWP, rolling returns, factsheets.
- `sectors.json` (17): banking, NBFCs, insurance, FMCG, consumer durables, pharma, IT services, telecom, auto, metals, oil and gas, power, cement, real estate, capital goods, chemicals, each with what drives it and what to watch.
- `investing-basics.json` (14): asset allocation, rebalancing, horizon, risk tolerance, blue chips, growth and value, moats, penny stocks, dividend stocks, gold bonds, gold ETFs, fixed deposits.
- `reading-the-numbers.json` (12): the `guide` chunks above. They give comparisons and typical patterns, not hard thresholds.

Add more by editing those files (same shape: `id`, `term`, `unit`, `short`, `definition`, and optionally `aliases`, `examples`, `note`, `confusables`, `asOf`, `source`) and re-running the builder. It stops on a repeated id or a missing field.

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
    "term_id": "repo-rate", "names": ["repo rate", "policy repo rate", "policy rate"], "audience": "investor",
    "area": "macro", "area_name": "Rates, macro and the rupee", "unit": "The RBI and policy rates",
    "core": true, "difficulty": 1, "basic": false, "phase3": false, "in_app": true,
    "related": ["sdf", "msf", "inflation-target"],
    "as_of": "2026-11", "time_sensitive": true, "source": "https://www.rbi.org.in/..."
  }
}
```

- `id` is stable across rebuilds, so upserting by `id` updates chunks instead of duplicating them. Delete ids that are no longer in the file.
- `text` is what to embed and what to give the LLM. Every chunk names its own topic, so it reads correctly on its own.
- `questions` are sample questions the chunk answers. Embedding them as extra vectors that point to the same chunk helps short questions find it.
- `metadata`: `audience` is `investor`, `trader` or `professional` (set per area and unit in the builder); `in_app` is false for the chatbot-only content; `time_sensitive` and `as_of` mark figures that may be out of date; `related` lists neighbouring terms.

## Loading and searching

A vector database is not trained: each chunk's `text` is turned into a vector by an embedding model and stored, and a question is matched to the nearest vectors.

1. Embed each chunk's `text` with one embedding model and store the vector with `id`, `text` and `metadata`. Chunks are short enough for any embedding model, so don't split them.
2. At question time, fetch the top 5 to 8 chunks and pass their `text` to the LLM with the figures from your backend.
3. When the question names a term ("what is NAV"), put that term's chunk first by matching the question against `metadata.names`. Without this, comparison chunks that mention the term can outrank its own chunk. For "is X good" questions, keep the `guide` chunk in the results as well.
4. When a chunk has `time_sensitive: true`, have the LLM say the figure is as of `as_of` and may have changed.
5. Pick a similarity cut-off below which nothing is passed, so out-of-scope questions get "I don't know" instead of a loosely related answer.

## Testing retrieval

`tools/kb-eval/questions.jsonl` has 100 test questions in plain investor wording, each with the chunks that answer it: definitions, situations ("I can't sell, there are no buyers"), "is this good" analysis, comparisons, calculations, topics, and 8 out-of-scope questions (advice, live prices, personal tax, insurance, crypto) where the right result is to find nothing.

```
node tools/kb-eval/score.mjs results.jsonl                                                       # your search's results
node tools/kb-eval/score.mjs --baseline glossary-out/knowledge-base-investor.jsonl --name-boost   # keyword floor
```

On the investor file, keyword search with the name boost finds a right chunk in the top 5 for 95% of the answerable questions (all definitions, analysis and comparisons; 72% of situations). A vector search should beat it, mainly on situation questions.

## Limits

- It has no prices, company data or news: those come from your backend. It is not investment advice.
- It doesn't cover personal finance beyond investing: income tax, insurance, loans, credit scores, PPF and NPS.
- Tax rules, rates and limits (marked `time_sensitive`) change with each Budget and with the new Income-tax Act; rebuild after updating them.
