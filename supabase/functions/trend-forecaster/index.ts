// ============================================================
// Agent 03 — Trend Forecaster Agent
// Phase: DISCOVER | Model: gemini-2.5-flash | Depends on: scout
// Runs PARALLEL with intelligence, competitor-intel, audience-listener, news-wire
// ============================================================
// LEARNING: After articles publish, the system can feed back actual
// traffic data. This agent reads past trend predictions vs actuals
// from agent_memory and calibrates its momentum scoring over time.
// Core output: trend_momentum (1-10) + optimal_publish window.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "trend-forecaster";
const AGENT_NAME = "Trend Forecaster";
const MODEL = "gemini-2.5-flash"; // Flash: speed matters for trend timing intelligence

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakoutAngle {
  angle: string; reason: string;
  urgency: "high" | "medium" | "low"; search_query: string;
}

interface TrendOutput {
  trend_momentum: number;           // 1-10, 10 = exploding right now
  trajectory: "rising" | "peaking" | "declining" | "stable";
  peak_prediction_hours: number;    // hours until predicted peak
  optimal_publish: "now" | "wait_24h" | "wait_48h";
  optimal_publish_reason: string;
  breakout_angles: BreakoutAngle[];
  pakistan_relevance: number;       // 1-10
  pakistan_cities_impacted: string[];
  pakistan_sectors_impacted: string[];
  pakistan_angle: string;
  twitter_velocity: "high" | "medium" | "low";
  linkedin_interest: "high" | "medium" | "low";
  youtube_trend: "high" | "medium" | "low";
  seasonal_factor: string;
  recurring_pattern: string;
  oversaturation_risk: "low" | "medium" | "high";
  first_mover_advantage: boolean;
  competitor_coverage_estimate: string;
  evergreen_potential: number;      // 1-10
  news_peg: string;
  trend_rationale: string;
  // Learning output
  calibration_applied: boolean;
  calibration_offset: number;       // adjustment applied based on past accuracy
  past_accuracy_pct?: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// This agent stores: predicted momentum, actual views week 1.
// Learns: did high-momentum predictions (8-10) actually get more traffic?
// If predictions were systematically off, apply a calibration offset.

interface TrendMemory {
  id: string;
  topic_category: string;
  predicted_momentum: number;
  actual_views_week1?: number;
  trajectory: string;
  optimal_publish_correct?: boolean; // did timing match actual peak?
  created_at: string;
}

async function loadCalibration(topicCategory: string): Promise<{
  calibrationOffset: number;       // -2 to +2 adjustment for momentum score
  pastAccuracyPct: number;         // percentage of timing predictions that were correct
  calibrationSampleSize: number;
  topTrajectoryForCategory: string;
}> {
  try {
    const { data: memories } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .not("actual_views_week1", "is", null) // only learn from confirmed actuals
      .order("created_at", { ascending: false })
      .limit(30);

    if (!memories?.length) {
      return { calibrationOffset: 0, pastAccuracyPct: 0, calibrationSampleSize: 0, topTrajectoryForCategory: "stable" };
    }

    // Calculate calibration: did high predictions (>=7) actually correlate with high views?
    const withViews = memories.filter(m => m.actual_views_week1 > 0);
    let systematicBias = 0;
    if (withViews.length >= 5) {
      // Compare predicted momentum to normalized actual views
      const maxViews = Math.max(...withViews.map(m => m.actual_views_week1 || 0));
      for (const m of withViews) {
        const normalizedViews = ((m.actual_views_week1 || 0) / maxViews) * 10;
        systematicBias += (m.predicted_momentum - normalizedViews);
      }
      systematicBias = systematicBias / withViews.length;
    }

    // Clamp offset to -2 to +2
    const calibrationOffset = Math.max(-2, Math.min(2, -systematicBias));

    // Timing accuracy
    const withTimingFeedback = memories.filter(m => m.optimal_publish_correct !== null);
    const correctTimings = withTimingFeedback.filter(m => m.optimal_publish_correct === true).length;
    const pastAccuracyPct = withTimingFeedback.length > 0
      ? Math.round((correctTimings / withTimingFeedback.length) * 100)
      : 0;

    // Most common trajectory for this category
    const trajCounts: Record<string, number> = {};
    for (const m of memories) {
      const t = m.trajectory || "stable";
      trajCounts[t] = (trajCounts[t] || 0) + 1;
    }
    const topTrajectoryForCategory = Object.entries(trajCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "stable";

    return {
      calibrationOffset: Math.round(calibrationOffset * 10) / 10,
      pastAccuracyPct,
      calibrationSampleSize: memories.length,
      topTrajectoryForCategory,
    };
  } catch {
    return { calibrationOffset: 0, pastAccuracyPct: 0, calibrationSampleSize: 0, topTrajectoryForCategory: "stable" };
  }
}

async function writeTrendMemory(
  topicCategory: string,
  predictedMomentum: number,
  trajectory: string,
  optimalPublish: string
): Promise<void> {
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: topicCategory,
      predicted_momentum: predictedMomentum,
      trajectory,
      optimal_publish_recommended: optimalPublish,
      actual_views_week1: null, // to be filled by analytics agent later
      optimal_publish_correct: null, // to be filled by analytics agent later
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

// ─── Topic category inference ──────────────────────────────────────────────────

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|payment|crypto/.test(t)) return "fintech";
  if (/startup|tech|ai|digital|app/.test(t)) return "tech";
  if (/cricket|psl|sport/.test(t)) return "sports";
  if (/election|politics|government/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee/.test(t)) return "economy";
  return "general";
}

// ─── Core Trend Analysis ──────────────────────────────────────────────────────

async function analyzeTrend(
  topic: string,
  dateStr: string,
  timeStr: string,
  scoutData: any,
  calibration: Awaited<ReturnType<typeof loadCalibration>>,
  modelName: string
): Promise<TrendOutput> {

  // Build scout context if available
  const scoutContext = scoutData
    ? `
━━━ SCOUT DATA (Use to inform trend signal) ━━━
Content Density: ${scoutData.content_density || "medium"}
Overall Sentiment: ${scoutData.overall_sentiment || "neutral"}
Pakistan Relevance Score: ${scoutData.pakistan_relevance_score || "5"}/10
Recommended Angle: ${scoutData.recommended_angle || "N/A"}
Top Source Domain: ${scoutData.top_source_domain || "unknown"}
Scout Notes: ${scoutData.scout_notes || "N/A"}
Top 3 Key Facts:
${(scoutData.sources || []).slice(0, 3).map((s: any, i: number) =>
    `  ${i + 1}. [${s.source_domain}] ${(s.key_facts || []).slice(0, 2).join(" | ")}`
  ).join("\n")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const calibrationNote = calibration.calibrationSampleSize > 0
    ? `\n━━━ LEARNING CALIBRATION (${calibration.calibrationSampleSize} past runs) ━━━
Past Timing Accuracy: ${calibration.pastAccuracyPct}%
Calibration Adjustment: ${calibration.calibrationOffset > 0 ? "+" : ""}${calibration.calibrationOffset} momentum points
Common Trajectory for this category: ${calibration.topTrajectoryForCategory}
INSTRUCTION: Apply calibration to raw momentum score before returning.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a digital media trends analyst specializing in Pakistan's content markets.
Your job: Predict trend trajectory and timing intelligence for this topic.

TOPIC: "${topic}"
TODAY: ${dateStr} | TIME: ${timeStr} PKT
MARKET: Pakistan digital media (primary) + global context
${scoutContext}
${calibrationNote}

━━━ TREND ANALYSIS FRAMEWORK ━━━

1. CURRENT MOMENTUM (1-10 RAW, then apply calibration if provided):
   10 = Breaking right now, massive search spike
   7-9 = Trending rapidly, strong social velocity
   4-6 = Moderate interest, steady coverage
   1-3 = Niche/specialist interest only
   Apply calibration offset before reporting final score.

2. TRAJECTORY:
   - rising: search volume increasing, social mentions climbing
   - peaking: at or near maximum interest right now (act fast)
   - declining: interest falling (still relevant but fading)
   - stable: consistent interest, no major movement

3. PEAK PREDICTION (hours from now):
   - For rising: 6–48 hours typical for Pakistan news cycles
   - For peaking: 0 hours (publish NOW)
   - For declining: note it's already past peak

4. PAKISTAN-SPECIFIC ANALYSIS:
   - How does this topic uniquely affect Pakistan?
   - Which cities (Karachi, Lahore, Islamabad, Peshawar, Quetta)?
   - Which sectors (fintech, telecom, agriculture, textile, government, education)?
   - The Pakistani angle that international media is missing?

5. THREE BREAKOUT ANGLES:
   A. OBVIOUS angle (being covered — help editors AVOID this)
   B. ADJACENT angle (what trends NEXT from this story)
   C. CONTRARIAN angle (opposite take that earns engagement)

6. PLATFORM VELOCITY (Pakistan audience):
   - Twitter/X Pakistan: news-heavy, breaking events viral fast
   - LinkedIn Pakistan: professional/fintech/startup content
   - YouTube Pakistan: explainers and analysis

7. COMPETITIVE SATURATION:
   - Already over-covered by Dawn/Geo/ARY?
   - Is there still first-mover advantage?
   - Estimated number of Pakistani outlets covering this now

Return JSON:
{
  "trend_momentum": number (1-10, with calibration applied if provided),
  "trajectory": "rising|peaking|declining|stable",
  "peak_prediction_hours": number (0-168),
  "optimal_publish": "now|wait_24h|wait_48h",
  "optimal_publish_reason": "string",
  "breakout_angles": [{"angle":"string","reason":"string","urgency":"high|medium|low","search_query":"string"}],
  "pakistan_relevance": number (1-10),
  "pakistan_cities_impacted": ["string"],
  "pakistan_sectors_impacted": ["string"],
  "pakistan_angle": "string (unique Pakistani framing missed by int'l media)",
  "twitter_velocity": "high|medium|low",
  "linkedin_interest": "high|medium|low",
  "youtube_trend": "high|medium|low",
  "seasonal_factor": "string (any seasonal/Ramadan/cricket/fiscal pattern)",
  "recurring_pattern": "string (does this topic recur annually?)",
  "oversaturation_risk": "low|medium|high",
  "first_mover_advantage": boolean,
  "competitor_coverage_estimate": "string (estimated current coverage level)",
  "evergreen_potential": number (1-10),
  "news_peg": "string (the news hook making this timely)",
  "trend_rationale": "string (2-3 sentence summary of trend analysis)"
}`;

  const schema = {
    type: "object",
    properties: {
      trend_momentum: { type: "number" },
      trajectory: { type: "string" },
      peak_prediction_hours: { type: "number" },
      optimal_publish: { type: "string" },
      optimal_publish_reason: { type: "string" },
      breakout_angles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            angle: { type: "string" },
            reason: { type: "string" },
            urgency: { type: "string" },
            search_query: { type: "string" }
          },
          required: ["angle", "reason", "urgency", "search_query"]
        }
      },
      pakistan_relevance: { type: "number" },
      pakistan_cities_impacted: { type: "array", items: { type: "string" } },
      pakistan_sectors_impacted: { type: "array", items: { type: "string" } },
      pakistan_angle: { type: "string" },
      twitter_velocity: { type: "string" },
      linkedin_interest: { type: "string" },
      youtube_trend: { type: "string" },
      seasonal_factor: { type: "string" },
      recurring_pattern: { type: "string" },
      oversaturation_risk: { type: "string" },
      first_mover_advantage: { type: "boolean" },
      competitor_coverage_estimate: { type: "string" },
      evergreen_potential: { type: "number" },
      news_peg: { type: "string" },
      trend_rationale: { type: "string" },
    },
    required: [
      "trend_momentum",
      "trajectory",
      "peak_prediction_hours",
      "optimal_publish",
      "optimal_publish_reason",
      "breakout_angles",
      "pakistan_relevance",
      "pakistan_cities_impacted",
      "pakistan_sectors_impacted",
      "pakistan_angle",
      "twitter_velocity",
      "linkedin_interest",
      "youtube_trend",
      "seasonal_factor",
      "recurring_pattern",
      "oversaturation_risk",
      "first_mover_advantage",
      "competitor_coverage_estimate",
      "evergreen_potential",
      "news_peg",
      "trend_rationale"
    ]
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: modelName,
    temperature: 0.65,
    maxOutputTokens: 2048,
  });

  return {
    trend_momentum: Math.max(1, Math.min(10, (raw.trend_momentum || 5) + calibration.calibrationOffset)),
    trajectory: raw.trajectory || "stable",
    peak_prediction_hours: raw.peak_prediction_hours ?? 24,
    optimal_publish: raw.optimal_publish || "now",
    optimal_publish_reason: raw.optimal_publish_reason || "",
    breakout_angles: raw.breakout_angles || [],
    pakistan_relevance: raw.pakistan_relevance || 5,
    pakistan_cities_impacted: raw.pakistan_cities_impacted || [],
    pakistan_sectors_impacted: raw.pakistan_sectors_impacted || [],
    pakistan_angle: raw.pakistan_angle || "",
    twitter_velocity: raw.twitter_velocity || "medium",
    linkedin_interest: raw.linkedin_interest || "medium",
    youtube_trend: raw.youtube_trend || "medium",
    seasonal_factor: raw.seasonal_factor || "",
    recurring_pattern: raw.recurring_pattern || "",
    oversaturation_risk: raw.oversaturation_risk || "low",
    first_mover_advantage: raw.first_mover_advantage ?? true,
    competitor_coverage_estimate: raw.competitor_coverage_estimate || "",
    evergreen_potential: raw.evergreen_potential || 5,
    news_peg: raw.news_peg || "",
    trend_rationale: raw.trend_rationale || "",
    calibration_applied: calibration.calibrationSampleSize > 0,
    calibration_offset: calibration.calibrationOffset,
    past_accuracy_pct: calibration.pastAccuracyPct || undefined,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "service_role") return true;
  } catch { /* not JWT */ }
  return false;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    if (!await verifyServiceOrAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { run_id, model_override } = await req.json().catch(() => ({}));
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const topicCategory = inferTopicCategory(topic);
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour12: true });

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}" category=${topicCategory}`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic}`, { run_id });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
      topic_category: topicCategory,
    });

    // ── Read scout output (parallel dep — may or may not be ready, graceful) ──
    const scoutData = await readAgentOutput(run_id, "scout").catch(() => null);

    // ── Load calibration from past runs ──
    console.log(`[${AGENT_NAME}] Loading trend calibration for category="${topicCategory}"...`);
    const calibration = await loadCalibration(topicCategory);
    console.log(`[${AGENT_NAME}] Calibration: offset=${calibration.calibrationOffset}, accuracy=${calibration.pastAccuracyPct}%, n=${calibration.calibrationSampleSize}`);

    // ── Run trend analysis ──
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);
    const trendData = await analyzeTrend(topic, dateStr, timeStr, scoutData, calibration, selectedModel);

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, trendData, {
      tokens: Math.ceil(JSON.stringify(trendData).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      trend_momentum: trendData.trend_momentum,
      trajectory: trendData.trajectory,
      optimal_publish: trendData.optimal_publish,
      pakistan_relevance: trendData.pakistan_relevance,
      calibration_applied: trendData.calibration_applied,
    });

    // ── Write learning memory ──
    await writeTrendMemory(topicCategory, trendData.trend_momentum, trendData.trajectory, trendData.optimal_publish);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `momentum=${trendData.trend_momentum} (calibrated) | trajectory=${trendData.trajectory} | publish=${trendData.optimal_publish} | ${durationMs}ms`,
      { run_id }
    );

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      trend_momentum: trendData.trend_momentum,
      trajectory: trendData.trajectory,
      optimal_publish: trendData.optimal_publish,
      pakistan_relevance: trendData.pakistan_relevance,
      calibration_applied: trendData.calibration_applied,
      calibration_offset: trendData.calibration_offset,
      duration_ms: durationMs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? (err as GeminiError).status : 500;
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt });
      }
    } catch { /* best effort */ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
