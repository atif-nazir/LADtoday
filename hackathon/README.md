# LADtoday — Live Web Intelligence Content Platform

[![Bright Data](https://img.shields.io/badge/Bright%20Data-SERP%20API%20%2B%20Web%20Unlocker-orange)](https://brightdata.com)
[![Built with Kiro](https://img.shields.io/badge/Built%20with-Kiro%20IDE-blue)](https://kiro.dev)
[![AI/ML API](https://img.shields.io/badge/AI%2FML%20API-GPT--4o-green)](https://aimlapi.com)
[![Cognee](https://img.shields.io/badge/Cognee-Agent%20Memory-purple)](https://cognee.ai)
[![TriggerWare](https://img.shields.io/badge/TriggerWare.ai-Automated%20Workflows-red)](https://triggerware.ai)
[![Supabase](https://img.shields.io/badge/Backend-Supabase%20Edge%20Functions-3ECF8E)](https://supabase.com)

> **Web Data UNLOCKED Hackathon** | Online Track | All Three Tracks

---

## The Problem Bright Data Solves for Us

```bash
# Without Bright Data:
curl https://reuters.com          → 403 Forbidden
curl https://bloomberg.com        → CAPTCHA required  
curl https://linkedin.com/jobs    → Bot detected, blocked
curl https://ft.com               → Geo-restricted

# With Bright Data:
curl [Web Unlocker] → reuters.com   ✅ 200 OK — full article content
curl [Web Unlocker] → bloomberg.com ✅ 200 OK — market intelligence
curl [SERP API] → "Pakistan interest rates" ✅ Top 10 live results, structured JSON
curl [Scraper API] → LinkedIn jobs  ✅ Clean hiring signal data
```

**80% of enterprise-grade sources block standard scrapers. Bright Data is not a feature — it's the foundation.**

---

## What LADtoday Does

A **10-agent AI content intelligence platform** that gives GTM teams, financial analysts, and brand managers autonomous access to live web intelligence.

**Input:** Any topic, typed once  
**Output:** Published, human-quality article — sourced from 5+ live premium sites — in ~45 seconds

---

## Architecture: 10 Supabase Edge Function Agents

```
User Input → Orchestrator (Supabase Edge)
               │
    ┌──────────┴──────────────────────────────┐
    ▼                                         ▼
Scout Agent                          Intelligence Agent
(Bright Data SERP + Web Unlocker)    (AI/ML API GPT-4o + Cognee)
    │                                         │
    └──────────────┬──────────────────────────┘
                   ▼
            Rewrite Agent (Gemini 2.0 Flash)
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   SEO Agent             Vision Agent
   (Bright Data SERP)    (Gemini Flash)
        │                     │
        └──────────┬──────────┘
                   ▼
           Creative Agent (headlines, social)
                   │
           Guardian Agent (Bright Data plagiarism + Lobster Trap DPI)
                   │
           Publish Agent (WordPress + TriggerWare.ai)
                   │
           Analytics Agent (Cognee memory storage)
```

---

## Tracks Entered

### Track 1: GTM Intelligence ✓
- Scout Agent continuously monitors competitors via Bright Data Web Unlocker
- SERP API detects buying signal spikes → TriggerWare fires automatic content response
- Intelligence Agent enriches topics with 5+ live premium sources
- Account Manager monitors competitor job postings via Web Scraper API (LinkedIn)

### Track 2: Finance & Market Intelligence ✓  
- Scout Agent ingests SBP, SECP, Bloomberg, Reuters, Dawn Business via Bright Data
- Intelligence Agent detects source contradictions ("hold" vs "cut" signals)
- Structured JSON intelligence objects for every run
- Demo: "Pakistan interest rate decision" → 7 sources → brief in 90 seconds

### Track 3: Security & Compliance ✓
- Guardian Agent runs Bright Data-powered plagiarism checks on all content
- Lobster Trap DPI proxy intercepts prompt injection attacks on all AI calls
- Timestamped audit logs: APPROVED / FLAGGED / QUARANTINED
- Every article has full compliance trail before publishing

---

## Bright Data Integration

| Tool | Agent | Purpose |
|------|-------|---------|
| **SERP API** | Scout + SEO | Find live URLs, keyword data, PAA questions |
| **Web Unlocker** | Scout | Bypass bot detection on premium sources |
| **Scraping Browser** | Scout | Render JS-heavy sites (TechCrunch, etc.) |
| **Web Scraper API** | Scout | LinkedIn hiring signals (structured JSON) |
| **Web Unlocker** | Guardian | Plagiarism cross-checking against live web |

### Credit Efficiency
With $250 Bright Data credits:
- ~25,000 Web Unlocker requests = ~5,000 full pipeline runs
- ~50,000 SERP API queries
- Cost per pipeline run: ~$0.05

---

## Partner Integrations

| Partner | Integration | Prize Target |
|---------|-------------|-------------|
| **AI/ML API** | Intelligence Agent — GPT-4o for deep reasoning | $1,000 cash + $1,000 credits |
| **Cognee** | Agent persistent memory — learns from every article | $500 Amazon + $2,400 access |
| **TriggerWare.ai** | Event-driven publish — Bright Data signal → auto-pipeline | $300 Amazon + tokens |
| **Kiro IDE** | Entire project built using Kiro AI-assisted development | $3,000 credits |

---

## Tech Stack

```
Frontend:     Next.js 14 + Tailwind CSS + Framer Motion
Backend:      Supabase Edge Functions (Deno/TypeScript)
AI Core:      Gemini 2.0 Flash + Pro (primary)
AI Reasoning: AI/ML API GPT-4o (Intelligence Agent)
Web Access:   Bright Data (SERP API + Web Unlocker + Scraping Browser + Scraper API)
Memory:       Cognee (persistent agent performance memory)
Workflows:    TriggerWare.ai (event-driven publishing)
Security:     Lobster Trap DPI (prompt injection detection)
Database:     Supabase PostgreSQL (articles, analytics, agent_runs)
Realtime:     Supabase Realtime (live pipeline dashboard)
Deploy:       Vercel (frontend) + Supabase (backend)
IDE:          Kiro (AI-assisted development)
```

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/ladtoday-ai
cd ladtoday-ai

# 2. Get Bright Data credits
# → brightdata.com → Billing → Apply promo code: unlocked

# 3. Set up environment
cp .env.example .env.local
# Fill in: BRIGHTDATA_API_TOKEN, SUPABASE_URL, GEMINI_API_KEY, etc.

# 4. Run Supabase schema
# Copy supabase/schema.sql → paste in Supabase SQL editor → Run

# 5. Deploy Edge Functions
supabase functions deploy orchestrator
supabase functions deploy scout-agent
supabase functions deploy intelligence-agent
supabase functions deploy rewrite-agent
supabase functions deploy seo-agent
supabase functions deploy vision-agent
supabase functions deploy creative-agent
supabase functions deploy guardian-agent
supabase functions deploy publish-agent
supabase functions deploy analytics-agent

# 6. Run frontend
cd frontend
npm install
npm run dev
```

---

## Business Value

| Metric | Without LADtoday | With LADtoday |
|--------|-----------------|---------------|
| Articles/week | 2 (manual) | 14+ (automated) |
| Sources monitored | 3–5 (easy sites only) | 1,000+ (all unlocked via Bright Data) |
| Content team cost | PKR 150,000/month | PKR 2,000/month subscription |
| Time on content ops | 18 hrs/week | 1 hr/week |
| Premium source access | ~20% (rest blocked) | 100% (Web Unlocker) |
| Reuters, Bloomberg, FT | Blocked — 403 | Fully accessible |

---

## Demo Video Script

1. **The Problem (30s):** Show `curl https://reuters.com` → 403. "This is what every AI agent hits."
2. **Bright Data Unlocks It (60s):** Same URL via Web Unlocker → 200 OK. SERP API → 10 live results.
3. **Pipeline Run (90s):** Type "Pakistan fintech growth" → show all 10 agents running live
4. **Results (30s):** Published article, Guardian APPROVED, 6 Bright Data sources shown
5. **Enterprise Pitch (30s):** Dashboard → revenue projection → "This is what GTM teams need."

---

## Team

- **Atif** — Lead: Full stack, agent orchestration, Bright Data integration
- **Aqsa** — Mobile, prompt engineering, UI/UX, API integrations

---

*Built with 🔶 Bright Data + ⚡ Supabase + 🧠 AI/ML API + 🔵 Kiro IDE*  
*Pakistan 🇵🇰 | May 2026 | lablab.ai Web Data UNLOCKED Hackathon*
