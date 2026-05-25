# Quick Start: 50-Agent LADtoday System (5 Minutes)

## You see "No tables found" because migrations haven't been applied yet!

### ⚡ 3-Step Setup (5 minutes)

#### STEP 1: Apply Database Schema (2 minutes)

1. Open your Supabase dashboard: https://app.supabase.com
2. Click **SQL Editor** (left sidebar)
3. Click **New Query** (top right)
4. Go to your project folder and open: `supabase/migrations/20260517_complete_50_agent_schema.sql`
5. Copy ALL the SQL (Ctrl+A)
6. Paste into Supabase query editor
7. Click **RUN** (top right, blue button)
8. Wait for "Success" message ✓

**Result**: All 4 tables now appear in **Tables** tab:
- `pipeline_runs` ✓
- `agent_outputs` ✓
- `lobstertrap_audit` ✓
- `agent_registry` ✓

#### STEP 2: Seed 50 Agents (2 minutes)

1. Click **New Query** in SQL Editor again
2. Paste this SQL:

```sql
INSERT INTO agent_registry (key, name, phase, depends_on, model, enabled, order_index) VALUES
('scout-01', 'Scout', 'discover', '{}', 'flash', true, 1),
('intelligence-02', 'Intelligence', 'discover', '{"scout-01"}', 'pro', true, 2),
('trend-forecaster-03', 'Trend Forecaster', 'discover', '{"scout-01"}', 'flash', true, 3),
('competitor-intel-04', 'Competitor Intel', 'discover', '{"scout-01"}', 'flash', true, 4),
('audience-listener-05', 'Audience Listener', 'discover', '{"scout-01"}', 'flash', true, 5),
('news-wire-06', 'News Wire', 'discover', '{}', 'flash', true, 6),
('research-07', 'Research', 'discover', '{"scout-01"}', 'flash', true, 7),
('fact-checker-08', 'Fact Checker', 'analyze', '{"intelligence-02"}', 'pro', true, 8),
('bias-detector-09', 'Bias Detector', 'analyze', '{"intelligence-02"}', 'flash', true, 9),
('story-arc-10', 'Story Arc', 'analyze', '{"intelligence-02"}', 'flash', true, 10),
('quote-extractor-11', 'Quote Extractor', 'analyze', '{"intelligence-02"}', 'flash', true, 11),
('tone-calibrator-12', 'Tone Calibrator', 'analyze', '{"scout-01"}', 'flash', true, 12),
('localization-13', 'Localization', 'analyze', '{"scout-01"}', 'flash', true, 13),
('headline-optimizer-14', 'Headline Optimizer', 'analyze', '{"intelligence-02"}', 'flash', true, 14),
('rewrite-15', 'Rewrite', 'create', '{"story-arc-10","bias-detector-09","tone-calibrator-12"}', 'pro', true, 15),
('vision-16', 'Vision', 'create', '{"headline-optimizer-14"}', 'flash', true, 16),
('seo-17', 'SEO', 'create', '{"rewrite-15"}', 'flash', true, 17),
('readability-18', 'Readability', 'create', '{"rewrite-15"}', 'flash', true, 18),
('internal-links-19', 'Internal Links', 'create', '{"rewrite-15"}', 'flash', true, 19),
('schema-20', 'Schema', 'create', '{"rewrite-15"}', 'flash', true, 20),
('excerpts-21', 'Excerpts', 'create', '{"rewrite-15"}', 'flash', true, 21),
('creative-22', 'Creative', 'multimedia', '{"vision-16"}', 'flash', true, 22),
('infographic-23', 'Infographic', 'multimedia', '{"intelligence-02"}', 'flash', true, 23),
('podcast-24', 'Podcast', 'multimedia', '{"rewrite-15"}', 'flash', true, 24),
('video-25', 'Video', 'multimedia', '{"vision-16"}', 'flash', true, 25),
('shortform-26', 'Short Form', 'multimedia', '{"rewrite-15"}', 'flash', true, 26),
('threads-27', 'Threads', 'multimedia', '{"headline-optimizer-14"}', 'flash', true, 27),
('carousel-28', 'Carousel', 'multimedia', '{"vision-16"}', 'flash', true, 28),
('newsletter-29', 'Newsletter', 'multimedia', '{"rewrite-15"}', 'flash', true, 29),
('whatsapp-30', 'WhatsApp', 'multimedia', '{"excerpts-21"}', 'flash', true, 30),
('dataviz-31', 'Data Viz', 'multimedia', '{"intelligence-02"}', 'flash', true, 31),
('account-mgr-32', 'Account Manager', 'distribute', '{}', 'flash', true, 32),
('publish-33', 'Publish', 'distribute', '{"rewrite-15"}', 'flash', true, 33),
('timing-34', 'Timing', 'distribute', '{}', 'flash', true, 34),
('hashtags-35', 'Hashtags', 'distribute', '{}', 'flash', true, 35),
('crossplatform-36', 'Cross-Platform', 'distribute', '{"rewrite-15"}', 'flash', true, 36),
('community-37', 'Community', 'distribute', '{"rewrite-15"}', 'flash', true, 37),
('influencer-38', 'Influencer', 'distribute', '{}', 'flash', true, 38),
('performance-39', 'Performance', 'distribute', '{}', 'flash', true, 39),
('syndication-40', 'Syndication', 'distribute', '{"publish-33"}', 'flash', true, 40),
('adsense-41', 'AdSense', 'monetize', '{"rewrite-15"}', 'flash', true, 41),
('affiliate-42', 'Affiliate', 'monetize', '{"rewrite-15"}', 'flash', true, 42),
('leadmagnet-43', 'Lead Magnet', 'monetize', '{}', 'flash', true, 43),
('calendar-44', 'Calendar', 'monetize', '{}', 'flash', true, 44),
('revenue-45', 'Revenue', 'monetize', '{}', 'flash', true, 45),
('analytics-46', 'Analytics', 'operate', '{}', 'flash', true, 46),
('guardian-47', 'Guardian', 'operate', '{}', 'pro', true, 47),
('refresh-48', 'Refresh', 'operate', '{}', 'flash', true, 48),
('brandsafety-49', 'Brand Safety', 'operate', '{}', 'pro', true, 49),
('knowledgebase-50', 'Knowledge Base', 'operate', '{}', 'flash', true, 50)
ON CONFLICT (key) DO NOTHING;

SELECT COUNT(*) as agents_inserted FROM agent_registry;
```

3. Click **RUN**
4. You should see: `agents_inserted: 50` ✓

#### STEP 3: Start Testing (1 minute)

1. Open admin dashboard: `http://localhost:5173/admin/pipeline`
2. Click **"New Run"** tab
3. Fill the form:
   - **Topic**: "Pakistan fintech boom"
   - **Brand voice**: "Professional"
   - **Language**: "English"
4. Under **"Enable Agents"**, expand "Phase 1: Discover" and check all 7
5. Click **"Start Pipeline"** button
6. Watch the **"Runs"** tab for live updates! ✓

---

## What You'll See in Supabase

### Tables Tab
```
pipeline_runs
├── id (UUID)
├── topic (text)
├── status (pending/running/completed/failed)
├── current_phase (foundation/discover/analyze/...)
├── agent_states (JSONB with all 50 agent states)
└── ... (12+ more columns)

agent_outputs
├── run_id (FK to pipeline_runs)
├── agent_key (scout-01, intelligence-02, etc.)
├── body (JSONB - agent's structured output)
└── created_at (timestamp)

lobstertrap_audit
├── run_id (FK)
├── agent_key
├── injection_detected (boolean)
├── pii_detected (boolean)
├── risk_score (0.0-1.0)
├── verdict (approved/review/rejected)
└── created_at (timestamp)

agent_registry
├── key (unique: scout-01, intelligence-02, ...)
├── name (Scout, Intelligence, ...)
├── phase (discover/analyze/create/...)
├── depends_on (JSON array of dependencies)
├── model (flash or pro)
├── enabled (boolean)
└── order_index (1-50)
```

### Real-time Updates
- **pipeline_runs**: Updates as phases complete
- **lobstertrap_audit**: Logs every Gemini call
- **agent_outputs**: Populated as agents finish

---

## What You'll See in Admin UI

### After Step 3 (Start Pipeline):

**Runs Tab** shows:
```
Topic: "Pakistan fintech boom"
Status: ⟳ Running
Current Phase: discover → analyze → create → ...
Tokens: 12,450 / 62,000
Cost: $0.018 / $0.05 (estimated)
Duration: 45 seconds elapsed
```

**Live Agent Status**:
```
Phase 1: DISCOVER
  ✓ scout-01          (2.3s, 250 tokens)
  ✓ intelligence-02   (4.1s, 890 tokens)
  ✓ trend-forecaster-03 (2.8s, 340 tokens)
  ⟳ competitor-intel-04 (running...)
  ○ audience-listener-05 (pending)
  ...
```

**Click on agent** → View:
- Full prompt sent to Gemini
- Full response received
- JSON output
- Token count & latency
- Risk score & PII mask status

---

## Verify Everything Works

### In Supabase Dashboard:

1. **Tables Tab**: Click `pipeline_runs`
   - Should see 1 row (your test run)
   - Look at `agent_states` column → JSONB showing all agent statuses

2. **Tables Tab**: Click `agent_registry`
   - Should see 50 rows (all agents)
   - Confirm `enabled = true` for Phase 1 agents

3. **Tables Tab**: Click `agent_outputs`
   - Should see 7+ rows (one per completed agent)
   - Click `body` column → View JSON output from each agent

4. **Tables Tab**: Click `lobstertrap_audit`
   - Should see 7+ rows (security log)
   - Check `risk_score`, `injection_detected`, `pii_detected`
   - All should show `verdict: "approved"`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No tables found" | Run migration SQL (Step 1) |
| Tables exist but empty | You haven't started a pipeline run yet (Step 3) |
| Admin UI shows "No agents" | Agent registry not seeded (Step 2) |
| Pipeline fails with error | Check `lobstertrap_audit` for details |
| Can't see realtime updates | Refresh browser (Ctrl+F5) |

---

## Next Steps

After this works:

1. **Disable expensive agents** (to test on free tier):
   ```sql
   UPDATE agent_registry SET enabled = false WHERE model = 'pro';
   ```

2. **Add your Gemini API key** (if not already set)

3. **Deploy edge functions**:
   ```bash
   supabase functions deploy pipeline-orchestrator
   ```

4. **Test full 50-agent pipeline**:
   - Run pipeline with all agents enabled
   - Monitor cost and token usage
   - Check results in Supabase

---

**Status**: Ready to go! Start with STEP 1. ⚡
