# Quick Fix Deployment - Scout & Intelligence

## 🚀 Deploy in 3 Steps

### Step 1: Apply Database Fix
```bash
cd d:\Blogwebidea\blogweb\simple-sign-in
supabase db push
```

**What it does:** Adds service_role policy to agent_outputs table so edge functions can write

### Step 2: Deploy Updated Functions
```bash
supabase functions deploy scout
supabase functions deploy intelligence
```

**What it does:** Deploys enhanced error handling and logging

### Step 3: Test
1. Open your app → Admin Pipeline
2. Click "New Run"
3. Topic: "new scholarship opportunities for Pakistani students"
4. Click "Start Pipeline"
5. Watch Scout complete → Click on Scout → Should see sources!
6. Intelligence should complete successfully

## ✅ Success Indicators

- Scout shows output with sources (not "No output yet")
- Intelligence completes (not "error: no sources")
- Pipeline progresses through all phases

## 🔍 Quick Verification

Run this single query in Supabase SQL Editor:
```sql
-- Copy entire contents of: quick-verify.sql
-- Or run this quick check:
SELECT 
  'RLS Policy' as check,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_outputs' AND policyname = 'service_role_full_access') 
    THEN '✅ PASS' 
    ELSE '❌ FAIL - Run migration!' 
  END as status;
```

## ❌ If Still Failing

1. **Check Policy Exists:**
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'agent_outputs';
-- Should see: service_role_full_access
```

2. **Check Recent Outputs:**
```sql
SELECT agent_key, status, error FROM agent_outputs ORDER BY created_at DESC LIMIT 5;
```

## 📋 What Was Fixed

1. **RLS Policy** - Edge functions can now write to agent_outputs
2. **Scout** - Better error logging, catches write failures
3. **Intelligence** - Handles 0 sources gracefully

## 🔧 Manual SQL Fix (if db push fails)

Run in Supabase SQL Editor:
```sql
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

## 📚 Full Documentation

- `AGENT_FIXES_SUMMARY.md` - Complete technical details
- `SCOUT_FIX_DEPLOYMENT.md` - Detailed deployment guide
- `test-scout-output.sql` - Verification queries
