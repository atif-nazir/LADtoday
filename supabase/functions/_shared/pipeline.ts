// Pipeline orchestration helpers shared across agent edge functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export { supabase };

export interface AgentRow {
  key: string;
  name: string;
  phase: string;
  order_index: number;
  depends_on: string[];
  model: string;
  enabled: boolean;
}

export interface RunRow {
  id: string;
  topic: string;
  input_type: string;
  input_payload: any;
  brand_voice: string;
  language: string;
  status: string;
  enabled_agents: string[] | null;
  agent_states: Record<string, any>;
  pipeline_progress?: number;
  pipeline_message?: string;
  model_overrides?: Record<string, string>;
}

export async function loadRegistry(): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("agent_registry")
    .select("*")
    .order("order_index");
  if (error) throw new Error(`loadRegistry: ${error.message}`);
  return (data || []) as AgentRow[];
}

export async function loadRun(runId: string): Promise<RunRow> {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error) throw new Error(`loadRun: ${error.message}`);
  return data as RunRow;
}

export async function updateRun(runId: string, patch: Record<string, any>) {
  const { error } = await supabase
    .from("pipeline_runs")
    .update(patch)
    .eq("id", runId);
  if (error) throw new Error(`updateRun: ${error.message}`);
}

export async function patchAgentState(
  runId: string,
  agentKey: string,
  patch: Record<string, any>
) {
  // Optimistic merge by re-reading agent_states.
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("agent_states")
    .eq("id", runId)
    .single();
  if (error) throw new Error(`patchAgentState read: ${error.message}`);
  const states = (data?.agent_states as Record<string, any>) || {};
  states[agentKey] = { ...(states[agentKey] || {}), ...patch };
  const { error: upErr } = await supabase
    .from("pipeline_runs")
    .update({ agent_states: states })
    .eq("id", runId);
  if (upErr) throw new Error(`patchAgentState write: ${upErr.message}`);
}

/**
 * Write agent output to agent_outputs table.
 * Overloaded to accept (runId, agentKey, output, meta?) directly.
 */
export async function writeAgentOutput(
  runId: string,
  agentKey: string,
  output: any,
  meta?: { tokens?: number; duration_ms?: number; status?: string; error?: string }
) {
  const { error } = await supabase
    .from("agent_outputs")
    .upsert({
      run_id: runId,
      agent_key: agentKey,
      output,
      status: meta?.status || "completed",
      tokens: meta?.tokens || 0,
      duration_ms: meta?.duration_ms || null,
      error: meta?.error || null,
    }, { onConflict: "run_id,agent_key" });
  if (error) throw new Error(`writeAgentOutput: ${error.message}`);
}

/**
 * Read agent output from agent_outputs table.
 */
export async function readAgentOutput(runId: string, agentKey: string): Promise<any> {
  const { data, error } = await supabase
    .from("agent_outputs")
    .select("output, status")
    .eq("run_id", runId)
    .eq("agent_key", agentKey)
    .maybeSingle();
  if (error) throw new Error(`readAgentOutput: ${error.message}`);
  return data?.output || null;
}

/**
 * Decide which agents are ready to run given current state.
 * An agent is runnable when:
 *  - it is enabled in the registry (and in run.enabled_agents if set)
 *  - it has no state yet (status missing or "pending")
 *  - all its deps have agent_states[dep].status === "completed"
 *    (deps that are disabled are considered satisfied — skipped)
 */
export function nextRunnableAgents(run: RunRow, registry: AgentRow[]): AgentRow[] {
  const states = run.agent_states || {};
  const allowSet = run.enabled_agents
    ? new Set(run.enabled_agents)
    : null;
  const enabledMap = new Map<string, boolean>();
  for (const a of registry) {
    const enabled = a.enabled && (allowSet ? allowSet.has(a.key) : true);
    enabledMap.set(a.key, enabled);
  }

  const ready: AgentRow[] = [];
  for (const a of registry) {
    if (!enabledMap.get(a.key)) continue;
    const st = states[a.key]?.status;
    if (st === "running" || st === "completed" || st === "failed") continue;
    const depsOk = a.depends_on.every((dep) => {
      if (!enabledMap.get(dep)) return true; // disabled deps don't block
      return states[dep]?.status === "completed";
    });
    if (depsOk) ready.push(a);
  }
  return ready;
}

export function isTerminal(run: RunRow, registry: AgentRow[]): { done: boolean; failed: boolean } {
  const states = run.agent_states || {};
  const allowSet = run.enabled_agents ? new Set(run.enabled_agents) : null;
  let anyFailed = false;
  let allDone = true;
  for (const a of registry) {
    const enabled = a.enabled && (allowSet ? allowSet.has(a.key) : true);
    if (!enabled) continue;
    const st = states[a.key]?.status;
    if (st === "failed") anyFailed = true;
    if (st !== "completed" && st !== "failed") allDone = false;
  }
  return { done: allDone, failed: anyFailed };
}

/// Map DAG keys to actual edge function directory names (simplified folder names).
const SHORT_TO_FN: Record<string, string> = {
  // ── 10-Agent Hackathon Pipeline (primary) ──
  "scout": "scout",
  "intelligence": "intelligence",
  "rewrite": "rewrite",
  "seo": "seo",
  "vision": "vision",
  "creative": "creative",
  "guardian": "guardian",
  "publish": "publish",
  "analytics": "analytics",
  "account-manager": "account-manager",
  // ── Legacy 50-agent keys (kept for backward compat) ──
  "trend-forecaster": "trend-forecaster", "competitor-intel": "competitor-intel",
  "audience-listener": "audience-listener", "news-wire": "news-wire",
  "research": "research",
  "fact-checker": "fact-checker", "bias-detector": "bias-detector",
  "story-arc": "story-arc", "quote-extractor": "quote-extractor",
  "tone-calibrator": "tone-calibrator", "localization": "localization",
  "headline-optimizer": "headline-optimizer",
  "readability": "readability", "internal-linker": "internal-linker",
  "schema-markup": "schema-markup", "excerpt": "excerpt",
  "creative": "creative", "infographic": "infographic",
  "podcast-script": "podcast-script", "video-script": "video-script",
  "short-form": "short-form", "thread": "thread", "carousel": "carousel",
  "newsletter": "newsletter", "whatsapp-broadcast": "whatsapp-broadcast",
  "data-viz": "data-viz",
  "timing-intelligence": "timing-intelligence",
  "hashtag-strategy": "hashtag-strategy", "cross-platform": "cross-platform",
  "community": "community", "influencer-radar": "influencer-radar",
  "performance-predictor": "performance-predictor", "syndication": "syndication",
  "adsense-optimizer": "adsense-optimizer", "affiliate-detector": "affiliate-detector",
  "lead-magnet": "lead-magnet", "content-calendar": "content-calendar",
  "revenue-intelligence": "revenue-intelligence",
  "content-refresh": "content-refresh", "brand-safety": "brand-safety",
  "knowledge-base": "knowledge-base",
};

export async function invokeAgent(agentKey: string, runId: string, modelOverrides?: Record<string, string>) {
  // Resolve function name: check short-key map first, then try direct format
  let fnName = SHORT_TO_FN[agentKey];
  if (!fnName) {
    // If key already has a number suffix like "scout-01", build name directly
    fnName = agentKey.startsWith("agent-") ? agentKey : `agent-${agentKey.replaceAll("_", "-")}`;
  }
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`;
  const body: any = { run_id: runId };
  if (modelOverrides) {
    body.model_override = modelOverrides;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`invokeAgent ${fnName} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return await res.json().catch(() => ({}));
}

