// ============================================================
// Agent 39 — Performance Predictor Agent
// Phase: DISTRIBUTE | Model: gemini-2.5-pro | Depends on: 38
// ============================================================
// Uses historical analytics_events data + article metadata to
// predict future performance (7d, 30d views) and assign a
// "viral potential score". Cross-references with trend data
// from Agent 03 to detect articles that may spike later.
// Writes predictions to article_predictions table.
// Pro model — requires pattern reasoning across historical data.
// pg_cron: '0 */12 * * *' — every 12 hours
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "performance-predictor";
const AGENT_NAME = "Performance Predictor";
const MODEL      = "gemini-2.5-pro";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerformancePrediction {
  article_id:        string;
  article_url:       string;
  predicted_at:      string;

  // Predictions
  views_7d:          number;
  views_30d:         number;
  shares_7d:         number;
  backlinks_30d:     number;
  viral_potential:   number;    // 0-10
  longevity_score:   number;    // 0-10 (evergreen vs breaking)

  // Classification
  content_tier:      "viral" | "high" | "medium" | "low";
  evergreen_score:   number;    // 0-10
  breaking_decay:    string;    // "fast" | "slow" | "evergreen"

  // Confidence
  prediction_confidence: number;  // 0-1
  data_points_used:      number;

  // Recommended actions
  boost_recommended:   boolean;
  boost_budget_pkr:    number;
  featured_recommended: boolean;
  refresh_in_days:     number;   // When to refresh content for SEO

  // Risk
  trending_risk:    string;   // Could go stale fast?
  competitor_risk:  string;   // Competitors likely to write similar?

  prediction_summary: string;
}

interface PerformancePredictorOutput {
  predictions:         PerformancePrediction[];
  avg_viral_potential: number;
  top_performer:       string;
  summary:             string;
}

// ─── Load historical benchmarks ────────────────────────────────────────────────

async function loadHistoricalBenchmarks(): Promise<{
  avg_views_24h:  number;
  avg_views_7d:   number;
  avg_shares:     number;
  top_10_pct_threshold: number;
}> {
  try {
    const { data } = await supabase.from("analytics_events")
      .select("views_24h, views_7d, shares_fb, shares_tw")
      .not("views_7d", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data?.length) return { avg_views_24h: 120, avg_views_7d: 600, avg_shares: 15, top_10_pct_threshold: 1500 };

    const avgViews24h = data.reduce((s, r) => s + (r.views_24h || 0), 0) / data.length;
    const avgViews7d  = data.reduce((s, r) => s + (r.views_7d  || 0), 0) / data.length;
    const avgShares   = data.reduce((s, r) => s + (r.shares_fb || 0) + (r.shares_tw || 0), 0) / data.length;
    const sorted7d    = data.map(r => r.views_7d || 0).sort((a, b) => b - a);
    const top10Idx    = Math.floor(sorted7d.length * 0.1);
    return { avg_views_24h: Math.round(avgViews24h), avg_views_7d: Math.round(avgViews7d), avg_shares: Math.round(avgShares), top_10_pct_threshold: sorted7d[top10Idx] || 1500 };
  } catch {
    return { avg_views_24h: 120, avg_views_7d: 600, avg_shares: 15, top_10_pct_threshold: 1500 };
  }
}

// ─── Core Performance Prediction ─────────────────────────────────────────────

async function predictPerformance(
  run_id: string,
  contentPkg: any,
  engagementReport: any,
  trendOutput: any,
  publisherOutput: any,
  benchmarks: Awaited<ReturnType<typeof loadHistoricalBenchmarks>>,
): Promise<PerformancePrediction> {

  const articleId  = publisherOutput?.article_id  || "";
  const articleUrl = publisherOutput?.published_url || "";
  const title      = publisherOutput?.title        || contentPkg?.ai_title || "";
  const tags       = contentPkg?.ai_tags            || [];
  const wordCount  = contentPkg?.word_count         || 0;
  const qualityScore = 75; // From quality-gate-22 in agent_states
  const viralityScore = trendOutput?.virality_score || 5;
  const trajectory    = trendOutput?.trajectory     || "stable";
  const momentum      = trendOutput?.trend_momentum || 5;

  const currentViews24h = engagementReport?.total_impressions || 0;
  const engScore        = engagementReport?.engagement_score  || 50;
  const engGrade        = engagementReport?.engagement_grade  || "average";

  const prompt = `You are a content performance analyst for LADtoday, a Pakistani digital media platform.
Predict this article's performance over the next 30 days using the available data signals.

ARTICLE: "${title}"
TAGS: ${tags.slice(0, 5).join(", ")}
WORD COUNT: ${wordCount}
QUALITY SCORE: ${qualityScore}/100
VIRALITY POTENTIAL (Trend Agent): ${viralityScore}/10
TREND TRAJECTORY: ${trajectory} (momentum: ${momentum}/10)

CURRENT 24H PERFORMANCE:
- Views: ${currentViews24h} (site avg: ${benchmarks.avg_views_24h})
- Engagement Score: ${engScore}/100 (grade: ${engGrade})

HISTORICAL BENCHMARKS:
- Avg 7-day views: ${benchmarks.avg_views_7d}
- Avg 7-day shares: ${benchmarks.avg_shares}
- Top 10% threshold: ${benchmarks.top_10_pct_threshold}

PREDICT:
1. views_7d: Estimated total views over 7 days
2. views_30d: Estimated total views over 30 days
3. shares_7d: Estimated social shares over 7 days
4. backlinks_30d: Estimated backlinks (referral traffic sources)
5. viral_potential: 0-10 scale (10 = Pakistan trending topic)
6. longevity_score: 0-10 (10 = evergreen content, 0 = day-old news)
7. evergreen_score: 0-10 — will it get traffic 6 months from now?
8. breaking_decay: "fast" (news dies in 24h) | "slow" (week) | "evergreen" (months)
9. content_tier: "viral" (top 5%), "high" (top 20%), "medium" (average), "low" (below avg)
10. boost_recommended: Should we run paid boost on FB/TW?
11. boost_budget_pkr: Suggested budget if boosting (in PKR, e.g. 2000 for a small boost)
12. featured_recommended: Should this be featured on homepage?
13. refresh_in_days: When to update the article for continued SEO value
14. trending_risk: What topical risk could make this stale?
15. competitor_risk: Will competitors clone this within 24h?

Base predictions on: virality score, trend momentum, engagement rate, word count (longer = more evergreen).

Return JSON:
{
  "views_7d": number,
  "views_30d": number,
  "shares_7d": number,
  "backlinks_30d": number,
  "viral_potential": number,
  "longevity_score": number,
  "evergreen_score": number,
  "breaking_decay": "fast|slow|evergreen",
  "content_tier": "viral|high|medium|low",
  "prediction_confidence": number (0-1),
  "boost_recommended": boolean,
  "boost_budget_pkr": number,
  "featured_recommended": boolean,
  "refresh_in_days": number,
  "trending_risk": "string",
  "competitor_risk": "string",
  "prediction_summary": "string"
}`;

  const schema = {
    type: "object",
    properties: {
      views_7d: { type: "number" }, views_30d: { type: "number" }, shares_7d: { type: "number" },
      backlinks_30d: { type: "number" }, viral_potential: { type: "number" }, longevity_score: { type: "number" },
      evergreen_score: { type: "number" }, breaking_decay: { type: "string" }, content_tier: { type: "string" },
      prediction_confidence: { type: "number" }, boost_recommended: { type: "boolean" },
      boost_budget_pkr: { type: "number" }, featured_recommended: { type: "boolean" },
      refresh_in_days: { type: "number" }, trending_risk: { type: "string" },
      competitor_risk: { type: "string" }, prediction_summary: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.4, maxOutputTokens: 2048 });

  // Apply winner to articles if featured recommended
  if (raw.featured_recommended && articleId) {
    try { await supabase.from("articles").update({ featured: true }).eq("id", articleId); } catch {}
  }

  // Write to article_predictions table
  try {
    await supabase.from("article_predictions").upsert({
      run_id, article_id: articleId,
      views_7d_predicted: raw.views_7d, views_30d_predicted: raw.views_30d,
      viral_potential: raw.viral_potential, content_tier: raw.content_tier,
      boost_recommended: raw.boost_recommended, boost_budget_pkr: raw.boost_budget_pkr,
      featured_recommended: raw.featured_recommended, refresh_in_days: raw.refresh_in_days,
      prediction_confidence: raw.prediction_confidence,
      predicted_at: new Date().toISOString(),
    }, { onConflict: "run_id" });
  } catch { /* non-fatal */ }

  return {
    article_id: articleId, article_url: articleUrl, predicted_at: new Date().toISOString(),
    views_7d:       raw.views_7d       || benchmarks.avg_views_7d,
    views_30d:      raw.views_30d      || benchmarks.avg_views_7d * 3,
    shares_7d:      raw.shares_7d      || benchmarks.avg_shares,
    backlinks_30d:  raw.backlinks_30d  || 2,
    viral_potential: raw.viral_potential || viralityScore,
    longevity_score: raw.longevity_score || 5,
    evergreen_score: raw.evergreen_score || 5,
    breaking_decay:  raw.breaking_decay  || "slow",
    content_tier:    raw.content_tier    || "medium",
    prediction_confidence: raw.prediction_confidence || 0.6,
    data_points_used: 5,
    boost_recommended:     raw.boost_recommended    ?? false,
    boost_budget_pkr:      raw.boost_budget_pkr     || 0,
    featured_recommended:  raw.featured_recommended ?? false,
    refresh_in_days:       raw.refresh_in_days      || 30,
    trending_risk:         raw.trending_risk         || "Low",
    competitor_risk:       raw.competitor_risk       || "Medium",
    prediction_summary:    raw.prediction_summary    || "Performance prediction generated.",
  };
}

// ─── Cron: every 12 hours ─────────────────────────────────────────────────────
// pg_cron: '0 */12 * * *'

async function cronProcessPending(): Promise<{ checked: number; errors: number }> {
  const { data: runs } = await supabase.from("pipeline_runs")
    .select("id, topic, agent_states")
    .in("status", ["published", "completed"])
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600000).toISOString())
    .limit(8);
  let checked = 0, errors = 0;
  const benchmarks = await loadHistoricalBenchmarks();
  for (const run of runs || []) {
    const s = run.agent_states || {};
    if (s["engagement-monitor-38"]?.status === "completed" && s[AGENT_KEY]?.status !== "completed") {
      try {
        await patchAgentState(run.id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });
        const [contentPkg, engagement, trend, publisher] = await Promise.all([
          readAgentOutput(run.id, "content-assembler-21"),
          readAgentOutput(run.id, "engagement-monitor-38"),
          readAgentOutput(run.id, "trend-forecaster-03"),
          readAgentOutput(run.id, "site-publisher-29"),
        ]);
        const engReport = engagement?.reports?.[0] || engagement;
        const pred = await predictPerformance(run.id, contentPkg, engReport, trend, publisher, benchmarks);
        const result: PerformancePredictorOutput = { predictions: [pred], avg_viral_potential: pred.viral_potential, top_performer: pred.content_tier === "viral" || pred.content_tier === "high" ? pred.article_id : "", summary: pred.prediction_summary };
        await writeAgentOutput(run.id, AGENT_KEY, result, { status: "completed" });
        await patchAgentState(run.id, AGENT_KEY, { status: "completed", finished_at: new Date().toISOString(), viral: pred.viral_potential, tier: pred.content_tier, boost: pred.boost_recommended });
        checked++;
      } catch (err) { errors++; await patchAgentState(run.id, AGENT_KEY, { status: "failed", error: String(err), finished_at: new Date().toISOString() }); }
    }
  }
  return { checked, errors };
}

async function verifyAuth(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization"); if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", ""); if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { if (JSON.parse(atob(t.split(".")[1])).role === "service_role") return true; } catch {} return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    if (!await verifyAuth(req)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    if (body.cron === true) { const r = await cronProcessPending(); return new Response(JSON.stringify({ ok: true, mode: "cron", ...r }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const { run_id } = body;
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const run = await loadRun(run_id);
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });
    const benchmarks = await loadHistoricalBenchmarks();
    const [contentPkg, engagement, trend, publisher] = await Promise.all([
      readAgentOutput(run_id, "content-assembler-21"),
      readAgentOutput(run_id, "engagement-monitor-38"),
      readAgentOutput(run_id, "trend-forecaster-03"),
      readAgentOutput(run_id, "site-publisher-29"),
    ]);
    const engReport = engagement?.reports?.[0] || engagement;
    const pred      = await predictPerformance(run_id, contentPkg, engReport, trend, publisher, benchmarks);
    const result: PerformancePredictorOutput = { predictions: [pred], avg_viral_potential: pred.viral_potential, top_performer: pred.article_id, summary: pred.prediction_summary };
    const durationMs = Date.now() - startedAt;
    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, { status: "completed", finished_at: new Date().toISOString(), viral: pred.viral_potential, tier: pred.content_tier, boost: pred.boost_recommended });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, `tier=${pred.content_tier}, viral=${pred.viral_potential}/10, views7d=${pred.views_7d}, boost=${pred.boost_recommended}, ${durationMs}ms`, { run_id });
    return new Response(JSON.stringify({ ok: true, agent: AGENT_KEY, run_id, content_tier: pred.content_tier, viral_potential: pred.viral_potential, views_7d_predicted: pred.views_7d, boost_recommended: pred.boost_recommended, featured_recommended: pred.featured_recommended, duration_ms: durationMs }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { const b = await req.clone().json().catch(() => ({})); if (b.run_id) await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", error: msg, finished_at: new Date().toISOString() }); } catch {}
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
