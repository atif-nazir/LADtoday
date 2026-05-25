# Complete 50-Agent LADtoday System - Deployment & Testing Guide

## Overview

This document covers the complete 50-agent intelligence swarm implementation for LADtoday, including database schema, edge functions, orchestration, and end-to-end testing.

## Architecture Summary

```
Frontend (React)
  ↓
Admin Dashboard (/admin/pipeline)
  ↓
Orchestrator Edge Function
  ↓
  ├─ Phase 1: Discover (7 agents)
  ├─ Phase 2: Analyze (7 agents)
  ├─ Phase 3: Create (7 agents)
  ├─ Phase 4: Multimedia (10 agents)
  ├─ Phase 5: Distribute (9 agents)
  ├─ Phase 6: Monetize (5 agents)
  └─ Phase 7: Operate (5 agents)
  ↓
Supabase Database
  ├─ pipeline_runs (execution log)
  ├─ agent_outputs (per-agent results)
  ├─ lobstertrap_audit (security trail)
  └─ [Phase-specific output tables]
```

## Database Migration

### Required Tables (from migration `20260517_complete_50_agent_schema.sql`)

1. **pipeline_runs** - Master execution log
   - `id` (uuid, PK)
   - `topic` (text)
   - `status` (pending|running|completed|failed)
   - `current_phase` (foundation|discover|...|operate)
   - `agent_states` (JSONB - execution state for all agents)
   - `total_tokens` (int)
   - `estimated_cost_usd` (decimal)
   - Phase completion timestamps (discovered_at, analyzed_at, etc.)

2. **agent_outputs** - Per-agent results
   - `id` (uuid, PK)
   - `run_id` (FK to pipeline_runs)
   - `agent_key` (text - unique agent identifier)
   - `phase` (text)
   - `status` (pending|running|completed|failed)
   - `body` (JSONB - structured agent output)
   - `input_tokens`, `output_tokens` (int)
   - UNIQUE constraint on (run_id, agent_key)

3. **lobstertrap_audit** - Security decisions
   - `id` (uuid, PK)
   - `run_id` (FK)
   - `agent_key` (text)
   - `injection_detected` (boolean)
   - `pii_detected` (boolean)
   - `risk_score` (decimal 0-1)
   - `verdict` (approved|review|rejected)
   - `action_taken` (allowed|masked|blocked|reviewed)
   - `latency_ms` (int)

4. **agent_registry** - All 50 agents metadata
   - `id` (uuid, PK)
   - `key` (text, UNIQUE - scout-01 through kb-50)
   - `name` (text)
   - `phase` (text)
   - `model` (flash|pro)
   - `max_tokens` (int)
   - `depends_on` (TEXT[] - prerequisite agents for DAG)
   - `enabled` (boolean)
   - `is_critical` (boolean)

5. **Phase-specific output tables**
   - discover_outputs
   - analyze_outputs
   - create_outputs
   - multimedia_outputs
   - distribute_outputs
   - monetize_outputs
   - operate_outputs

### Applying Migrations

```bash
# Option 1: Via Supabase Dashboard
1. Open https://supabase.com/dashboard
2. Go to SQL Editor
3. Copy contents of supabase/migrations/20260517_complete_50_agent_schema.sql
4. Run the query
5. Verify tables are created

# Option 2: Via Supabase CLI
$ supabase db push
```

## Edge Functions Setup

### Required Edge Functions

All edge functions are in `supabase/functions/`:

1. **_shared/gemini.ts** (Updated)
   - `guardedGeminiText()` - Text generation with safety checks
   - `guardedGeminiJson()` - JSON generation with safety checks
   - `analyzePromptSafety()` - Injection/PII detection
   - `maskPII()` - Automatic PII redaction

2. **_shared/pipeline.ts** (Updated)
   - `createRun()` - Initialize pipeline_runs
   - `markRunCompleted()` / `markRunFailed()`
   - `nextRunnableAgents()` - Topological DAG lookup
   - `readAgentOutput()` / `writeAgentOutput()` - Agent communication

3. **_shared/agents.ts** (New)
   - Implementation of all 50 agents
   - Phase 1: Scout, Intelligence, Trends, etc.
   - Phase 2-7: Templates for remaining agents
   - Each agent: read dependencies → call guardedGemini → write output

4. **pipeline-orchestrator/index.ts** (Updated)
   - POST endpoint for pipeline execution
   - Executes all 7 phases sequentially
   - Invokes agents in parallel per phase
   - Tracks phase completion

### Deploying Edge Functions

```bash
# Deploy all functions to Supabase
$ supabase functions deploy

# Or specific function
$ supabase functions deploy pipeline-orchestrator
$ supabase functions deploy scout-01

# Test the orchestrator locally
$ supabase functions serve
# Then POST to http://localhost:54321/functions/v1/pipeline-orchestrator
```

## Configuration

### Environment Variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VITE_SUPABASE_URL=https://your-project.supabase.co
GEMINI_API_KEY=your-gemini-key
```

### Database Connection

```bash
# Test Supabase connection
$ npm run test:db

# Query example
$ curl -X GET "https://your-project.supabase.co/rest/v1/pipeline_runs?limit=1" \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key"
```

## End-to-End Testing

### 1. Start Development Server

```bash
$ npm run dev
# Frontend at http://localhost:5173
# Edge functions at http://localhost:54321
```

### 2. Test Database Connection

```bash
# Open http://localhost:5173/admin/pipeline
# Should load without errors
# Check browser console for any DB errors
```

### 3. Create a Pipeline Run

```bash
# In Admin Dashboard:
# 1. Go to "New Run" tab
# 2. Enter topic: "Pakistan fintech boom"
# 3. Select brand voice: "professional"
# 4. Enable agents from each phase (start with Phase 1)
# 5. Click "Start Pipeline"
```

### 4. Monitor Execution

```bash
# Watch the "Runs" tab for:
# - Pipeline status changes (pending → running → completed)
# - Phase progress bar updates
# - Agent output accumulation
# - Token count increase
```

### 5. Verify Agent Outputs

```bash
# Query agent outputs directly
curl -X GET "https://your-project.supabase.co/rest/v1/agent_outputs?run_id=eq.{run_id}" \
  -H "apikey: your-anon-key"

# Response: Array of agent execution results
```

### 6. Check Security Audit Trail

```bash
# Query audit logs
curl -X GET "https://your-project.supabase.co/rest/v1/lobstertrap_audit?run_id=eq.{run_id}" \
  -H "apikey: your-anon-key"

# Each row shows:
# - Prompt preview (first 200 chars)
# - Injection detection result
# - PII detection result
# - Risk score
# - Verdict (approved/review/rejected)
```

## Testing Checklist

- [ ] Database migrations applied successfully
- [ ] All tables created with correct schema
- [ ] RLS policies enabled
- [ ] Realtime subscriptions configured
- [ ] Supabase connection from frontend works
- [ ] Admin dashboard loads without errors
- [ ] New Run form works
- [ ] Pipeline orchestrator triggers successfully
- [ ] Agents are invoked (check logs)
- [ ] Agent outputs are saved to database
- [ ] Runs tab updates in real-time
- [ ] Agent details visible in Runs tab
- [ ] Phase progress bars show correctly
- [ ] Audit log captures all Gemini calls
- [ ] PII masking works for sensitive data
- [ ] Injection detection blocks malicious prompts
- [ ] Token counts accumulate correctly
- [ ] Cost estimation is accurate

## SQL Queries Reference

### Get all pipeline runs

```sql
SELECT id, topic, status, current_phase, total_tokens, estimated_cost_usd, created_at_run
FROM pipeline_runs
ORDER BY created_at_run DESC
LIMIT 50;
```

### Get agent outputs for a specific run

```sql
SELECT agent_key, phase, status, execution_time_ms, body
FROM agent_outputs
WHERE run_id = 'YOUR_RUN_ID'
ORDER BY agent_key;
```

### Get security audit trail

```sql
SELECT agent_key, injection_detected, pii_detected, risk_score, verdict, action_taken
FROM lobstertrap_audit
WHERE run_id = 'YOUR_RUN_ID'
ORDER BY created_at;
```

### Get agent registry

```sql
SELECT key, name, phase, model, max_tokens, enabled, depends_on
FROM agent_registry
ORDER BY order_index;
```

### Enable/Disable agents

```sql
UPDATE agent_registry
SET enabled = true
WHERE phase = 'discover';

UPDATE agent_registry
SET enabled = false
WHERE key NOT IN ('guardian-47', 'brand-safety-49');
```

### Check realtime subscriptions

```sql
SELECT * FROM pg_stat_replication;
```

## Troubleshooting

### Pipeline won't start

1. Check Supabase connection
2. Verify GEMINI_API_KEY is set
3. Check edge function logs: `supabase functions list`
4. Test orchestrator directly:
   ```bash
   curl -X POST http://localhost:54321/functions/v1/pipeline-orchestrator \
     -H "Content-Type: application/json" \
     -d '{"topic": "test"}'
   ```

### Agents not executing

1. Check agent_registry: are agents enabled?
2. Check DAG dependencies: `depends_on` field
3. Verify edge functions are deployed
4. Check function logs: `supabase functions logs pipeline-orchestrator`

### No agent outputs saved

1. Verify agent_outputs table exists
2. Check agent implementations are calling `writeAgentOutput()`
3. Verify RLS policies allow inserts
4. Check for errors in agent execution

### Realtime not updating

1. Enable realtime in Supabase dashboard
2. Check subscriptions in frontend:
   ```typescript
   const subscription = supabase
     .channel('pipeline_runs_changes')
     .on('postgres_changes', ...)
     .subscribe();
   ```
3. Verify tables have realtime enabled

## Performance Tuning

### Optimize agent execution

```sql
-- Add indexes for faster lookups
CREATE INDEX idx_agent_outputs_run_phase ON agent_outputs(run_id, phase);
CREATE INDEX idx_agent_registry_phase_enabled ON agent_registry(phase, enabled);
```

### Batch agent invocations

```typescript
// Invoke agents in parallel per phase
const agentsInPhase = await nextRunnableAgents(supabase, runId, phase);
const results = await Promise.allSettled(
  agentsInPhase.map(agent => invokeAgent(agent.key, runId))
);
```

### Cache agent registry

```typescript
// Cache the agent registry in memory
const agentCache = new Map();
const getAgent = async (key: string) => {
  if (agentCache.has(key)) return agentCache.get(key);
  const agent = await supabase.from('agent_registry').select().eq('key', key).single();
  agentCache.set(key, agent);
  return agent;
};
```

## Deployment to Production

### Supabase Setup

1. Create Supabase project: https://supabase.com
2. Copy API keys to environment
3. Apply migrations via dashboard or CLI
4. Deploy edge functions

### Vercel Deployment

```bash
# Deploy frontend to Vercel
$ vercel deploy

# Set environment variables in Vercel dashboard
# Redeploy to apply env vars
$ vercel deploy --prod
```

### Monitoring

```bash
# Monitor agent execution
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as executions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM agent_outputs
GROUP BY hour
ORDER BY hour DESC;

# Monitor costs
SELECT 
  DATE_TRUNC('day', created_at_run) as day,
  COUNT(*) as runs,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_cost
FROM pipeline_runs
GROUP BY day
ORDER BY day DESC;
```

## API Reference

### POST /functions/v1/pipeline-orchestrator

Start a new pipeline execution.

**Request:**

```json
{
  "topic": "Pakistan fintech boom",
  "input_type": "topic",
  "brand_voice": "professional",
  "language": "en",
  "enabled_agents": {
    "scout-01": true,
    "intelligence-02": true,
    "trend-forecaster-03": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "run_id": "uuid-here",
  "topic": "Pakistan fintech boom",
  "phase_results": {
    "discover": {"completed": 3, "failed": 0, "skipped": 4},
    "analyze": {"completed": 2, "failed": 0, "skipped": 5}
  },
  "message": "Pipeline executed successfully"
}
```

## Next Steps

1. **Implement remaining agents** (Phase 2-7 full implementations)
2. **Add real Gemini integration** (currently using guardedGemini)
3. **Create agent edge functions** (one per agent, ~50 functions)
4. **Add result processing** (convert agent outputs to publishable content)
5. **Integrate with WordPress** (auto-publish articles)
6. **Add analytics dashboard** (track performance across 50 agents)
7. **Scale to multiple publishers** (multi-tenant support)

## Support

For issues or questions:
1. Check PHASE_0_FOUNDATION.md
2. Review PHASE_0_SUMMARY.md
3. Check edge function logs
4. Query database directly for debugging
5. Test with curl before debugging frontend
