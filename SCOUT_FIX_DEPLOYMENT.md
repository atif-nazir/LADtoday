# Scout & Intelligence Agent Fix - Deployment Guide

## Problem
Scout agent completes but shows "No output yet for this agent in this run"
Intelligence agent fails with "no sources" error

## Root Cause
Row Level Security (RLS) policy on `agent_outputs` table was blocking service_role writes from edge functions.

## Solution

### 1. Database Migration
Apply the RLS fix migration:

```bash
# Push the new migration to Supabase
supabase db push

# Or apply manually in SQL Editor:
```

```sql
-- Fix agent_outputs RLS to allow service_role writes
DROP POLICY IF EXISTS "Admins manage agent_outputs" ON public.agent_outputs;

CREATE POLICY "service_role_full_access" 
  ON public.agent_outputs 
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins manage agent_outputs"
  ON public.agent_outputs 
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

### 2. Deploy Updated Edge Functions

```bash
# Deploy Scout with enhanced error logging
supabase functions deploy scout

# Deploy Intelligence with better error handling
supabase functions deploy intelligence
```

### 3. Verify the Fix

**Option 1: Quick Single Query (Recommended)**
```bash
# In Supabase SQL Editor, run:
# quick-verify.sql (single query, copy entire file)
```

**Option 2: Detailed Verification**
```bash
# In Supabase SQL Editor, run queries from:
# test-scout-output.sql (run the first query for quick check)
# verify-fix.sql (run individual queries as needed)
```

Or manually check:
```sql
-- Quick check (single query):
SELECT 
  'RLS Policy' as check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_outputs' AND policyname = 'service_role_full_access') 
    THEN '✅ PASS' 
    ELSE '❌ FAIL' 
  END as status
UNION ALL
SELECT 'Scout Outputs', CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '⚠️ NONE' END
FROM agent_outputs WHERE agent_key = 'scout' AND created_at > NOW() - INTERVAL '1 hour';
```

### 4. Test a Pipeline Run

1. Go to Admin Pipeline page
2. Create a new run with topic: "new scholarship opportunities for Pakistani students"
3. Watch the pipeline execute
4. Click on Scout agent - should now show output with sources
5. Intelligence should complete successfully

## Changes Made

### Database
- `20260529120000_fix_agent_outputs_rls.sql` - Added service_role policy

### Edge Functions

#### scout/index.ts
- Added detailed error logging for writeAgentOutput
- Added try-catch blocks around output writing
- Better error messages for debugging

#### intelligence/index.ts
- Added graceful handling for 0 sources from Scout
- Better logging of source count
- Continues with knowledge-based analysis if no external sources

## Verification Checklist

- [ ] Migration applied successfully
- [ ] service_role policy exists on agent_outputs
- [ ] Scout function deployed
- [ ] Intelligence function deployed
- [ ] Test run completes successfully
- [ ] Scout output visible in UI
- [ ] Intelligence receives Scout output
- [ ] No "no sources" errors

## Rollback Plan

If issues occur:

```sql
-- Restore original policy
DROP POLICY IF EXISTS "service_role_full_access" ON public.agent_outputs;
DROP POLICY IF EXISTS "Admins manage agent_outputs" ON public.agent_outputs;

CREATE POLICY "Admins manage agent_outputs"
  ON public.agent_outputs 
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

Then redeploy previous function versions.

## Additional Notes

- The service_role key used by edge functions now has full access to agent_outputs
- Admin users still have full access via their policy
- Enhanced logging will help debug any future issues
- Intelligence can now handle 0-source scenarios gracefully
