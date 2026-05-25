# Database Setup Guide - 50-Agent LADtoday System

## How to See Tables and Functions in Supabase

### Step 1: Apply Database Schema Migration

You see "No tables found" because the migration hasn't been applied yet. Follow these steps:

#### Option A: Via Supabase Dashboard (Easiest)

1. Go to your Supabase project: https://app.supabase.com
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the SQL from `supabase/migrations/20260517_complete_50_agent_schema.sql`
5. Paste it into the query editor
6. Click **RUN**
7. Wait for completion (you'll see "Success" message)
8. Go to **Tables** tab - you should now see all 4 tables:
   - pipeline_runs
   - agent_outputs
   - lobstertrap_audit
   - agent_registry

#### Option B: Via Supabase CLI (If installed)

```bash
cd /vercel/share/v0-project
supabase db push
```

### Step 2: Seed Agent Registry

After tables are created, seed the agent registry with all 50 agents:

1. Go to **SQL Editor**
2. Create new query
3. Run this SQL:

```sql
-- Seed all 50 agents into agent_registry
INSERT INTO agent_registry (key, name, phase, depends_on, model, enabled, order_index) VALUES
-- PHASE 1: DISCOVER
('scout-01', 'Scout', 'discover', '{}', 'flash', true, 1),
('intelligence-02', 'Intelligence', 'discover', '{"scout-01"}', 'pro', true, 2),
('trend-forecaster-03', 'Trend Forecaster', 'discover', '{"scout-01"}', 'flash', true, 3),
('competitor-intel-04', 'Competitor Intel', 'discover', '{"scout-01"}', 'flash', true, 4),
('audience-listener-05', 'Audience Listener', 'discover', '{"scout-01"}', 'flash', true, 5),
('news-wire-06', 'News Wire', 'discover', '{}', 'flash', true, 6),
('research-07', 'Research', 'discover', '{"scout-01"}', 'flash', true, 7),

-- PHASE 2: ANALYZE
('fact-checker-08', 'Fact Checker', 'analyze', '{"intelligence-02"}', 'pro', true, 8),
('bias-detector-09', 'Bias Detector', 'analyze', '{"intelligence-02"}', 'flash', true, 9),
('story-arc-10', 'Story Arc', 'analyze', '{"intelligence-02"}', 'flash', true, 10),
('quote-extractor-11', 'Quote Extractor', 'analyze', '{"intelligence-02"}', 'flash', true, 11),
('tone-calibrator-12', 'Tone Calibrator', 'analyze', '{"scout-01"}', 'flash', true, 12),
('localization-13', 'Localization', 'analyze', '{"scout-01"}', 'flash', true, 13),
('headline-optimizer-14', 'Headline Optimizer', 'analyze', '{"intelligence-02"}', 'flash', true, 14),

-- PHASE 3: CREATE
('rewrite-15', 'Rewrite', 'create', '{"story-arc-10","bias-detector-09","tone-calibrator-12"}', 'pro', true, 15),
('vision-16', 'Vision', 'create', '{"headline-optimizer-14"}', 'flash', true, 16),
('seo-17', 'SEO', 'create', '{"rewrite-15"}', 'flash', true, 17),
('readability-18', 'Readability', 'create', '{"rewrite-15"}', 'flash', true, 18),
('internal-links-19', 'Internal Links', 'create', '{"rewrite-15"}', 'flash', true, 19),
('schema-20', 'Schema', 'create', '{"rewrite-15"}', 'flash', true, 20),
('excerpts-21', 'Excerpts', 'create', '{"rewrite-15"}', 'flash', true, 21),

-- PHASE 4: MULTIMEDIA
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

-- PHASE 5: DISTRIBUTE
('account-mgr-32', 'Account Manager', 'distribute', '{}', 'flash', true, 32),
('publish-33', 'Publish', 'distribute', '{"rewrite-15"}', 'flash', true, 33),
('timing-34', 'Timing', 'distribute', '{}', 'flash', true, 34),
('hashtags-35', 'Hashtags', 'distribute', '{}', 'flash', true, 35),
('crossplatform-36', 'Cross-Platform', 'distribute', '{"rewrite-15"}', 'flash', true, 36),
('community-37', 'Community', 'distribute', '{"rewrite-15"}', 'flash', true, 37),
('influencer-38', 'Influencer', 'distribute', '{}', 'flash', true, 38),
('performance-39', 'Performance', 'distribute', '{}', 'flash', true, 39),
('syndication-40', 'Syndication', 'distribute', '{"publish-33"}', 'flash', true, 40),

-- PHASE 6: MONETIZE
('adsense-41', 'AdSense', 'monetize', '{"rewrite-15"}', 'flash', true, 41),
('affiliate-42', 'Affiliate', 'monetize', '{"rewrite-15"}', 'flash', true, 42),
('leadmagnet-43', 'Lead Magnet', 'monetize', '{}', 'flash', true, 43),
('calendar-44', 'Calendar', 'monetize', '{}', 'flash', true, 44),
('revenue-45', 'Revenue', 'monetize', '{}', 'flash', true, 45),

-- PHASE 7: OPERATE
('analytics-46', 'Analytics', 'operate', '{}', 'flash', true, 46),
('guardian-47', 'Guardian', 'operate', '{}', 'pro', true, 47),
('refresh-48', 'Refresh', 'operate', '{}', 'flash', true, 48),
('brandsafety-49', 'Brand Safety', 'operate', '{}', 'pro', true, 49),
('knowledgebase-50', 'Knowledge Base', 'operate', '{}', 'flash', true, 50)
ON CONFLICT (key) DO NOTHING;

-- Verify all 50 agents were inserted
SELECT COUNT(*) as agent_count FROM agent_registry;
```

### Step 3: View Tables in Dashboard

After migration completes:

1. **Tables Tab**: Shows all tables
   - `pipeline_runs` - Master execution log
   - `agent_outputs` - Per-agent results
   - `lobstertrap_audit` - Security audit trail
   - `agent_registry` - All 50 agents with configuration

2. **Inspect each table** by clicking on it:
   - See columns and data types
   - View any existing rows
   - Add/edit data manually if needed

### Step 4: View Edge Functions

Edge functions are NOT in the Supabase dashboard tables. They live in your code:

1. **Location in repo**: `/supabase/functions/`

2. **Deploy to Supabase**:
   ```bash
   cd /vercel/share/v0-project
   supabase functions deploy pipeline-orchestrator
   supabase functions deploy discover
   # ... deploy each phase's functions
   ```

3. **After deployment**, go to **Functions** tab in Supabase dashboard to see:
   - `pipeline-orchestrator` - Main orchestrator
   - Individual agent functions (one per agent)

### Step 5: Test Everything End-to-End

1. Go to your app: `http://localhost:5173/admin/pipeline`
2. Click **"New Run"** tab
3. Fill form:
   - Topic: "Pakistan fintech boom"
   - Brand voice: "Professional"
   - Language: "English"
   - Enable agents: Select all for Phase 1
4. Click **"Start Pipeline"**
5. Watch **"Runs"** tab for real-time updates
6. In Supabase dashboard:
   - Check `pipeline_runs` for new entry
   - Check `agent_outputs` for agent results
   - Check `lobstertrap_audit` for security log

## SQL Quick Reference

### View all pipeline runs
```sql
SELECT id, topic, status, current_phase, total_tokens, created_at 
FROM pipeline_runs 
ORDER BY created_at DESC;
```

### View specific run's agents
```sql
SELECT agent_key, body FROM agent_outputs 
WHERE run_id = 'YOUR_RUN_ID' 
ORDER BY agent_key;
```

### View security audit trail
```sql
SELECT run_id, agent_key, injection_detected, pii_detected, risk_score, verdict, created_at
FROM lobstertrap_audit
WHERE run_id = 'YOUR_RUN_ID'
ORDER BY created_at;
```

### View all registered agents
```sql
SELECT key, name, phase, enabled, model 
FROM agent_registry 
ORDER BY order_index;
```

### Enable/disable agents
```sql
-- Disable expensive Pro agents to test on free tier
UPDATE agent_registry 
SET enabled = false 
WHERE model = 'pro';

-- Enable only Phase 1 for testing
UPDATE agent_registry 
SET enabled = false;

UPDATE agent_registry 
SET enabled = true 
WHERE phase = 'discover';
```

### Check realtime subscriptions
```sql
-- Supabase Dashboard → Realtime → Check subscriptions
-- Tables with realtime enabled:
-- - pipeline_runs
-- - lobstertrap_audit
```

## Troubleshooting

### "No tables found" in dashboard?
- Migration didn't run. Go to SQL Editor and run the migration SQL again
- Check for errors in the query result

### Can't see agent functions?
- Functions only appear AFTER deployment
- Run: `supabase functions deploy`
- Then check Functions tab in dashboard

### Admin UI shows "no data"?
- Pipeline run was created, but agent execution failed
- Check `lobstertrap_audit` table for errors
- Check browser console for JavaScript errors

### "Enable Realtime" error?
- Realtime is already enabled on tables in the migration
- If not, go to Table Settings → Realtime → Toggle ON

## Files Reference

| File | Purpose |
|------|---------|
| `supabase/migrations/20260517_complete_50_agent_schema.sql` | Database schema (run this first) |
| `supabase/functions/_shared/agents-complete.ts` | All 50 agent implementations |
| `supabase/functions/pipeline-orchestrator/index.ts` | Main orchestrator (invoke agents) |
| `src/pages/AdminPipeline.tsx` | Admin UI dashboard |
| `src/utils/pipelineAPI.ts` | Frontend API calls |

## Next Steps

1. ✓ Apply migrations to Supabase
2. ✓ Seed agent registry
3. ✓ Deploy edge functions
4. ✓ Test in admin UI
5. ✓ Monitor in Supabase dashboard
6. Deploy to production

---

**Status**: Ready to run. Start with Step 1!
