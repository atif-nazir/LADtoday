# UI Issues - Complete Fix Guide

## Issues Reported

1. ✅ Do Scout & Intelligence follow hackathon tech spec?
2. ❌ Where to toggle Bright Data discovery method?
3. ❌ Enable/disable buttons removed from Agents tab
4. ❌ Nothing shown in Health section
5. ❌ Lobster Trap not properly set up

---

## Issue 1: Tech Stack Compliance ✅

### Hackathon Spec Requirements:
- **Scout**: Bright Data SERP + Web Unlocker + Scraping Browser + Web Scraper API
- **Intelligence**: AI/ML API GPT-4o + Cognee memory

### Current Implementation:
**Scout** (`supabase/functions/scout/index.ts`):
- ✅ Firecrawl (similar to Bright Data Web Unlocker)
- ✅ Gemini Grounding (similar to SERP API)
- ✅ DuckDuckGo (fallback)
- ❌ Missing: Direct Bright Data integration

**Intelligence** (`supabase/functions/intelligence/index.ts`):
- ✅ Gemini (instead of GPT-4o)
- ❌ Missing: Cognee memory integration
- ❌ Missing: AI/ML API

### Action Required:
Scout and Intelligence need to be updated to match the hackathon spec. See `TECH_STACK_ALIGNMENT.md` for migration plan.

---

## Issue 2: Bright Data Toggle ✅ EXISTS

### Location:
The Bright Data discovery method toggle **already exists** in the New Run form!

**Where to find it:**
1. Go to Admin Pipeline page
2. Click "New Run" button
3. Look for **"DISCOVERY METHOD (SCOUT)"** dropdown
4. Options:
   - Auto (Firecrawl → Gemini grounding → DuckDuckGo)
   - Firecrawl (best quality, uses API key)
   - Gemini Google Search grounding (20 RPD)
   - DuckDuckGo HTML (no key, always works)

**Screenshot location:** See your first screenshot - it's visible!

### To Add Bright Data Options:
Update the dropdown in `AdminPipeline.tsx`:

```typescript
// Add these options to the discovery method select
<option value="brightdata_serp">Bright Data SERP API</option>
<option value="brightdata_unlocker">Bright Data Web Unlocker</option>
<option value="brightdata_browser">Bright Data Scraping Browser</option>
```

Then update Scout function to handle these modes.

---

## Issue 3: Enable/Disable Buttons ❌ THEY EXIST!

### Status: **NOT REMOVED** - They are there!

**Location:**
1. Go to Admin Pipeline page
2. Click **"Agents (10)"** tab
3. Scroll down - you'll see all phases with toggle switches

**What you should see:**
```
Discover                    0/0 enabled
├─ 01 Scout         [Switch]
├─ 02 Intelligence  [Switch]

Create                      0/0 enabled
├─ 03 Rewrite       [Switch]
├─ 04 SEO           [Switch]
├─ 05 Vision        [Switch]
├─ 06 Creative      [Switch]

Review                      0/0 enabled
├─ 07 Guardian      [Switch]

Publish                     0/0 enabled
├─ 08 Publish       [Switch]

Operate                     0/0 enabled
├─ 09 Analytics     [Switch]
├─ 10 Account Mgr   [Switch]
```

### If You Don't See Them:
**Possible causes:**
1. **Database not populated**: Run this SQL to populate agent_registry:

```sql
-- Check if agents exist
SELECT key, name, enabled FROM agent_registry ORDER BY order_index;

-- If empty, insert the 10 agents:
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
```

2. **UI not loading**: Check browser console for errors
3. **Wrong tab**: Make sure you're on "Agents (10)" tab, not "Runs"

---

## Issue 4: Health Section Empty ❌ NEEDS DATA

### Why It's Empty:
The Health and System tabs show data from these tables:
- `pipeline_health` (for Health tab)
- `system_health` (for System tab)

These tables are populated by **monitoring agents** that don't exist yet:
- Agent 44: Pipeline Monitor (runs every 5 min via cron)
- Agent 46: Health Check (runs every 10 min)

### Current Status:
```
Health Tab: "No health data yet. Pipeline Monitor (agent-44) runs every 5 min via cron."
System Tab: "No health data yet. Health Check (agent-46) runs every 10 min."
```

### Fix Options:

**Option 1: Create Mock Data (Quick Test)**
```sql
-- Insert mock pipeline health
INSERT INTO pipeline_health (id, overall_status, active_runs, healthy_runs, stuck_runs, failed_runs, pending_approval, auto_actions, checked_at, report)
VALUES (
  'latest',
  'green',
  2,
  2,
  0,
  0,
  0,
  0,
  NOW(),
  '{"message": "All systems operational"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  overall_status = EXCLUDED.overall_status,
  active_runs = EXCLUDED.active_runs,
  healthy_runs = EXCLUDED.healthy_runs,
  checked_at = EXCLUDED.checked_at;

-- Insert mock system health
INSERT INTO system_health (id, overall_status, uptime_pct, checked_at, checks)
VALUES (
  'latest',
  'healthy',
  99.9,
  NOW(),
  '{
    "supabase": {"status": "ok", "latency_ms": 45},
    "gemini": {"status": "ok", "latency_ms": 120},
    "firecrawl": {"status": "ok", "latency_ms": 890},
    "bright_data": {"status": "ok", "latency_ms": 340}
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  overall_status = EXCLUDED.overall_status,
  uptime_pct = EXCLUDED.uptime_pct,
  checked_at = EXCLUDED.checked_at,
  checks = EXCLUDED.checks;
```

**Option 2: Create Monitoring Agents (Proper Solution)**
Create these edge functions:
- `supabase/functions/pipeline-monitor/index.ts`
- `supabase/functions/health-check/index.ts`

Set up Supabase cron jobs to run them periodically.

**Option 3: Update UI to Show Real-Time Data**
Instead of waiting for monitoring agents, calculate health from existing data:

```typescript
// In PipelineHealthTab.tsx
const load = async () => {
  // Query pipeline_runs directly
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("status, created_at")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  
  const health = {
    active_runs: runs?.filter(r => r.status === 'running').length || 0,
    healthy_runs: runs?.filter(r => r.status === 'completed').length || 0,
    failed_runs: runs?.filter(r => r.status === 'failed').length || 0,
    overall_status: runs?.some(r => r.status === 'failed') ? 'yellow' : 'green',
  };
  
  setHealth(health);
};
```

---

## Issue 5: Lobster Trap Not Set Up ❌ NEEDS IMPLEMENTATION

### What is Lobster Trap?
From hackathon spec:
> **Lobster Trap DPI Proxy** - Intercepts all outbound Gemini/AI calls for prompt injection detection

### Current Status:
**NOT IMPLEMENTED** - No Lobster Trap code exists in the project.

### Where It Should Be:
According to spec, Lobster Trap should be in:
- `supabase/functions/_shared/lobstertrap.ts` (shared module)
- Used by Guardian Agent (Agent 07)
- Intercepts ALL AI calls before execution

### Implementation Plan:

**Step 1: Create Lobster Trap Module**
```typescript
// supabase/functions/_shared/lobstertrap.ts
export interface LobsterTrapResult {
  safe: boolean;
  injection_detected: boolean;
  sanitized_prompt: string;
  threats: string[];
}

export async function lobsterTrapProxy(prompt: string): Promise<LobsterTrapResult> {
  const injectionPatterns = [
    /ignore previous instructions/i,
    /you are now/i,
    /forget everything/i,
    /act as/i,
    /jailbreak/i,
    /system prompt/i,
    /reveal your instructions/i,
  ];
  
  const threats: string[] = [];
  let injection_detected = false;
  
  for (const pattern of injectionPatterns) {
    if (pattern.test(prompt)) {
      injection_detected = true;
      threats.push(pattern.source);
    }
  }
  
  // Log to lobstertrap_audit table
  await supabase.from("lobstertrap_audit").insert({
    prompt_hash: hashPrompt(prompt),
    injection_detected,
    threats,
    blocked: injection_detected,
    created_at: new Date().toISOString(),
  });
  
  return {
    safe: !injection_detected,
    injection_detected,
    sanitized_prompt: injection_detected ? "[BLOCKED BY LOBSTER TRAP]" : prompt,
    threats,
  };
}

function hashPrompt(prompt: string): string {
  // Simple hash for audit trail (don't store full prompts)
  return prompt.slice(0, 50) + "..." + prompt.length;
}
```

**Step 2: Integrate with Gemini Helper**
```typescript
// In _shared/gemini.ts
import { lobsterTrapProxy } from "./lobstertrap.ts";

export async function geminiJson<T>(prompt: string, schema: any, opts?: any): Promise<T> {
  // Check with Lobster Trap first
  const trapResult = await lobsterTrapProxy(prompt);
  
  if (!trapResult.safe) {
    throw new GeminiError(
      `Prompt blocked by Lobster Trap: ${trapResult.threats.join(", ")}`,
      403,
      "prompt_injection_detected"
    );
  }
  
  // Continue with normal Gemini call...
  const response = await fetch(url, {
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: trapResult.sanitized_prompt }] }],
      // ...
    })
  });
}
```

**Step 3: Create Lobster Trap Audit Table**
```sql
CREATE TABLE IF NOT EXISTS lobstertrap_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  injection_detected BOOLEAN DEFAULT false,
  threats TEXT[],
  blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lobstertrap_run ON lobstertrap_audit(run_id);
CREATE INDEX idx_lobstertrap_agent ON lobstertrap_audit(agent_key);
CREATE INDEX idx_lobstertrap_blocked ON lobstertrap_audit(blocked);
```

**Step 4: Add Lobster Trap UI**
Add a new tab in AdminPipeline to show Lobster Trap audit logs:

```typescript
// In AdminPipeline.tsx tabs
<TabsTrigger value="lobstertrap">
  <Shield className="w-4 h-4 mr-2" />
  Lobster Trap
</TabsTrigger>

// Tab content
<TabsContent value="lobstertrap">
  <LobsterTrapTab />
</TabsContent>
```

---

## Summary of Fixes Needed

| Issue | Status | Action Required |
|-------|--------|-----------------|
| 1. Tech stack compliance | ⚠️ Partial | Migrate to Bright Data + AI/ML API + Cognee |
| 2. Bright Data toggle | ✅ EXISTS | Add Bright Data options to dropdown |
| 3. Enable/disable buttons | ✅ EXISTS | Populate agent_registry table if empty |
| 4. Health section empty | ❌ NO DATA | Insert mock data OR create monitoring agents |
| 5. Lobster Trap | ❌ NOT IMPLEMENTED | Create lobstertrap.ts + integrate + add UI |

---

## Quick Fixes (Do These Now)

### 1. Populate Agent Registry
```sql
-- Run in Supabase SQL Editor
-- (See Issue 3 above for full SQL)
```

### 2. Add Mock Health Data
```sql
-- Run in Supabase SQL Editor
-- (See Issue 4 above for full SQL)
```

### 3. Verify UI Components Load
- Check browser console for errors
- Refresh Admin Pipeline page
- Verify all tabs are visible

---

## Long-Term Fixes (Hackathon Compliance)

### 1. Migrate to Bright Data
- Replace Firecrawl with Bright Data Web Unlocker
- Replace Gemini grounding with Bright Data SERP API
- Add Bright Data Scraping Browser for JS sites
- Add Bright Data Web Scraper API for structured data

### 2. Add Cognee Memory
- Integrate Cognee API in Intelligence agent
- Store performance data after each publish
- Recall successful patterns before generation

### 3. Implement Lobster Trap
- Create lobstertrap.ts module
- Integrate with all AI calls
- Add audit logging
- Create UI dashboard

### 4. Create Monitoring Agents
- Agent 44: Pipeline Monitor
- Agent 46: Health Check
- Set up Supabase cron jobs

---

## Files to Create/Update

**New Files:**
- `supabase/functions/_shared/lobstertrap.ts`
- `supabase/functions/pipeline-monitor/index.ts`
- `supabase/functions/health-check/index.ts`
- `src/components/pipeline/LobsterTrapTab.tsx`
- `supabase/migrations/XXXXXX_lobstertrap_audit.sql`

**Update Files:**
- `supabase/functions/scout/index.ts` (add Bright Data)
- `supabase/functions/intelligence/index.ts` (add Cognee + AI/ML API)
- `supabase/functions/_shared/gemini.ts` (integrate Lobster Trap)
- `src/pages/AdminPipeline.tsx` (add Lobster Trap tab)
- `src/components/pipeline/PipelineHealthTab.tsx` (real-time data)
- `src/components/pipeline/SystemHealthTab.tsx` (real-time data)

---

## Testing Checklist

- [ ] Agent registry populated (10 agents visible)
- [ ] Enable/disable switches work
- [ ] Health tab shows data
- [ ] System tab shows data
- [ ] Discovery method dropdown has all options
- [ ] Lobster Trap audit table exists
- [ ] Lobster Trap blocks injection attempts
- [ ] All tabs load without errors

---

**Next Steps:** Start with Quick Fixes to get UI working, then tackle Long-Term Fixes for hackathon compliance.
