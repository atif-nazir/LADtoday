-- ============================================================
-- Pipeline Cron Job: Auto-advance running pipelines
-- Calls pipeline-orchestrator every 30 seconds with { "action": "cron" }
-- This prevents pipelines from stalling after edge function timeout
-- ============================================================
-- ALREADY APPLIED TO PRODUCTION via Supabase MCP on 2026-06-01
-- Service role key stored in vault.secrets with name 'service_role_key'
-- ============================================================

-- Ensure extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store service role key in vault (if not already there)
-- SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key', 'Supabase service role key for cron jobs');

-- Schedule pipeline advancement every 30 seconds
SELECT cron.schedule(
  'advance-pipeline-runs',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://esrqqkjkwomqlxjpcefg.supabase.co/functions/v1/pipeline-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets 
        WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{"action":"cron"}'::jsonb
  );
  $$
);
