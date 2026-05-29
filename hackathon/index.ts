// supabase/functions/orchestrator/index.ts
// LADtoday Orchestrator — chains all 10 agents in sequence
// Deno + Supabase Edge Runtime

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface OrchestratorRequest {
  topic: string;
  mode?: "gtm" | "finance" | "security";
  tone?: "professional" | "conversational" | "editorial" | "urgent";
  length?: "short" | "medium" | "long";
  urls?: string[];
  user_id?: string;
}

async function callAgent(functionName: string, payload: any) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Agent ${functionName} failed: ${error}`);
  }

  return response.json();
}

async function updateStatus(articleId: string, status: string, progress: number, message: string) {
  await supabase
    .from("articles")
    .update({ pipeline_status: status, pipeline_progress: progress, pipeline_message: message })
    .eq("id", articleId);

  // Broadcast to Supabase Realtime for live dashboard updates
  await supabase
    .channel(`article:${articleId}`)
    .send({
      type: "broadcast",
      event: "pipeline_update",
      payload: { articleId, status, progress, message }
    });
}

async function logAgentRun(articleId: string, agentName: string, input: any, output: any, durationMs: number, brightDataCalls = 0) {
  await supabase.from("agent_runs").insert({
    article_id: articleId,
    agent_name: agentName,
    status: "completed",
    input,
    output,
    duration_ms: durationMs,
    bright_data_calls: brightDataCalls
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body: OrchestratorRequest = await req.json();
  const { topic, mode = "gtm", tone = "professional", length = "medium", urls = [], user_id } = body;

  // 1. Create article record in DB
  const { data: article, error: createError } = await supabase
    .from("articles")
    .insert({
      topic,
      mode,
      status: "draft",
      pipeline_status: "starting",
      pipeline_progress: 0,
      pipeline_message: "Initializing pipeline...",
      user_id
    })
    .select()
    .single();

  if (createError || !article) {
    return new Response(JSON.stringify({ error: "Failed to create article" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const articleId = article.id;

  // Run pipeline asynchronously — return article_id immediately for real-time tracking
  runPipeline(articleId, { topic, mode, tone, length, urls, user_id }).catch(async (err) => {
    console.error("Pipeline error:", err);
    await supabase
      .from("articles")
      .update({ status: "failed", pipeline_status: "failed", pipeline_message: err.message })
      .eq("id", articleId);
  });

  return new Response(JSON.stringify({ article_id: articleId, status: "started" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});

async function runPipeline(articleId: string, params: OrchestratorRequest) {
  const { topic, mode, tone, length, urls } = params;
  let t0: number;

  try {
    // ── PHASE 1: DISCOVER ──────────────────────────────────────────────
    await updateStatus(articleId, "discovering", 10, "🔍 Scout Agent searching the web via Bright Data...");
    t0 = Date.now();
    const scoutResult = await callAgent("scout-agent", {
      topic,
      urls,
      geo: "pk",
      depth: 2,
      mode: "serp"
    });
    await logAgentRun(articleId, "scout", { topic, urls }, scoutResult, Date.now() - t0, scoutResult.metadata?.total_sources ?? 0);
    await supabase.from("articles").update({ bright_data_sources: scoutResult.sources }).eq("id", articleId);

    // ── PHASE 2: ANALYZE ──────────────────────────────────────────────
    await updateStatus(articleId, "analyzing", 25, `🧠 Intelligence Agent analyzing ${scoutResult.sources.length} sources via AI/ML API...`);
    t0 = Date.now();
    const intelResult = await callAgent("intelligence-agent", {
      sources: scoutResult.sources,
      topic,
      mode,
      recall_memory: true
    });
    await logAgentRun(articleId, "intelligence", { sources_count: scoutResult.sources.length }, intelResult, Date.now() - t0);

    // ── PHASE 3: WRITE ──────────────────────────────────────────────
    await updateStatus(articleId, "writing", 40, "✍️ Rewrite Agent crafting human-quality prose...");
    t0 = Date.now();
    const rewriteResult = await callAgent("rewrite-agent", {
      brief: intelResult.brief,
      tone,
      length,
      target_audience: mode === "finance" ? "financial analysts" : "GTM professionals"
    });
    await logAgentRun(articleId, "rewrite", { brief: intelResult.brief }, rewriteResult, Date.now() - t0);

    // ── PHASE 4: OPTIMIZE (parallel) ──────────────────────────────────
    await updateStatus(articleId, "optimizing", 55, "📈 SEO + Vision Agents optimizing in parallel...");
    t0 = Date.now();
    const [seoResult, visionResult] = await Promise.all([
      callAgent("seo-agent", { article: rewriteResult.article, topic }),
      callAgent("vision-agent", { article: rewriteResult.article, topic })
    ]);
    await logAgentRun(articleId, "seo+vision", {}, { seoResult, visionResult }, Date.now() - t0);

    // ── PHASE 5: CREATIVE ──────────────────────────────────────────────
    await updateStatus(articleId, "creating", 68, "🎨 Creative Agent generating headline variants + social snippets...");
    t0 = Date.now();
    const creativeResult = await callAgent("creative-agent", {
      article: rewriteResult.article,
      brief: intelResult.brief,
      seo: seoResult
    });
    await logAgentRun(articleId, "creative", {}, creativeResult, Date.now() - t0);

    // ── PHASE 6: GUARDIAN ──────────────────────────────────────────────
    await updateStatus(articleId, "compliance", 80, "🛡️ Guardian Agent running compliance & plagiarism checks...");
    t0 = Date.now();
    const guardianResult = await callAgent("guardian-agent", {
      article: { ...rewriteResult.article, ...seoResult, ...creativeResult },
      sources: scoutResult.sources,
      mode
    });
    await logAgentRun(articleId, "guardian", {}, guardianResult, Date.now() - t0);

    // Save everything before publishing
    await supabase.from("articles").update({
      headline: creativeResult.headlines[0]?.variant ?? rewriteResult.article.headline,
      body: rewriteResult.article.body,
      meta_description: seoResult.meta_description,
      seo_score: seoResult.seo_score,
      word_count: rewriteResult.article.word_count,
      guardian_verdict: guardianResult.final_verdict,
      audit_log: guardianResult,
      social_snippets: creativeResult.social_snippets
    }).eq("id", articleId);

    if (guardianResult.final_verdict === "QUARANTINED") {
      await updateStatus(articleId, "quarantined", 85, "⚠️ Guardian quarantined this article. Human review required.");
      await supabase.from("articles").update({ status: "quarantined" }).eq("id", articleId);
      return;
    }

    // ── PHASE 7: PUBLISH ──────────────────────────────────────────────
    await updateStatus(articleId, "publishing", 90, "📡 Publish Agent distributing to platforms via TriggerWare.ai...");
    t0 = Date.now();
    const publishResult = await callAgent("publish-agent", {
      article_id: articleId,
      article: {
        headline: creativeResult.headlines[0]?.variant,
        body: rewriteResult.article.body,
        meta_description: seoResult.meta_description,
        social_snippets: creativeResult.social_snippets,
        topic
      },
      platforms: ["wordpress", "triggerware"],
      guardian_verdict: guardianResult.final_verdict
    });
    await logAgentRun(articleId, "publish", {}, publishResult, Date.now() - t0);

    // ── PHASE 8: ANALYTICS ──────────────────────────────────────────────
    await updateStatus(articleId, "tracking", 97, "📊 Analytics Agent initializing performance tracking...");
    await callAgent("analytics-agent", { article_id: articleId, topic, mode });

    // ── DONE ──────────────────────────────────────────────
    await supabase.from("articles").update({
      status: "published",
      published_at: new Date().toISOString()
    }).eq("id", articleId);

    await updateStatus(articleId, "completed", 100, `✅ Article published! Sources: ${scoutResult.sources.length} | Verdict: ${guardianResult.final_verdict}`);

  } catch (err) {
    throw err;
  }
}
