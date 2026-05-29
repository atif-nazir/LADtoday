-- Test script to verify Scout output is being written correctly
-- Run EACH query separately (one at a time)

-- ============================================================
-- QUICK SINGLE QUERY - Run this first for fast check:
-- ============================================================
SELECT 
  'Policy Check' as test,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_outputs' AND policyname = 'service_role_full_access') 
    THEN '✅ service_role policy exists' 
    ELSE '❌ Missing service_role policy - run migration!' 
  END as result
UNION ALL
SELECT 
  'Recent Scout Outputs',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Found ' || COUNT(*)::text || ' scout outputs'
    ELSE '⚠️ No scout outputs yet - try running a pipeline'
  END
FROM agent_outputs WHERE agent_key = 'scout' AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'Recent Intelligence Outputs',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Found ' || COUNT(*)::text || ' intelligence outputs'
    ELSE '⚠️ No intelligence outputs yet'
  END
FROM agent_outputs WHERE agent_key = 'intelligence' AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================================
-- Individual queries (run separately if needed):
-- ============================================================

-- 1. Check if service_role policy exists
/*
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd
FROM pg_policies 
WHERE tablename = 'agent_outputs'
ORDER BY policyname;
*/

-- 2. Check recent agent_outputs
/*
SELECT 
  id,
  run_id,
  agent_key,
  status,
  jsonb_pretty(output) as output_preview,
  tokens,
  duration_ms,
  error,
  created_at
FROM agent_outputs
WHERE agent_key IN ('scout', 'intelligence')
ORDER BY created_at DESC
LIMIT 5;
*/

-- 3. Check pipeline_runs agent_states
/*
SELECT 
  id,
  topic,
  status,
  jsonb_pretty(agent_states) as agent_states_preview,
  created_at_run
FROM pipeline_runs
ORDER BY created_at_run DESC
LIMIT 3;
*/

-- 4. Check for any failed runs
/*
SELECT 
  run_id,
  agent_key,
  status,
  error,
  created_at
FROM agent_outputs
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
*/
