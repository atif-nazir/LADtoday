// ============================================================
// Agent 09 — Analytics Agent (Cognee Memory)
// Phase: OPERATE | Depends on: publish
// ============================================================
// Tracks article performance and stores learnings in Cognee
// for future pipeline runs to recall.
//
// Revenue projection uses Pakistan RPM rates (PKR 150/1000 views)
// Cognee stores: topic, angle, headline, projected performance
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "analytics";
const AGENT_NAME = "Analytics Agent";

const COGNEE_API_KEY = Deno.env.get("COGNEE_API_KEY") || "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Revenue Projection ───────────────────────────────────────────────────────
// Pakistan RPM rates: PKR 150 per 1000 views (realistic rate)

function projectRevenuePKR(views: number): number {
  const RPM_PKR = 150;
  return Math.round((views / 1000) * RPM_PKR);
}

function projectViews(seoScore: number, wordCount: number, viralityScore: number): number {
  // Base projection from SEO score
  const seoBase = seoScore * 48; // 80 SEO score → ~3,840 views
  // Virality multiplier
  const viralityMultiplier = 1 + (viralityScore - 5) * 0.15;
  // Word count bonus (longer = more SEO value)
  const wordBonus = wordCount > 1000 ? 1.2 : 1.0;
  return Math.round(seoBase * viralityMultiplier * wordBonus);
}

// ─── Cognee: Store Performance Memory ────────────────────────────────────────
// Stores article performance data so Intelligence Agent can recall
// what angles/tones worked best for future runs

async function storeInCognee(data: {
  topic: string;
  angle: string;
  headline: string;
  virality_score: number;
  seo_score: number;
  word_count: number;
  projected_views: number;
  mode: string;
}): Promise<{ stored: boolean; reason?: string }> {
  if (!COGNEE_API_KEY) {
    return { stored: false, reason: "COGNEE_API_KEY not configured" };
  }

  try {
    const memoryText = [
      `Topic: ${data.topic}`,
      `Angle: ${data.angle}`,
      `Headline: "${data.headline}"`,
      `Mode: ${data.mode}`,
      `Virality Score: ${data.virality_score}/10`,
      `SEO Score: ${data.seo_score}`,
      `Word Count: ${data.word_count}`,
      `Projected Views: ${data.projected_views}`,
      `Projected Revenue: PKR ${projectRevenuePKR(data.projected_views)}`,
      `Published: ${new Date().toISOString()}`,
    ].join(" | ");

    const response = await fetch("https://api.cognee.ai/v1/add", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COGNEE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: memoryText,
        dataset_name: "ladtoday_performance",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text();
      return { stored: false, reason: `Cognee API error: ${response.status} ${err.slice(0, 100)}` };
    }

    return { stored: true };
  } catch (err) {
    return { stored: false, reason: String(err) };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch { /* */ }
  return false;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    if (!await verifyServiceOrAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const mode = (run as any).mode || "gtm";

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    // Load upstream outputs
    const [rewriteOutput, seoOutput, intelligenceOutput, creativeOutput, scoutOutput, publishOutput] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "seo"),
      readAgentOutput(run_id, "intelligence"),
      readAgentOutput(run_id, "creative"),
      readAgentOutput(run_id, "scout"),
      readAgentOutput(run_id, "publish"),
    ]);

    const seoScore = seoOutput?.seo_score || 65;
    const wordCount = rewriteOutput?.word_count || 0;
    const viralityScore = intelligenceOutput?.virality_score || 5;
    const headline = creativeOutput?.top_headline || rewriteOutput?.headline_used || topic;
    const angle = intelligenceOutput?.best_angle || intelligenceOutput?.learned_angle_type || "general";
    const sourcesCount = scoutOutput?.total_sources || scoutOutput?.sources?.length || 0;

    // Calculate projections
    const projectedViews = projectViews(seoScore, wordCount, viralityScore);
    const projectedRevenuePKR = projectRevenuePKR(projectedViews);

    // Store in Cognee for future memory recall
    console.log(`[${AGENT_NAME}] Storing performance data in Cognee...`);
    const cogneeResult = await storeInCognee({
      topic,
      angle,
      headline,
      virality_score: viralityScore,
      seo_score: seoScore,
      word_count: wordCount,
      projected_views: projectedViews,
      mode,
    });
    console.log(`[${AGENT_NAME}] Cognee: ${cogneeResult.stored ? "✅ stored" : `⚠️ ${cogneeResult.reason}`}`);

    // Also store in agent_memory table for Intelligence Agent learning
    try {
      await supabase.from("agent_memory").insert({
        agent_key: "intelligence",
        topic_category: inferCategory(topic),
        angle_type: angle,
        virality_score: viralityScore,
        content_brief_style: intelligenceOutput?.content_brief?.slice(0, 200) || "",
        word_count: wordCount,
        quality_score: rewriteOutput?.quality_score || 7,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    const durationMs = Date.now() - startedAt;

    const output = {
      run_id,
      topic,
      mode,
      metrics: {
        current_views: 0,
        projected_views: projectedViews,
        estimated_revenue_pkr: projectedRevenuePKR,
        projected_monthly_revenue_pkr: projectedRevenuePKR * 4,
        seo_score: seoScore,
        word_count: wordCount,
        virality_score: viralityScore,
        sources_count: sourcesCount,
        quality_score: rewriteOutput?.quality_score || 7,
      },
      cognee_stored: cogneeResult.stored,
      cognee_reason: cogneeResult.reason,
      tracking_active: true,
      headline,
      angle,
      platforms_published: publishOutput?.platforms_published || [],
      wordpress_url: publishOutput?.wordpress_url,
    };

    await writeAgentOutput(run_id, AGENT_KEY, output, { tokens: 200, duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      projected_views: projectedViews,
      projected_revenue_pkr: projectedRevenuePKR,
      cognee_stored: cogneeResult.stored,
      seo_score: seoScore,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `projected_views=${projectedViews} | revenue=PKR${projectedRevenuePKR} | cognee=${cogneeResult.stored} | ${durationMs}ms`,
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ ${durationMs}ms — projected ${projectedViews} views, PKR ${projectedRevenuePKR}`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      projected_views: projectedViews,
      projected_revenue_pkr: projectedRevenuePKR,
      cognee_stored: cogneeResult.stored,
      duration_ms: durationMs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt });
      }
    } catch { /* best effort */ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function inferCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|secp|payment|wallet/.test(t)) return "fintech";
  if (/startup|tech|ai|software|app|digital/.test(t)) return "tech";
  if (/cricket|psl|sport/.test(t)) return "sports";
  if (/election|politics|government|minister/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee|dollar|trade/.test(t)) return "economy";
  if (/health|covid|hospital|medical/.test(t)) return "health";
  return "general";
}
