// supabase/functions/ladtoday-orchestrator/index.ts
// LADtoday 10-agent orchestrator.
// Creates pipeline_runs row, then runs 10 agents in sequence (Scout → Account Manager).
// Each agent writes to agent_outputs + updates agent_states in pipeline_runs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const PIPELINE = [
  { key: "scout",          fn: "scout",          phase: "discover" },
  { key: "intelligence",   fn: "intelligence",   phase: "analyze" },
  { key: "rewrite",        fn: "rewrite",        phase: "create" },
  { key: "seo",            fn: "seo",            phase: "create" },
  { key: "vision",         fn: "vision",         phase: "create" },
  { key: "creative",       fn: "creative",       phase: "create" },
  { key: "guardian",       fn: "guardian",       phase: "analyze" },
  { key: "publish",        fn: "publish",        phase: "distribute" },
  { key: "analytics",      fn: "analytics",      phase: "operate" },
  { key: "account_manager",fn: "account-manager",phase: "operate" },
];

interface OrchReq {
  topic: string;
  mode?: "gtm" | "finance" | "security";
  tone?: "professional" | "conversational" | "editorial" | "urgent";
  length?: "short" | "medium" | "long";
  urls?: string[];
  brand_voice?: string;
  language?: string;
}

async function callAgent(fn: string, payload: any) {
  const url = `${SUPABASE_URL}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function patchState(runId: string, agentKey: string, patch: Record<string, any>) {
  const { data } = await supabase
    .from("pipeline_runs")
    .select("agent_states")
    .eq("id", runId)
    .single();
  const states = (data?.agent_states as Record<string, any>) || {};
  states[agentKey] = { ...(states[agentKey] || {}), ...patch, updated_at: new Date().toISOString() };
  await supabase.from("pipeline_runs").update({ agent_states: states, updated_at: new Date().toISOString() }).eq("id", runId);
}

async function writeOutput(runId: string, agentKey: string, output: any, durationMs: number, status = "completed", error?: string) {
  await supabase.from("agent_outputs").upsert({
    run_id: runId,
    agent_key: agentKey,
    output,
    status,
    duration_ms: durationMs,
    error: error || null,
  }, { onConflict: "run_id,agent_key" });
}

async function runPipeline(runId: string, req: OrchReq) {
  const ctx: Record<string, any> = { topic: req.topic, mode: req.mode || "gtm" };

  try {
    // Phase per agent
    for (let i = 0; i < PIPELINE.length; i++) {
      const step = PIPELINE[i];
      const progress = Math.round(((i) / PIPELINE.length) * 100);

      await patchState(runId, step.key, { status: "running" });
      await supabase.from("pipeline_runs").update({
        current_phase: step.phase,
        status: "running",
      }).eq("id", runId);

      const t0 = Date.now();
      let payload: any = {};

      switch (step.key) {
        case "scout":
          payload = { topic: req.topic, urls: req.urls || [], geo: "pk", mode: "serp" };
          break;
        case "intelligence":
          payload = { sources: ctx.scout?.sources || [], topic: req.topic, mode: ctx.mode, recall_memory: true };
          break;
        case "rewrite":
          payload = { brief: ctx.intelligence?.brief || {}, tone: req.tone || "professional", length: req.length || "medium", target_audience: ctx.mode === "finance" ? "financial analysts" : "GTM professionals" };
          break;
        case "seo":
          payload = { article: ctx.rewrite?.article || {}, topic: req.topic };
          break;
        case "vision":
          payload = { article: ctx.rewrite?.article || {}, topic: req.topic };
          break;
        case "creative":
          payload = { article: ctx.rewrite?.article || {}, brief: ctx.intelligence?.brief || {}, seo: ctx.seo || {} };
          break;
        case "guardian":
          payload = {
            article: { ...(ctx.rewrite?.article || {}), ...(ctx.seo || {}), ...(ctx.creative || {}) },
            sources: ctx.scout?.sources || [],
            mode: ctx.mode,
          };
          break;
        case "publish":
          payload = {
            run_id: runId,
            article: {
              topic: req.topic,
              headline: ctx.creative?.headlines?.[0]?.variant || ctx.rewrite?.article?.headline,
              body: ctx.rewrite?.article?.body,
              word_count: ctx.rewrite?.article?.word_count,
              meta_description: ctx.seo?.meta_description,
              meta_title: ctx.seo?.meta_title,
              url_slug: ctx.seo?.url_slug,
              focus_keyword: ctx.seo?.focus_keyword,
              seo_score: ctx.seo?.seo_score,
              social_snippets: ctx.creative?.social_snippets,
              hero_image: ctx.vision?.hero_image,
            },
            sources: ctx.scout?.sources || [],
            platforms: ["lovable", "triggerware"],
            guardian_verdict: ctx.guardian?.final_verdict,
          };
          break;
        case "analytics":
          payload = { run_id: runId, article_id: ctx.publish?.article_id, topic: req.topic, mode: ctx.mode };
          break;
        case "account_manager":
          payload = { topic: req.topic, mode: ctx.mode, run_id: runId };
          break;
      }

      try {
        const out = await callAgent(step.fn, payload);
        ctx[step.key] = out;
        const ms = Date.now() - t0;
        await writeOutput(runId, step.key, out, ms);
        await patchState(runId, step.key, { status: "completed", duration_ms: ms });

        // Guardian short-circuit
        if (step.key === "guardian" && out.final_verdict === "QUARANTINED") {
          await supabase.from("pipeline_runs").update({
            status: "quarantined",
            guardian_verdict: "QUARANTINED",
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          return;
        }
      } catch (err) {
        const ms = Date.now() - t0;
        const msg = err instanceof Error ? err.message : String(err);
        await writeOutput(runId, step.key, { error: msg }, ms, "failed", msg);
        await patchState(runId, step.key, { status: "failed", error: msg, duration_ms: ms });
        // continue; downstream agents may still run with empty input
      }
    }

    await supabase.from("pipeline_runs").update({
      status: "completed",
      guardian_verdict: ctx.guardian?.final_verdict || null,
      published_article_id: ctx.publish?.article_id || null,
      final_article: {
        headline: ctx.creative?.headlines?.[0]?.variant || ctx.rewrite?.article?.headline,
        body: ctx.rewrite?.article?.body,
        meta_title: ctx.seo?.meta_title,
        meta_description: ctx.seo?.meta_description,
        social_snippets: ctx.creative?.social_snippets,
        hero_image: ctx.vision?.hero_image,
      },
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("pipeline_runs").update({
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body: OrchReq = await req.json();
  if (!body.topic) {
    return new Response(JSON.stringify({ error: "topic required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Initial agent_states
  const states: Record<string, any> = {};
  for (const s of PIPELINE) states[s.key] = { status: "pending" };

  const { data, error } = await supabase.from("pipeline_runs").insert({
    topic: body.topic,
    input_type: "topic",
    input_payload: { urls: body.urls || [] },
    brand_voice: body.brand_voice || "professional",
    language: body.language || "english",
    mode: body.mode || "gtm",
    tone: body.tone || "professional",
    length: body.length || "medium",
    status: "running",
    agent_states: states,
    started_at: new Date().toISOString(),
    enabled_agents: PIPELINE.map((s) => s.key),
    total_agents: PIPELINE.length,
  }).select().single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message || "insert failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fire and forget
  runPipeline(data.id, body).catch((e) => console.error("pipeline error:", e));

  return new Response(JSON.stringify({ run_id: data.id, status: "started" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
