-- ============================================================
-- SINGLE QUERY - Quick Verification for Scout & Intelligence Fix
-- Copy and paste this entire query into Supabase SQL Editor
-- ============================================================

SELECT 
  'RLS Policy' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'agent_outputs' 
      AND policyname = 'service_role_full_access'
    ) 
    THEN '✅ PASS - service_role policy exists' 
    ELSE '❌ FAIL - Run migration: 20260529120000_fix_agent_outputs_rls.sql' 
  END as status,
  '' as details
UNION ALL
SELECT 
  'Scout Outputs (last hour)',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS - ' || COUNT(*)::text || ' outputs found'
    ELSE '⚠️ WARNING - No scout outputs (try running a pipeline)'
  END,
  STRING_AGG(status::text, ', ') as statuses
FROM agent_outputs 
WHERE agent_key = 'scout' 
  AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'Intelligence Outputs (last hour)',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS - ' || COUNT(*)::text || ' outputs found'
    ELSE '⚠️ WARNING - No intelligence outputs yet'
  END,
  STRING_AGG(status::text, ', ')
FROM agent_outputs 
WHERE agent_key = 'intelligence' 
  AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'Recent Failures',
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS - No failures'
    ELSE '❌ FAIL - ' || COUNT(*)::text || ' failures found'
  END,
  STRING_AGG(agent_key || ': ' || COALESCE(error, 'unknown'), '; ')
FROM agent_outputs 
WHERE status = 'failed' 
  AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'Overall Status',
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_outputs' AND policyname = 'service_role_full_access')
      AND NOT EXISTS (SELECT 1 FROM agent_outputs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour')
    THEN '✅✅✅ ALL CHECKS PASSED - System is working!'
    ELSE '⚠️ Some checks failed - review details above'
  END,
  'Run a test pipeline if no outputs found yet'
ORDER BY 
  CASE check_type
    WHEN 'RLS Policy' THEN 1
    WHEN 'Scout Outputs (last hour)' THEN 2
    WHEN 'Intelligence Outputs (last hour)' THEN 3
    WHEN 'Recent Failures' THEN 4
    WHEN 'Overall Status' THEN 5
  END;
