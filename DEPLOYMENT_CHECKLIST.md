# Scout & Intelligence Fix - Deployment Checklist

## Pre-Deployment
- [ ] Read `QUICK_FIX_DEPLOY.md`
- [ ] Backup current database (optional but recommended)
- [ ] Note current pipeline status

## Deployment Steps

### 1. Apply Database Migration
```bash
cd d:\Blogwebidea\blogweb\simple-sign-in
supabase db push
```
- [ ] Migration applied successfully
- [ ] No errors in output

### 2. Deploy Edge Functions
```bash
supabase functions deploy scout
supabase functions deploy intelligence
```
- [ ] Scout deployed successfully
- [ ] Intelligence deployed successfully
- [ ] No deployment errors

### 3. Verify Database Changes
Open Supabase SQL Editor and run `quick-verify.sql`:
- [ ] RLS Policy shows ✅ PASS
- [ ] No recent failures

### 4. Test Pipeline
1. Open your app → Admin Pipeline
2. Click "New Run"
3. Enter topic: "new scholarship opportunities for Pakistani students"
4. Click "Start Pipeline"
5. Wait for Scout to complete (~30 seconds)
6. Click on Scout agent card

**Expected Results:**
- [ ] Scout shows "completed" status
- [ ] Scout output visible (not "No output yet")
- [ ] Scout output contains sources array
- [ ] Intelligence starts automatically
- [ ] Intelligence completes successfully
- [ ] No "error: no sources" message

### 5. Verify Output Structure
Run in SQL Editor:
```sql
SELECT 
  agent_key,
  status,
  jsonb_array_length(output->'sources') as source_count
FROM agent_outputs
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```
- [ ] Scout has source_count > 0
- [ ] Intelligence has output with content_brief

## Post-Deployment

### Monitor for Issues
- [ ] Check Supabase function logs for errors
- [ ] Run 2-3 more test pipelines with different topics
- [ ] Verify all agents in pipeline complete

### If Everything Works
- [ ] Mark issue as resolved
- [ ] Document in project notes
- [ ] Delete test runs if needed

### If Issues Persist
1. Check function logs in Supabase dashboard
2. Run detailed verification: `verify-fix.sql` (individual queries)
3. Verify environment variables are set:
   - GEMINI_API_KEY
   - FIRECRAWL_API_KEY (optional)
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY

## Rollback (if needed)

```sql
-- Remove service_role policy
DROP POLICY IF EXISTS "service_role_full_access" ON public.agent_outputs;

-- Restore original admin-only policy
CREATE POLICY "Admins manage agent_outputs"
  ON public.agent_outputs 
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

Then redeploy previous function versions.

## Success Criteria

✅ All checks passed when:
- RLS policy exists
- Scout writes output to database
- Intelligence reads Scout output
- Pipeline completes end-to-end
- No "no sources" errors
- UI shows agent outputs

## Support Files

- `QUICK_FIX_DEPLOY.md` - Quick deployment guide
- `AGENT_FIXES_SUMMARY.md` - Technical details
- `quick-verify.sql` - Single query verification
- `test-scout-output.sql` - Detailed testing queries
- `verify-fix.sql` - Comprehensive verification

## Notes

Date deployed: _______________
Deployed by: _______________
Test run ID: _______________
Status: ⬜ Success ⬜ Partial ⬜ Failed
Notes: _______________________________________________
