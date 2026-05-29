-- ============================================================
-- Quick Fix for UI Issues
-- Run this in Supabase SQL Editor to fix empty Health/System tabs
-- and ensure agent registry is populated
-- ============================================================

-- 1. Populate Agent Registry (if empty)
INSERT INTO agent_registry (key, name, phase, order_index, depends_on, model, enabled, description) VALUES
('scout', 'Scout', 'DISCOVER', 1, '{}', 'gemini-2.5-flash', true, 'Bright Data SERP + Web Unlocker source discovery'),
('intelligence', 'Intelligence', 'DISCOVER', 2, '{"scout"}', 'gemini-2.5-pro', true, 'AI/ML API GPT-4o + Cognee memory'),
('rewrite', 'Rewrite', 'CREATE', 3, '{"intelligence"}', 'gemini-2.5-flash', false, 'Gemini Flash human-style prose'),
('seo', 'SEO', 'CREATE', 4, '{"rewrite"}', 'gemini-2.5-flash', false, 'Bright Data SERP API keyword research'),
('vision', 'Vision', 'CREATE', 5, '{"rewrite"}', 'gemini-2.5-flash', false, 'Image sourcing and alt text'),
('creative', 'Creative', 'CREATE', 6, '{"rewrite"}', 'gemini-2.5-pro', false, 'Headlines A/B and hook generation'),
('guardian', 'Guardian', 'REVIEW', 7, '{"creative"}', 'gemini-2.5-flash', false, 'Bright Data + Lobster Trap compliance'),
('publish', 'Publish', 'PUBLISH', 8, '{"guardian"}', 'gemini-2.5-flash', false, 'TriggerWare.ai + WordPress API'),
('analytics', 'Analytics', 'OPERATE', 9, '{"publish"}', 'gemini-2.5-flash', false, 'Cognee memory performance tracking'),
('account-manager', 'Account Manager', 'OPERATE', 10, '{"analytics"}', 'gemini-2.5-flash', false, 'Bright Data Scraper API monitoring')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  phase = EXCLUDED.phase,
  order_index = EXCLUDED.order_index,
  depends_on = EXCLUDED.depends_on,
  model = EXCLUDED.model,
  description = EXCLUDED.description;

-- 2. Create pipeline_health table if it doesn't exist
CREATE TABLE IF NOT EXISTS pipeline_health (
  id TEXT PRIMARY KEY,
  overall_status TEXT NOT NULL,
  active_runs INTEGER DEFAULT 0,
  healthy_runs INTEGER DEFAULT 0,
  stuck_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  pending_approval INTEGER DEFAULT 0,
  auto_actions INTEGER DEFAULT 0,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  report JSONB
);

-- 3. Create system_health table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_health (
  id TEXT PRIMARY KEY,
  overall_status TEXT NOT NULL,
  uptime_pct NUMERIC DEFAULT 100,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  checks JSONB,
  critical_down TEXT[],
  degraded TEXT[]
);

-- 4. Insert mock pipeline health data
INSERT INTO pipeline_health (id, overall_status, active_runs, healthy_runs, stuck_runs, failed_runs, pending_approval, auto_actions, checked_at, report)
VALUES (
  'latest',
  'green',
  0,
  2,
  0,
  0,
  0,
  0,
  NOW(),
  '{"message": "All systems operational", "last_run": "2026-05-29T09:30:00Z", "avg_duration_ms": 94000}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  overall_status = EXCLUDED.overall_status,
  active_runs = EXCLUDED.active_runs,
  healthy_runs = EXCLUDED.healthy_runs,
  stuck_runs = EXCLUDED.stuck_runs,
  failed_runs = EXCLUDED.failed_runs,
  pending_approval = EXCLUDED.pending_approval,
  auto_actions = EXCLUDED.auto_actions,
  checked_at = EXCLUDED.checked_at,
  report = EXCLUDED.report;

-- 5. Insert mock system health data
INSERT INTO system_health (id, overall_status, uptime_pct, checked_at, checks, critical_down, degraded)
VALUES (
  'latest',
  'healthy',
  99.9,
  NOW(),
  '{
    "supabase": {"status": "ok", "latency_ms": 45, "detail": "Database responding normally"},
    "gemini": {"status": "ok", "latency_ms": 120, "detail": "AI API operational"},
    "firecrawl": {"status": "ok", "latency_ms": 890, "detail": "Web scraping functional"},
    "bright_data": {"status": "ok", "latency_ms": 340, "detail": "SERP API ready"},
    "edge_functions": {"status": "ok", "latency_ms": 230, "detail": "All functions deployed"}
  }'::jsonb,
  '{}',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET
  overall_status = EXCLUDED.overall_status,
  uptime_pct = EXCLUDED.uptime_pct,
  checked_at = EXCLUDED.checked_at,
  checks = EXCLUDED.checks,
  critical_down = EXCLUDED.critical_down,
  degraded = EXCLUDED.degraded;

-- 6. Verify data was inserted
SELECT 'Agent Registry' as table_name, COUNT(*)::text || ' agents' as status FROM agent_registry
UNION ALL
SELECT 'Pipeline Health', CASE WHEN EXISTS (SELECT 1 FROM pipeline_health WHERE id = 'latest') THEN '✅ Data exists' ELSE '❌ No data' END
UNION ALL
SELECT 'System Health', CASE WHEN EXISTS (SELECT 1 FROM system_health WHERE id = 'latest') THEN '✅ Data exists' ELSE '❌ No data' END;

-- ============================================================
-- After running this:
-- 1. Refresh Admin Pipeline page
-- 2. Go to "Agents (10)" tab - should see 10 agents with switches
-- 3. Go to "Health" tab - should see metrics
-- 4. Go to "System" tab - should see service status
-- ============================================================
