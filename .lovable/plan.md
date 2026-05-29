# 10-Agent LADtoday Pipeline — Integration Plan

## Goal
Replace the current 50-agent `/admin/pipeline` orchestration with the new 10-agent hackathon architecture from `hackathon/` (Scout, Intelligence, Rewrite, SEO, Vision, Creative, Guardian, Publish, Analytics, Account Manager + Orchestrator). Keep the **legacy scrape → auto-rewrite → publish → Facebook** flow (`/admin/scraper-sources`, `auto-rewrite`, `auto-post-facebook`) 100% untouched.

## What stays (do NOT touch)
- `supabase/functions/scrape-articles`, `auto-rewrite`, `rewrite-article`, `auto-post-facebook`, `manual-post-facebook`, `generate-caption`, `social-meta-proxy`, `ai-admin`
- `/admin/scraper-sources`, `/admin/facebook-pages`, `/admin/facebook-queue`, `/admin/media`, `/admin/categories`, `/admin/settings`, `/admin/logs`
- `articles` table public reads, Facebook posting tables
- All shared helpers used by those: `_shared/lobstertrap.ts`, `_shared/logger.ts`

## What changes

### 1. Edge functions
- **Add 10 new functions** (copy + adapt from `hackathon/index*.ts`):
  - `orchestrator-v2` (rename from `orchestrator` to avoid collision; old `pipeline-orchestrator` stays for legacy runs)
  - `scout-agent`, `intelligence-agent`, `rewrite-agent`, `seo-agent`, `vision-agent`, `creative-agent`, `guardian-agent`, `publish-agent`, `analytics-agent`, `account-manager-agent`
- **Adapt** each function to this project:
  - Use existing `_shared/cors.ts` style (npm: import) and `_shared/gemini.ts` where the hackathon uses raw fetch to Gemini
  - Use the existing `pipeline_runs` + `agent_outputs` tables (no new `articles.pipeline_status` column — store progress in `pipeline_runs.agent_states`)
  - Route Bright Data scraping; fall back to Firecrawl (already wired) when Bright Data key missing, then DuckDuckGo as last resort — so demo never returns 0 sources
  - Keep current Scout's multi-input support (topic / URL / PDF / image) on top of the new Bright Data discovery
- **Delete** the 40 unused agent functions (everything in `agent_registry` not in the new 10). Keep their `Jugar/` copies as reference.

### 2. Database (one migration)
- Reset `agent_registry`: clear rows, insert exactly the 10 new agents with correct `phase` / `order_index` / `depends_on` / `enabled=true`
- Add columns to `pipeline_runs` if missing: `mode` (`gtm|finance|security`), `tone`, `length` (already have `brand_voice`, `language` — map onto these)
- Add `agent_runs` view OR reuse `agent_outputs` (prefer reuse — no new table)
- No new tables for Cognee — store memory in existing `agent_memory` table

### 3. Secrets needed (you'll add via UI)
- `BRIGHTDATA_API_TOKEN` (required) — SERP API + Web Unlocker
- `BRIGHTDATA_CUSTOMER_ID`, `BRIGHTDATA_PASSWORD` (for Web Unlocker proxy auth)
- `AIML_API_KEY` (optional — Intelligence falls back to Gemini if missing)
- `COGNEE_API_KEY` (optional — memory falls back to local `agent_memory` table)
- `TRIGGERWARE_WEBHOOK_URL` (optional — Publish skips webhook if missing)
- Already present: `GEMINI_API_KEY`, `FIRECRAWL_API_KEY`

Every optional integration degrades gracefully so the pipeline never hard-fails on a missing key.

### 4. UI — `/admin/pipeline`
Rewrite `src/pages/AdminPipeline.tsx` (keep route, replace internals):
- Top: NewRunForm with prompt textarea, `mode` (GTM / Finance / Security), `tone`, `length`, optional URL/PDF/Image attach, optional discovery-method override (auto / brightdata / firecrawl / duckduckgo / gemini-grounding)
- Active run view: timeline of 10 agents with live status (Realtime subscription on `pipeline_runs.agent_states`)
- Per-agent drawer: shows input + output JSON from `agent_outputs`, plus a "Bright Data calls" badge on Scout
- Preview Writer button (already exists) → keeps working as mid-pipeline draft tool
- Final state: shows headline, body markdown, Guardian verdict pill, social snippets, "Publish to web" + "Post to Facebook" buttons (the FB button hands off to existing `manual-post-facebook` so legacy flow stays the publish pathway)

### 5. Out of scope
- No changes to `/admin/scraper-sources` flow
- No new payment / auth screens
- No public-facing article changes
- Cognee/TriggerWare/AI-ML are wired but considered optional bonuses

## Acceptance test
1. On `/admin/pipeline` → type "Pakistan interest rate decision", pick Finance mode → Run
2. See 10 agents tick through with real Bright Data source URLs in Scout output (or Firecrawl fallback if no BD key)
3. Guardian returns APPROVED / FLAGGED / QUARANTINED — UI shows pill
4. Click "Publish to web" → article appears on the public site exactly like today's scraper-produced articles
5. Click "Post to Facebook" → hands off to existing FB queue, posts unchanged
6. Old scraper flow at `/admin/scraper-sources` still runs end-to-end untouched

## Open questions for you
1. **Bright Data**: Do you have the token + customer ID + password ready, or should I make Scout default to Firecrawl-only and treat Bright Data as an optional upgrade you can add later?
2. **AI/ML API, Cognee, TriggerWare**: Same question — wire them as optional (Gemini-fallback) so the pipeline runs today, then you drop keys in when ready?
3. **Old 40 agents**: Delete the edge function source files, or just disable them in `agent_registry` and leave the code? Delete is cleaner; disable is safer if you change your mind.
4. **`/admin/pipeline` route**: Full rewrite of the page, or keep the existing tabs (Costs / Backups / Health etc.) and only replace the "New run" tab? The hackathon UI is much simpler than what's there now.

Once you answer those 4 I'll build straight through — migration first, then 10 functions, then UI — and ping you when it's ready to test.
