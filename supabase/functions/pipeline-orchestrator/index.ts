// Pipeline orchestrator — admin-only, controls all 50 agents.
// Actions:
//   { action: "start", topic, mode?, brand_voice?, language?, enabled_agents? }
//   { action: "step",  run_id }
//   { action: "cancel", run_id }
//   { action: "status", run_id }
//   { action: "approve", run_id }
//   { action: "reject", run_id, reason? }
//   { action: "toggle_agent", agent_key, enabled: bool }
//   { action: "list_agents" }
//   { action: "dag" }
//   { cron: true }  — tick all active runs
//
// Architecture: Each agent is a standalone Supabase Edge Function.
// The orchestrator invokes them via HTTP (invokeAgent from pipeline.ts).
// No inline agent executors — every agent runs as its own isolated function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isTerminal, loadRegistry, loadRun, nextRunnableAgents,
  updateRun, patchAgentState, writeAgentOutput, invokeAgent,
} from "../_shared/pipeline.ts";
import { insertLog } from "../_shared/logger.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (d: any, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ─── Full 50-Agent DAG ────────────────────────────────────────────────────────
// Keys here MUST match agent_registry keys AND the SHORT_TO_FN mapping in pipeline.ts.
const AGENT_DAG: { key: string; fn: string; deps: string[]; phase: string; group: number }[] = [
  // DISCOVER (01-07)
  { key: "scout-01", fn: "agent-scout-01", deps: [], phase: "DISCOVER", group: 1 },
  { key: "intelligence-02", fn: "agent-intelligence-02", deps: ["scout-01"], phase: "DISCOVER", group: 2 },
  { key: "trend-forecaster-03", fn: "agent-trend-forecaster-03", deps: ["scout-01"], phase: "DISCOVER", group: 2 },
  { key: "competitor-intel-04", fn: "agent-competitor-intel-04", deps: ["scout-01"], phase: "DISCOVER", group: 2 },
  { key: "audience-listener-05", fn: "agent-audience-listener-05", deps: ["scout-01"], phase: "DISCOVER", group: 2 },
  { key: "news-wire-06", fn: "agent-news-wire-06", deps: ["scout-01"], phase: "DISCOVER", group: 2 },
  { key: "research-07", fn: "agent-research-07", deps: ["intelligence-02"], phase: "DISCOVER", group: 3 },
  // ANALYZE (08-14)
  { key: "fact-checker-08", fn: "agent-fact-checker-08", deps: ["research-07"], phase: "ANALYZE", group: 4 },
  { key: "bias-detector-09", fn: "agent-bias-detector-09", deps: ["research-07"], phase: "ANALYZE", group: 4 },
  { key: "story-arc-10", fn: "agent-story-arc-10", deps: ["research-07"], phase: "ANALYZE", group: 4 },
  { key: "quote-extractor-11", fn: "agent-quote-extractor-11", deps: ["research-07"], phase: "ANALYZE", group: 4 },
  { key: "tone-calibrator-12", fn: "agent-tone-calibrator-12", deps: ["audience-listener-05"], phase: "ANALYZE", group: 4 },
  { key: "localization-13", fn: "agent-localization-13", deps: ["tone-calibrator-12"], phase: "ANALYZE", group: 5 },
  { key: "headline-optimizer-14", fn: "agent-headline-optimizer-14", deps: ["story-arc-10", "tone-calibrator-12"], phase: "ANALYZE", group: 5 },
  // CREATE (15-21)
  { key: "rewrite-15", fn: "agent-rewrite-15", deps: ["fact-checker-08", "story-arc-10", "headline-optimizer-14"], phase: "CREATE", group: 6 },
  { key: "vision-16", fn: "agent-vision-16", deps: ["rewrite-15"], phase: "CREATE", group: 7 },
  { key: "seo-17", fn: "agent-seo-17", deps: ["rewrite-15"], phase: "CREATE", group: 7 },
  { key: "readability-18", fn: "agent-readability-18", deps: ["rewrite-15"], phase: "CREATE", group: 7 },
  { key: "internal-linker-19", fn: "agent-internal-linker-19", deps: ["rewrite-15"], phase: "CREATE", group: 7 },
  { key: "schema-markup-20", fn: "agent-schema-markup-20", deps: ["seo-17"], phase: "CREATE", group: 8 },
  { key: "content-assembler-21", fn: "agent-content-assembler-21", deps: ["rewrite-15", "vision-16", "seo-17", "readability-18", "internal-linker-19", "schema-markup-20"], phase: "CREATE", group: 9 },
  // REVIEW (22-28)
  { key: "quality-gate-22", fn: "agent-quality-gate-22", deps: ["content-assembler-21"], phase: "REVIEW", group: 10 },
  { key: "plagiarism-23", fn: "agent-plagiarism-23", deps: ["content-assembler-21"], phase: "REVIEW", group: 10 },
  { key: "legal-24", fn: "agent-legal-24", deps: ["content-assembler-21"], phase: "REVIEW", group: 10 },
  { key: "brand-safety-25", fn: "agent-brand-safety-25", deps: ["content-assembler-21"], phase: "REVIEW", group: 10 },
  { key: "editor-26", fn: "agent-editor-26", deps: ["quality-gate-22", "plagiarism-23", "legal-24", "brand-safety-25"], phase: "REVIEW", group: 11 },
  { key: "publish-timing-27", fn: "agent-publish-timing-27", deps: ["editor-26"], phase: "REVIEW", group: 12 },
  { key: "human-approval-28", fn: "agent-human-approval-28", deps: ["editor-26", "publish-timing-27"], phase: "REVIEW", group: 13 },
  // PUBLISH (29-35)
  { key: "site-publisher-29", fn: "agent-site-publisher-29", deps: ["human-approval-28"], phase: "PUBLISH", group: 14 },
  { key: "image-publisher-30", fn: "agent-image-publisher-30", deps: ["site-publisher-29"], phase: "PUBLISH", group: 15 },
  { key: "social-scheduler-31", fn: "agent-social-scheduler-31", deps: ["site-publisher-29", "image-publisher-30"], phase: "PUBLISH", group: 15 },
  { key: "newsletter-32", fn: "agent-newsletter-32", deps: ["site-publisher-29", "image-publisher-30"], phase: "PUBLISH", group: 15 },
  { key: "whatsapp-broadcaster-33", fn: "agent-whatsapp-broadcaster-33", deps: ["site-publisher-29"], phase: "PUBLISH", group: 15 },
  { key: "rss-generator-34", fn: "agent-rss-generator-34", deps: ["site-publisher-29"], phase: "PUBLISH", group: 15 },
  { key: "syndication-35", fn: "agent-syndication-35", deps: ["site-publisher-29", "rss-generator-34"], phase: "PUBLISH", group: 16 },
  // DISTRIBUTE (36-40)
  { key: "analytics-tracker-36", fn: "agent-analytics-tracker-36", deps: ["syndication-35"], phase: "DISTRIBUTE", group: 17 },
  { key: "ab-test-37", fn: "agent-ab-test-37", deps: ["analytics-tracker-36"], phase: "DISTRIBUTE", group: 18 },
  { key: "engagement-monitor-38", fn: "agent-engagement-monitor-38", deps: ["analytics-tracker-36", "ab-test-37"], phase: "DISTRIBUTE", group: 18 },
  { key: "performance-predictor-39", fn: "agent-performance-predictor-39", deps: ["engagement-monitor-38"], phase: "DISTRIBUTE", group: 19 },
  { key: "influencer-radar-40", fn: "agent-influencer-radar-40", deps: ["analytics-tracker-36"], phase: "DISTRIBUTE", group: 18 },
  { key: "content-calendar-41", fn: "agent-content-calendar-41", deps: ["syndication-35"], phase: "DISTRIBUTE", group: 17 },
  { key: "revenue-intel-42", fn: "agent-revenue-intel-42", deps: ["performance-predictor-39"], phase: "DISTRIBUTE", group: 20 },
  { key: "hashtag-strategy-43", fn: "agent-hashtag-strategy-43", deps: ["social-scheduler-31"], phase: "DISTRIBUTE", group: 15 },
];

// Independent ops agents (run on own cron, not in pipeline DAG)
const OPS_AGENTS = [
  { key: "pipeline-monitor-44", fn: "agent-pipeline-monitor-44", cron: "*/5 * * * *" },
  { key: "content-refresh-45", fn: "agent-content-refresh-45", cron: "0 2 * * 0" },
  { key: "health-check-46", fn: "agent-health-check-46", cron: "*/10 * * * *" },
  { key: "cost-reporting-47", fn: "agent-cost-reporting-47", cron: "0 0 * * *" },
  { key: "backup-48", fn: "agent-backup-48", cron: "0 1 * * *" },
  { key: "cleanup-49", fn: "agent-cleanup-49", cron: "0 3 * * *" },
  { key: "orchestrator-master-50", fn: "agent-orchestrator-master-50", cron: "*/2 * * * *" },
];

// ─── Load admin disabled-agents list from site_settings ───────────────────────

async function loadDisabledAgents(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "disabled_agents").maybeSingle();
    if (data?.value) return new Set(JSON.parse(data.value));
  } catch { /* non-fatal */ }
  return new Set();
}

function isAgentEnabled(key: string, disabledSet: Set<string>, runEnabledList: string[] | null): boolean {
  if (disabledSet.has(key)) return false;
  if (runEnabledList && !runEnabledList.includes(key)) return false;
  return true;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { userId: "service" };
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user?.id) return json({ error: "Unauthorized" }, 401);
  const { data: role } = await supabase.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!role) return json({ error: "Forbidden" }, 403);
  return { userId: user.id };
}

// ─── Run waves (advance pipeline) ────────────────────────────────────────────
// Always invokes agents via HTTP to their standalone edge functions.
// No inline executors — each agent runs in its own isolated Deno runtime.

async function runWave(runId: string) {
  const runData = await loadRun(runId) as any;
  const disabledSet = await loadDisabledAgents();
  const MAX_WAVES = 20;

  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const registry = await loadRegistry();
    const run = await loadRun(runId);
    if (run.status === "cancelled") return;

    // Skip disabled agents in registry
    const filteredRegistry = registry.filter(a => isAgentEnabled(a.key, disabledSet, run.enabled_agents));

    const terminal = isTerminal({ ...run, enabled_agents: null } as any, filteredRegistry);
    if (terminal.done) {
      await updateRun(runId, { status: terminal.failed ? "failed" : "completed", finished_at: new Date().toISOString() });
      await insertLog("ai", "pipeline-orchestrator", `Pipeline ${terminal.failed ? "failed" : "completed"}`, `run_id=${runId}`);
      return;
    }

    // Check for approval gate
    const states = run.agent_states || {};
    if (states["human-approval-28"]?.status === "awaiting_approval") return; // Pause until admin approves

    const ready = nextRunnableAgents({ ...run, enabled_agents: null } as any, filteredRegistry);
    if (ready.length === 0) {
      // Check if we're waiting on approval or truly deadlocked
      const hasRunning = Object.values(states).some((s: any) => s.status === "running");
      if (hasRunning) return; // Still running, wait for next tick
      await updateRun(runId, { status: "failed", error: "Pipeline deadlock", finished_at: new Date().toISOString() });
      return;
    }

    for (const a of ready) { states[a.key] = { status: "running", started_at: new Date().toISOString() }; }
    await updateRun(runId, { status: "running", current_phase: ready[0].phase, agent_states: states });

    const modelOverrides = run.model_overrides || {};
    await Promise.allSettled(ready.map(async (a) => {
      try {
        // Always invoke the standalone edge function via HTTP
        await invokeAgent(a.key, runId, modelOverrides);
        await patchAgentState(runId, a.key, { status: "completed", finished_at: new Date().toISOString() });
      } catch (err) {
        console.error(`Agent ${a.key} failed:`, err);
        await patchAgentState(runId, a.key, { status: "failed", finished_at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
      }
    }));
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ─── Cron tick: advance ALL active runs ───────────────────────────────────────

async function cronTick(): Promise<{ ticked: number; completed: number }> {
  const { data: runs } = await supabase.from("pipeline_runs").select("id").eq("status", "running").limit(10);
  let ticked = 0, completed = 0;
  for (const run of runs || []) {
    try { await runWave(run.id); ticked++; } catch (err) { console.error(`Cron tick error for ${run.id}:`, err); }
    const { data: check } = await supabase.from("pipeline_runs").select("status").eq("id", run.id).single();
    if (check?.status === "completed" || check?.status === "failed") completed++;
  }
  return { ticked, completed };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body?.action || (body?.cron ? "cron" : "start");

  try {
    // ── Cron tick ──
    if (action === "cron" || body?.cron === true) {
      const r = await cronTick();
      return json({ ok: true, mode: "cron", ...r });
    }

    // ── Start new pipeline ──
    if (action === "start") {
      const topic = String(body.topic || "").trim();
      if (!topic) return json({ error: "topic required" }, 400);

      const disabledSet = await loadDisabledAgents();
      const agentStates: Record<string, any> = {};
      for (const a of AGENT_DAG) {
        agentStates[a.key] = isAgentEnabled(a.key, disabledSet, body.enabled_agents || null)
          ? { status: "pending", phase: a.phase, group: a.group }
          : { status: "skipped", reason: "disabled_by_admin" };
      }
      for (const a of OPS_AGENTS) { agentStates[a.key] = { status: "independent", cron: a.cron }; }

      const { data, error } = await supabase.from("pipeline_runs").insert({
        user_id: auth.userId === "service" ? null : auth.userId,
        topic, input_type: body.input_type || "topic", input_payload: body.input_payload || {},
        brand_voice: body.brand_voice || "professional", language: body.language || "english",
        enabled_agents: body.enabled_agents || null, mode: body.mode || "semi_auto",
        model_overrides: body.model_overrides || {},
        status: "pending", current_phase: "DISCOVER", agent_states: agentStates,
        total_agents: AGENT_DAG.length, started_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw new Error(error.message);

      const runId = data!.id as string;
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(runWave(runId));
      else runWave(runId).catch((e) => console.error("runWave error:", e));
      await insertLog("ai", "pipeline-orchestrator", "Pipeline started", `run_id=${runId}, topic="${topic.slice(0, 60)}"`);
      return json({ ok: true, run_id: runId, topic, agents_enabled: Object.values(agentStates).filter((s: any) => s.status === "pending").length });
    }

    // ── Step (manual tick) ──
    if (action === "step") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(runWave(runId));
      else runWave(runId).catch((e) => console.error("runWave error:", e));
      return json({ ok: true });
    }

    // ── Cancel ──
    if (action === "cancel") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      await updateRun(runId, { status: "cancelled", finished_at: new Date().toISOString(), cancel_reason: body.reason || "Admin cancelled" });
      return json({ ok: true });
    }

    // ── Approve (human-approval-28 gate) ──
    if (action === "approve") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      await patchAgentState(runId, "human-approval-28", { status: "completed", decision: "approved", approved_by: auth.userId, finished_at: new Date().toISOString() });
      await updateRun(runId, { status: "running" });
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(runWave(runId));
      else runWave(runId).catch((e) => console.error("runWave error:", e));
      return json({ ok: true, approved: true });
    }

    // ── Reject ──
    if (action === "reject") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      await patchAgentState(runId, "human-approval-28", { status: "failed", decision: "rejected", rejected_by: auth.userId, reason: body.reason || "Rejected by admin", finished_at: new Date().toISOString() });
      await updateRun(runId, { status: "cancelled", cancel_reason: body.reason || "Content rejected by admin", finished_at: new Date().toISOString() });
      return json({ ok: true, rejected: true });
    }

    // ── Toggle agent on/off (admin turns agents on/off globally) ──
    if (action === "toggle_agent") {
      const { agent_key, enabled } = body;
      if (!agent_key) return json({ error: "agent_key required" }, 400);
      const disabledSet = await loadDisabledAgents();
      if (enabled === false) disabledSet.add(agent_key); else disabledSet.delete(agent_key);
      await supabase.from("site_settings").upsert({ key: "disabled_agents", value: JSON.stringify([...disabledSet]) }, { onConflict: "key" });
      await insertLog("ai", "pipeline-orchestrator", `Agent ${enabled ? "enabled" : "disabled"}`, agent_key);
      return json({ ok: true, agent_key, enabled: !disabledSet.has(agent_key), total_disabled: disabledSet.size });
    }

    // ── List all agents with on/off status ──
    if (action === "list_agents") {
      const disabledSet = await loadDisabledAgents();
      const agents = [
        ...AGENT_DAG.map(a => ({ key: a.key, phase: a.phase, group: a.group, type: "pipeline", deps: a.deps, enabled: !disabledSet.has(a.key) })),
        ...OPS_AGENTS.map(a => ({ key: a.key, phase: "OPERATIONS", type: "independent", cron: a.cron, enabled: !disabledSet.has(a.key) })),
      ];
      return json({ ok: true, agents, total: agents.length, disabled: disabledSet.size });
    }

    // ── Pipeline status ──
    if (action === "status") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      const { data: run } = await supabase.from("pipeline_runs").select("*").eq("id", runId).single();
      if (!run) return json({ error: "Run not found" }, 404);
      const states = run.agent_states || {};
      const completed = Object.values(states).filter((s: any) => s.status === "completed").length;
      const failed = Object.values(states).filter((s: any) => s.status === "failed").length;
      const running = Object.values(states).filter((s: any) => s.status === "running").length;
      const skipped = Object.values(states).filter((s: any) => s.status === "skipped").length;
      const pending = Object.values(states).filter((s: any) => s.status === "pending").length;
      const awaiting = Object.values(states).filter((s: any) => s.status === "awaiting_approval").length;
      return json({ ok: true, run_id: run.id, topic: run.topic, status: run.status, current_phase: run.current_phase, mode: run.mode, agents: { completed, failed, running, skipped, pending, awaiting_approval: awaiting, total: AGENT_DAG.length }, created_at: run.created_at, started_at: run.started_at, completed_at: run.completed_at });
    }

    // ── DAG definition (for admin dashboard visualization) ──
    if (action === "dag") {
      const disabledSet = await loadDisabledAgents();
      return json({ ok: true, dag: AGENT_DAG.map(a => ({ ...a, enabled: !disabledSet.has(a.key) })), ops: OPS_AGENTS.map(a => ({ ...a, enabled: !disabledSet.has(a.key) })), total: 50 });
    }

    return json({ error: "unknown action. Use: start, step, cancel, approve, reject, toggle_agent, list_agents, status, dag, or cron:true" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
