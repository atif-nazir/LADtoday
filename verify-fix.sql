-- ============================================================
-- Verification Script for Scout & Intelligence Fix
-- Run EACH query separately (one at a time)
-- ============================================================

-- QUERY 1: Check RLS Policies (should see service_role_full_access)
-- Copy and run this first:
/*
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN policyname = 'service_role_full_access' THEN '✅ PASS'
    ELSE '⚠️ INFO'
  END as status
FROM pg_policies 
WHERE tablename = 'agent_outputs'
ORDER BY policyname;
*/

-- QUERY 2: Check Recent Agent Outputs (should have scout and intelligence)
-- Copy and run this second:
/*
SELECT 
  agent_key,
  status,
  CASE 
    WHEN status = 'completed' THEN '✅ PASS'
    WHEN status = 'failed' THEN '❌ FAIL'
    ELSE '⚠️ PENDING'
  END as test_status,
  jsonb_array_length(output->'sources') as source_count,
  tokens,
  duration_ms,
  error,
  created_at
FROM agent_outputs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
*/

-- QUERY 3: Check Scout Output Structure (should have sources array)
-- Copy and run this third:
/*
SELECT 
  run_id,
  CASE 
    WHEN output ? 'sources' THEN '✅ PASS - has sources key'
    ELSE '❌ FAIL - missing sources key'
  END as test_status,
  jsonb_array_length(output->'sources') as source_count,
  output->>'discovery_method' as discovery_method,
  output->>'top_source_domain' as top_domain,
  created_at
FROM agent_outputs
WHERE agent_key = 'scout'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
*/

-- QUERY 4: Check Intelligence Output (should have content_brief)
-- Copy and run this fourth:
/*
SELECT 
  run_id,
  CASE 
    WHEN output ? 'content_brief' THEN '✅ PASS - has content_brief'
    ELSE '❌ FAIL - missing content_brief'
  END as test_status,
  jsonb_array_length(output->'key_facts') as fact_count,
  output->>'virality_score' as virality_score,
  output->>'best_angle' as best_angle,
  created_at
FROM agent_outputs
WHERE agent_key = 'intelligence'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
*/

-- QUERY 5: Summary Report (run this last for overall status)
-- Copy and run this fifth:
/*
SELECT 
  COUNT(*) FILTER (WHERE agent_key = 'scout' AND status = 'completed') as scout_completed,
  COUNT(*) FILTER (WHERE agent_key = 'scout' AND status = 'failed') as scout_failed,
  COUNT(*) FILTER (WHERE agent_key = 'intelligence' AND status = 'completed') as intelligence_completed,
  COUNT(*) FILTER (WHERE agent_key = 'intelligence' AND status = 'failed') as intelligence_failed,
  COUNT(*) FILTER (WHERE status = 'failed') as total_failures,
  CASE 
    WHEN COUNT(*) FILTER (WHERE status = 'failed') = 0 THEN '✅ ALL TESTS PASSED'
    ELSE '❌ SOME TESTS FAILED'
  END as overall_status
FROM agent_outputs
WHERE created_at > NOW() - INTERVAL '1 hour';
*/

-- ============================================================
-- QUICK CHECK (Run this single query for fast verification):
-- ============================================================
SELECT 
  'RLS Policy' as check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_outputs' AND policyname = 'service_role_full_access') 
    THEN '✅ PASS' 
    ELSE '❌ FAIL - Missing service_role policy' 
  END as status
UNION ALL
SELECT 
  'Scout Outputs',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS - ' || COUNT(*)::text || ' outputs found'
    ELSE '❌ FAIL - No scout outputs'
  END
FROM agent_outputs 
WHERE agent_key = 'scout' AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'Intelligence Outputs',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS - ' || COUNT(*)::text || ' outputs found'
    ELSE '❌ FAIL - No intelligence outputs'
  END
FROM agent_outputs 
WHERE agent_key = 'intelligence' AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'Recent Failures',
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS - No failures'
    ELSE '⚠️ WARNING - ' || COUNT(*)::text || ' failures found'
  END
FROM agent_outputs 
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour';
