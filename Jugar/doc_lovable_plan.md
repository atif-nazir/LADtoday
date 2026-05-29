
# Plan — Agent 01 (Scout) Real Source Discovery

## Goal
Upgrade Scout so it behaves like a real research assistant: take a humanly-worded prompt (or URL/PDF/image) and return a list of **real, fetched** sources from the open web — not Gemini-imagined sources. Everything downstream (agents 02–50, publish, FB) stays untouched.

## Guardrails
- Do **not** touch the existing scraper / rewrite / publish / Facebook flow (`/admin/scraper-sources`, `auto-rewrite`, `auto-post-facebook`, etc.).
- Do **not** modify other agent functions, orchestrator DAG, or DB schema (besides `pipeline_runs.input_payload` which already stores `{url?, pdf?, image?}`).
- Only edit: `supabase/functions/scout/index.ts`, the Pipeline tab's `NewRunForm` in `src/pages/AdminPipeline.tsx`, and add one small storage bucket if needed for uploads.

## What Scout will do (new behavior)

### 1. Input normalization
The orchestrator already accepts `input_type` + `input_payload`. Scout will read:
- `topic` — free-text prompt ("tell me what's happening with Pakistan fintech this week")
- `input_payload.url` — single URL
- `input_payload.pdf_url` — uploaded PDF in Supabase Storage
- `input_payload.image_url` — uploaded image (→ sets `image_mode=true` for Vision-16)

### 2. Real source discovery (replaces "Gemini imagines sources")
For **topic** input:
1. **Query expansion** — Gemini Flash turns the human prompt into 3–5 focused search queries (e.g. "Pakistan fintech 2026", "SBP digital wallet license 2026", "Easypaisa JazzCash growth").
2. **Web search** — call **Firecrawl `/v2/search`** (already documented in context; connect via `standard_connectors--connect` for `firecrawl`). For each query, request top ~5 results with `scrapeOptions: { formats: ['markdown'] }` so we get titles, URLs, snippets, and full markdown bodies in one call.
   - Fallback: if Firecrawl key not configured, use Gemini with Google Search grounding (`tools: [{google_search: {}}]`) to get real URLs, then fetch each with the existing `fetchUrlContent` helper.
3. **Merge + dedupe** — pool all results, dedupe by domain + cosine similarity (existing logic stays).
4. **Score** — Gemini Flash, given the real titles + first 1.5k chars of each, fills in `credibility_score`, `recency_score`, `relevance_score`, `key_facts`, `sentiment` per source. This replaces the current "make up a realistic source" prompt.

For **URL** input: fetch via Firecrawl scrape (handles JS-rendered pages, anti-bot) and **also** run a small topic search on the page's title to add 2–3 supporting sources.

For **PDF** input: download from storage, extract text via `unpdf` (npm, Deno-friendly), treat extracted text as one source, then supplement with topic search using the PDF's inferred title.

For **image** input: store URL, flag `image_mode=true`, run topic search on the user's prompt to gather sources around the image (Vision-16 later analyzes the image itself).

### 3. Output shape
Unchanged — same `ScoutOutput` interface, so Agent 02 (Intelligence) and the rest of the DAG keep working.

## UI change — Pipeline tab only
Replace the current `NewRunForm` Textarea with:
- A larger prompt textarea ("Ask in plain language — what should we write about?")
- An "Attach" row with three buttons: **URL** (text field), **PDF** (file upload to `pipeline-inputs` bucket), **Image** (file upload, same bucket)
- Same Brand voice / Language selects
- "Run pipeline" button → sends `{ topic, input_type, input_payload: { url?, pdf_url?, image_url? } }` to `pipeline-orchestrator`

A small "Sources found" preview card appears under the run as soon as Scout completes (reads from `agent_outputs` where `agent_key='scout'`), showing real URLs + domains so the user can sanity-check before later agents run.

## Connector / secrets
- Ask user to connect **Firecrawl** (preferred — best for search + scrape in one call, handles anti-bot).
- `GEMINI_API_KEY` already present → fallback path works without Firecrawl.
- New storage bucket `pipeline-inputs` (private) for PDF/image uploads.

## Files to change
1. `supabase/functions/scout/index.ts` — replace `scoutByTopic` with `searchAndAnalyze` (Firecrawl-first, Gemini-grounding fallback), add `scoutByPdf`, keep `scoutByUrl` but route through Firecrawl scrape.
2. `src/pages/AdminPipeline.tsx` — upgrade `NewRunForm` (URL/PDF/image attachments + upload to storage), add small "Scout sources" preview block in `RunDetail`.
3. New migration — create private storage bucket `pipeline-inputs` with RLS (admin-only insert, signed URLs for read).

## Out of scope (explicitly)
- No change to agents 02–50.
- No change to orchestrator DAG, registry, or `/admin/scraper-sources` legacy flow.
- No change to publish or Facebook posting.

## Acceptance test
1. On `/admin/pipeline`, type "what's the latest on Pakistan's solar net-metering policy" → Run.
2. Within ~10s, Scout's drawer shows 5 sources with **real reachable URLs** (Dawn, Tribune, SBP, etc.), real titles, and 300-word summaries pulled from those pages.
3. Existing downstream agents continue exactly as before; final article publishes to web (and FB if enabled).
4. Repeat with a URL, then a PDF, then an image — each produces a valid Scout output and the pipeline continues.
