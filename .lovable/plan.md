# LADtoday 50-Agent Swarm — Phased Implementation Plan

## Reality check first

Your two plan documents (~3,500 lines) describe a system originally architected for **Python + FastAPI + Railway + WordPress + Lobster Trap proxy** with **50 agents**. This project is **React + Supabase Edge Functions + Gemini**, with several pieces of the original 10-agent plan already partially built (articles, scrapers, FB pages, AI rewrite, captions).

I will adapt — not literally translate — the plan onto your existing stack. That means:

- Every "agent" = one Supabase Edge Function (Deno/TS), not a Python class.
- "FastAPI orchestrator" = one `pipeline-orchestrator` edge function + a `pipeline_runs` table acting as the shared state bus.
- "Lobster Trap proxy" = a TypeScript wrapper around the existing `_shared/gemini.ts` that logs every call to a `lobstertrap_audit` table and runs cheap heuristic checks (no external proxy container).
- "WordPress publish" = your existing `articles` table + the public site (you don't run WordPress).
- "Facebook publish" = the existing `auto-post-facebook` / `manual-post-facebook` functions.
- All UI lives under `/admin` — no public-facing changes.

**50 agents end-to-end in one turn is not realistic.** Edge function deploys, schema migrations, and admin UI for 50 distinct workflows is multi-day work even on a fast loop. I'm proposing 5 phases. After each phase you can run/test, then approve the next.

---

## Phase 0 — Foundation (this turn)

Goal: stand up the shared infrastructure every agent depends on. No agent logic yet — just the rails.

### Schema migration
- `pipeline_runs` — one row per "run topic → publish" job. Columns: `id`, `user_id`, `topic`, `input_type`, `input_payload jsonb`, `status` (pending/running/completed/failed), `current_phase`, `total_tokens`, `estimated_cost_usd`, `duration_ms`, `created_at`, `updated_at`, plus a JSONB `agent_states` map of `{agent_key: {status, started_at, finished_at, tokens, output_ref, error}}`.
- `agent_outputs` — per-agent structured outputs keyed by `(run_id, agent_key)`, JSONB body, so the orchestrator can pass results without bloating `pipeline_runs`.
- `lobstertrap_audit` — every Gemini call: `run_id`, `agent_key`, `prompt_preview`, `prompt_tokens`, `response_tokens`, `injection_detected`, `pii_detected`, `risk_score`, `action_taken`, `verdict`, `latency_ms`.
- `agent_registry` — seeded with all 50 agents: `key`, `name`, `phase`, `depends_on text[]`, `model`, `enabled bool`, `order_index`. Lets admins toggle agents on/off without code changes.
- Realtime enabled on `pipeline_runs` and `lobstertrap_audit` so the admin UI gets live updates.
- All tables admin-only RLS via existing `has_role(auth.uid(), 'admin')` pattern.

### Shared edge-function utilities
- `_shared/gemini.ts` — wrap existing `geminiText` / `geminiJson` with a `guardedGemini(runId, agentKey, opts)` helper that:
  - logs to `lobstertrap_audit`,
  - runs cheap heuristic injection/PII checks (regex for "ignore previous", emails, phone numbers, Pakistani CNIC pattern),
  - applies a per-run rate limiter,
  - returns the same shape so existing functions can opt in incrementally.
- `_shared/pipeline.ts` — helpers: `createRun`, `markAgentRunning`, `markAgentDone`, `markAgentFailed`, `readAgentOutput`, `writeAgentOutput`, `nextRunnableAgents(runId)` (topological lookup against `agent_registry`).

### Orchestrator edge function — `pipeline-orchestrator`
- POST `{ topic, input_type, input_payload, brand_voice, language, enabled_agents? }` → creates a `pipeline_runs` row and kicks the DAG.
- Internal loop: read registry → find runnable agents (deps satisfied + enabled) → invoke their edge functions in parallel via `supabase.functions.invoke` → wait → repeat until terminal state.
- Idempotent: re-invoking on a partially failed run resumes from the failed node.

### Admin UI shell — `/admin/pipeline`
- One new sidebar entry "Pipeline" (icon: `Workflow`).
- Page: "New Run" form (topic, input type, brand voice, language, agent toggles grouped by phase) + live "Runs" table.
- Run detail view: 50-node graph rendered as a phase-grouped list with status chips, live updates via Supabase realtime, click a node → drawer with prompt/response/tokens/risk score.
- Lobster Trap tab on the run detail showing audit rows for that run.

**Deliverables this phase:** migrations, shared helpers, orchestrator, registry seed for all 50 agents (most marked `enabled=false`), admin UI shell that can run an empty pipeline and show "no agents enabled".

---

## Phase 1 — Discover wing (agents 01–07)

Adapt existing scrape-articles into Scout (01). New edge functions for Intelligence (02), Trend Forecaster (03), Competitor Intel (04), Audience Listener (05), News Wire (06), Research (07). Each is ~100–200 lines of TS calling `guardedGemini`. Enable all 7 in registry, wire into orchestrator, test end-to-end with topic input.

## Phase 2 — Analyze wing (agents 08–14)

Fact Checker, Bias Detector, Story Arc, Quote Extractor, Tone Calibrator, Localization, Headline Optimizer. Pure Gemini-JSON agents — small edge functions, parallelizable. Add a "Story Brief" preview panel to the admin run UI.

## Phase 3 — Create + Multimedia wings (agents 15–31)

Refactor existing `rewrite-article` / `auto-rewrite` into Rewrite (15). Existing `generate-caption` becomes the seed for Short Form (26). New agents: SEO, Readability, Internal Linking, Schema, Excerpt, Creative, Infographic, Podcast Script, Video Script, Thread, Carousel, Newsletter, WhatsApp, Data Viz. Many can be implemented as templates calling Gemini once each. Output lands on `articles` table + new `article_assets` table (jsonb per asset type).

## Phase 4 — Distribute + Monetize wings (agents 32–45)

Account Manager + Publish wrap your existing `articles` insert and `auto-post-facebook` / `manual-post-facebook`. Timing Intelligence, Hashtag Strategy, Cross-Platform Adapter, Community, Influencer Radar, Performance Predictor, Syndication. Then monetize: AdSense Optimizer, Affiliate Detector, Lead Magnet, Content Calendar, Revenue Intelligence. WordPress publishing is replaced by "publish to own site" since you don't run WP.

## Phase 5 — Operate wing (agents 46–50) + polish

Analytics (wraps the existing newsletter/view-count infra), Guardian (final audit pass + verdict APPROVED/REVIEW/REJECTED gate on publish), Content Refresh (scans aging articles), Brand Safety, Knowledge Base (vector-ish store of past runs for cross-article context). Polish: cost dashboard, demo mode, cached "Pakistan fintech growth" run for the hackathon demo.

---

## Technical notes (for reference)

- **No Python, no FastAPI, no Railway, no Lobster Trap container** — all replaced by edge functions + a `lobstertrap_audit` table. The "policy YAML" becomes a `settings` row (`key='guardian_policy'`) that the Guardian function reads.
- **No WordPress** — "publish" writes to your existing `articles` table and (optionally) queues a Facebook post. If you later want true WP publishing, that's an add-on agent with credentials in secrets.
- **Gemini key** — already in secrets as `GEMINI_API_KEY` from the previous turn. All agents go through `_shared/gemini.ts` → `guardedGemini`. The Lovable AI Gateway path is bypassed entirely (you wanted that).
- **Cost control** — `agent_registry.enabled` lets you turn off the expensive Pro-tier agents (Intelligence, Rewrite) and run cheaper Flash-only pipelines during testing. Cost estimate accumulates per run.
- **Concurrency** — orchestrator invokes independent agents in parallel via `Promise.allSettled`. Edge function cold-start per agent is the main latency floor; full 50-agent run is realistically 60–120s.
- **Demo mode** — Phase 5 adds a "mock" toggle that returns pre-canned outputs for the demo topic so you never fail at the judging table on rate limits.

---

## What I need from you

1. **Confirm phased delivery.** I'll ship Phase 0 in this turn (foundation only — schema, orchestrator, admin shell, registry of all 50 agents marked disabled). Then ask you to test before Phase 1.
2. **Confirm WordPress is dropped** in favor of publishing to your existing site (you don't run WP).
3. **Confirm Lobster Trap = TS heuristic logger** (not the real Veea container — that requires Python + a side container you can't host on Lovable).

If you want all 50 agents in one shot regardless: that won't fit in one turn and will produce broken half-deployed functions. I will not do that.

Reply "go" to ship Phase 0, or tell me which phase to start with.
