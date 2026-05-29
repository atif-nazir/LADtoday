// ============================================================
// LADtoday Pipeline Orchestrator — 10-Agent Architecture
// Web Data UNLOCKED Hackathon | Bright Data + Supabase
// ============================================================
// Actions:
//   { action: "start", topic, mode?, brand_voice?, language?, input_type?, input_payload? }
//   { action: "step",  run_id }
//   { action: "cancel", run_id }
//   { action: "status", run_id }
//   { action: "approve", run_id }
//   { action: "reject", run_id, reason? }
//   { action: "toggle_agent", agent_key, enabled: bool }
//   { action: "list_agents" }
//   { action: "dag" }
//   { cron: true }  — tick all active runs
// ============================================================

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

// ─── 10-Agent DAG ─────────────────────────────────────────────────────────────
// Simplified from 50 agents → 10 core agents for hackathon
// Each key maps to a Supabase Edge Function folder name
const AGENT_DAG: { key: string; fn: string; deps: string[]; phase: string; group: number; label: string; tool: string }[] = [
  // PHASE 1: DISCOVER
  { key: "scout",        fn: "scout",        deps: [],                                    phase: "DISCOVER",  group: 1, label: "Scout Agent",       tool: "Bright Data SERP + Web Unlocker" },
  { key: "intelligence", fn: "intelligence", deps: ["scout"],                             phase: "DISCOVER",  group: 2, label: "Intelligence Agent", tool: "AI/ML API GPT-4o + Cognee" },
  // PHASE 2: CREATE
  { key: "rewrite",      fn: "rewrite",      deps: ["intelligence"],                      phase: "CREATE",    group: 3, label: "Rewrite Agent",      tool: "Gemini 2.0 Flash" },
  { key: "seo",          fn: "seo",          deps: ["rewrite"],                           phase: "CREATE",    group: 4, label: "SEO Agent",           tool: "Bright Data SERP API" },
  { key: "vision",       fn: "vision",       deps: ["rewrite"],                           phase: "CREATE",    group: 4, label: "Vision Agent",        tool: "Gemini Flash" },
  { key: "creative",     fn: "creative",     deps: ["rewrite", "seo"],                    phase: "CREATE",    group: 5, label: "Creative Agent",      tool: "Gemini Pro" },
  // PHASE 3: REVIEW & PUBLISH
  { key: "guardian",     fn: "guardian",     deps: ["creative"],                          phase: "REVIEW",    group: 6, label: "Guardian Agent",      tool: "Bright Data + Lobster Trap" },
  { key: "publish",      fn: "publish",      deps: ["guardian"],                          phase: "PUBLISH",   group: 7, label: "Publish Agent",       tool: "TriggerWare.ai + WordPress" },
  // PHASE 4: OPERATE
  { key: "analytics",    fn: "analytics",    deps: ["publish"],                           phase: "OPERATE",   group: 8, label: "Analytics Agent",     tool: "Cognee Memory" },
  { key: "account-manager", fn: "account-manager", deps: ["analytics"],                  phase: "OPERATE",   group: 9, label: "Account Manager",     tool: "Bright Data Web Scraper API" },
];

// Progress mapping for live dashboard
const PHASE_PROGRESS: Record<string, number> = {
  "DISCOVER": 15,
  "CREATE": 50,
  "REVIEW": 75,
  "PUBLISH": 88,
  "OPERATE": 97,
};

const AGENT_PROGRESS: Record<string, number> = {
  "scout": 10,
  "intelligence": 25,
  "rewrite": 40,
  "seo": 52,
  "vision": 55,
  "creative": 68,
  "guardian": 80,
  "publish": 90,
  "analytics": 95,
  "account-manager": 100,
};

// ─── Load admin disabled-agents list ─────────────────────────────────────────

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

// ─── Broadcast pipeline status via Supabase Realtime ─────────────────────────

async function broadcastStatus(runId: string, agentKey: string, progress: number, message: string) {
  try {
    await supabase.from("pipeline_runs").update({
      current_phase: agentKey,
      pipeline_progress: progress,
      pipeline_message: message,
    }).eq("id", runId);
  } catch { /* non-fatal */ }
}

// ─── Run waves (advance pipeline) ────────────────────────────────────────────

async function runWave(runId: string) {
  const disabledSet = await loadDisabledAgents();
  const MAX_WAVES = 15;

  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const run = await loadRun(runId);
    if (run.status === "cancelled") return;

    // Build a synthetic registry from our DAG for the pipeline helpers
    const syntheticRegistry = AGENT_DAG.map(a => ({
      key: a.key,
      name: a.label,
      phase: a.phase,
      order_index: a.group,
      depends_on: a.deps,
      model: "gemini-2.5-flash",
      enabled: isAgentEnabled(a.key, disabledSet, run.enabled_agents),
    }));

    const filteredRegistry = syntheticRegistry.filter(a => a.enabled);
    const terminal = isTerminal({ ...run, enabled_agents: null } as any, filteredRegistry);

    if (terminal.done) {
      const finalStatus = terminal.failed ? "failed" : "completed";
      await updateRun(runId, {
        status: finalStatus,
        finished_at: new Date().toISOString(),
        pipeline_progress: terminal.failed ? undefined : 100,
        pipeline_message: terminal.failed ? "Pipeline failed" : "✅ Pipeline complete — article published",
      });
      await insertLog("ai", "pipeline-orchestrator", `Pipeline ${finalStatus}`, `run_id=${runId}`);
      return;
    }

    const states = run.agent_states || {};
    const ready = nextRunnableAgents({ ...run, enabled_agents: null } as any, filteredRegistry);

    if (ready.length === 0) {
      const hasRunning = Object.values(states).some((s: any) => s.status === "running");
      if (hasRunning) return;
      await updateRun(runId, { status: "failed", error: "Pipeline deadlock", finished_at: new Date().toISOString() });
      return;
    }

    // Mark all ready agents as running
    for (const a of ready) {
      states[a.key] = { status: "running", started_at: new Date().toISOString() };
    }

    const firstAgent = AGENT_DAG.find(a => a.key === ready[0].key);
    const progress = AGENT_PROGRESS[ready[0].key] ?? 50;
    const message = firstAgent
      ? `${firstAgent.label} running... (${firstAgent.tool})`
      : `Running ${ready[0].key}...`;

    await updateRun(runId, {
      status: "running",
      current_phase: ready[0].phase,
      agent_states: states,
      pipeline_progress: progress,
      pipeline_message: message,
    });

    const modelOverrides = (run as any).model_overrides || {};

    await Promise.allSettled(ready.map(async (a) => {
      try {
        await invokeAgent(a.key, runId, modelOverrides);
        await patchAgentState(runId, a.key, { status: "completed", finished_at: new Date().toISOString() });
      } catch (err) {
        console.error(`Agent ${a.key} failed:`, err);
        await patchAgentState(runId, a.key, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }));

    await new Promise((r) => setTimeout(r, 200));
  }
}

// ─── Cron tick ────────────────────────────────────────────────────────────────

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
          ? { status: "pending", phase: a.phase, group: a.group, label: a.label, tool: a.tool }
          : { status: "skipped", reason: "disabled_by_admin" };
      }

      const { data, error } = await supabase.from("pipeline_runs").insert({
        user_id: auth.userId === "service" ? null : auth.userId,
        topic,
        input_type: body.input_type || "topic",
        input_payload: body.input_payload || {},
        brand_voice: body.brand_voice || "professional",
        language: body.language || "english",
        enabled_agents: body.enabled_agents || null,
        mode: body.mode || "gtm",
        model_overrides: body.model_overrides || {},
        status: "pending",
        current_phase: "DISCOVER",
        pipeline_progress: 0,
        pipeline_message: "🚀 Initializing 10-agent pipeline...",
        agent_states: agentStates,
        total_agents: AGENT_DAG.length,
        started_at: new Date().toISOString(),
      }).select("id").single();

      if (error) throw new Error(error.message);

      const runId = data!.id as string;
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(runWave(runId));
      else runWave(runId).catch((e) => console.error("runWave error:", e));

      await insertLog("ai", "pipeline-orchestrator", "10-agent pipeline started", `run_id=${runId}, topic="${topic.slice(0, 60)}", mode=${body.mode || "gtm"}`);

      return json({
        ok: true,
        run_id: runId,
        topic,
        agents_enabled: Object.values(agentStates).filter((s: any) => s.status === "pending").length,
        pipeline: "10-agent",
        tracks: ["gtm", "finance", "security"],
      });
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

    // ── Approve ──
    if (action === "approve") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      await patchAgentState(runId, "guardian", { status: "completed", decision: "approved", approved_by: auth.userId, finished_at: new Date().toISOString() });
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
      await patchAgentState(runId, "guardian", { status: "failed", decision: "rejected", rejected_by: auth.userId, reason: body.reason || "Rejected by admin", finished_at: new Date().toISOString() });
      await updateRun(runId, { status: "cancelled", cancel_reason: body.reason || "Content rejected by admin", finished_at: new Date().toISOString() });
      return json({ ok: true, rejected: true });
    }

    // ── Toggle agent ──
    if (action === "toggle_agent") {
      const { agent_key, enabled } = body;
      if (!agent_key) return json({ error: "agent_key required" }, 400);
      const disabledSet = await loadDisabledAgents();
      if (enabled === false) disabledSet.add(agent_key); else disabledSet.delete(agent_key);
      await supabase.from("site_settings").upsert({ key: "disabled_agents", value: JSON.stringify([...disabledSet]) }, { onConflict: "key" });
      await insertLog("ai", "pipeline-orchestrator", `Agent ${enabled ? "enabled" : "disabled"}`, agent_key);
      return json({ ok: true, agent_key, enabled: !disabledSet.has(agent_key), total_disabled: disabledSet.size });
    }

    // ── List agents ──
    if (action === "list_agents") {
      const disabledSet = await loadDisabledAgents();
      const agents = AGENT_DAG.map(a => ({
        key: a.key, phase: a.phase, group: a.group, type: "pipeline",
        deps: a.deps, label: a.label, tool: a.tool,
        enabled: !disabledSet.has(a.key),
      }));
      return json({ ok: true, agents, total: agents.length, disabled: disabledSet.size });
    }

    // ── Status ──
    if (action === "status") {
      const runId = String(body.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      const { data: run } = await supabase.from("pipeline_runs").select("*").eq("id", runId).single();
      if (!run) return json({ error: "Run not found" }, 404);
      const states = run.agent_states || {};
      const completed = Object.values(states).filter((s: any) => s.status === "completed").length;
      const failed = Object.values(states).filter((s: any) => s.status === "failed").length;
      const running = Object.values(states).filter((s: any) => s.status === "running").length;
      const pending = Object.values(states).filter((s: any) => s.status === "pending").length;
      return json({
        ok: true, run_id: run.id, topic: run.topic, status: run.status,
        current_phase: run.current_phase, mode: run.mode,
        pipeline_progress: (run as any).pipeline_progress || 0,
        pipeline_message: (run as any).pipeline_message || "",
        agents: { completed, failed, running, pending, total: AGENT_DAG.length },
        created_at: run.created_at, started_at: (run as any).started_at,
      });
    }

    // ── DAG ──
    if (action === "dag") {
      const disabledSet = await loadDisabledAgents();
      return json({
        ok: true,
        dag: AGENT_DAG.map(a => ({ ...a, enabled: !disabledSet.has(a.key) })),
        total: AGENT_DAG.length,
        architecture: "10-agent-hackathon",
        tracks: ["gtm", "finance", "security"],
      });
    }

    return json({ error: "unknown action. Use: start, step, cancel, approve, reject, toggle_agent, list_agents, status, dag, or cron:true" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
