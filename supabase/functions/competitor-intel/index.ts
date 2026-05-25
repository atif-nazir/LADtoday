// ============================================================
// Agent 04 — Competitor Intelligence Agent
// Phase: DISCOVER | Model: gemini-2.5-flash | Depends on: scout
// Runs PARALLEL with intelligence, trend-forecaster, audience-listener, news-wire
// ============================================================
// LEARNING: Tracks which coverage gaps LADtoday exploited successfully.
// Over time learns which competitor weaknesses lead to most traffic.
// Adapts gap-detection to focus on proven high-value opportunities.
// Core output: competitor_gaps + content_angle_suggestions
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";
import { selectModelForAgent, getModelInfo } from "../_shared/model-config.ts";

const AGENT_KEY = "competitor-intel";
const AGENT_NAME = "Competitor Intel";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorCoverage {
  outlet: string;                   // e.g., "Dawn.com", "Geo.tv", "The News"
  coverage_level: "heavy" | "moderate" | "light" | "none";
  typical_angle: string;            // how they usually frame this type of topic
  weakness: string;                 // what they consistently get wrong or miss
  publish_frequency: string;        // "daily" | "weekly" | "reactive"
  audience_overlap: number;         // 0-100% overlap with LADtoday audience
}

interface ContentGap {
  gap_description: string;          // what's missing in competitor coverage
  gap_type: "angle" | "depth" | "data" | "format" | "timing" | "audience";
  opportunity_score: number;        // 1-10, how valuable to exploit
  why_valuable: string;
  suggested_approach: string;
  previously_successful?: boolean;  // from learning memory
}

interface CompetitorIntelOutput {
  competitor_landscape: CompetitorCoverage[];
  content_gaps: ContentGap[];
  // Spec: exact JSON from LADtoday_50_AGENTS.md
  topics_covered: string[];          // what competitors covered
  unique_angle: string;              // recommended unique angle
  differentiation_strategy: string; // how to differentiate
  urgency: "first_mover" | "differentiate" | "skip"; // publish urgency classification
  skip_reason: string;               // only populated if urgency=skip
  // Extended
  dominant_narrative: string;
  contrarian_opportunity: string;
  format_gap: string;
  timing_gap: string;
  audience_underserved: string;
  differentiation_score: number;
  recommended_differentiator: string;
  first_to_cover: string[];
  competitor_urls_checked: string[];  // actual URLs from Supabase settings
  // Learning metadata
  learning_applied: boolean;
  high_value_gaps_from_memory: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Learns: which gap types have historically led to high-traffic articles?
// When "timing" gaps led to 5x more views, prioritize timing-gap detection.

async function loadCompetitorLearning(topicCategory: string): Promise<{
  highValueGapTypes: string[];
  successfulDifferentiators: string[];
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("opportunity_realized", { ascending: false })
      .limit(20);

    if (!data?.length) return { highValueGapTypes: [], successfulDifferentiators: [], sampleSize: 0 };

    const highValueGaps = data
      .filter(m => (m.actual_views_week1 || 0) > (m.avg_category_views || 1000))
      .map(m => m.gap_type)
      .filter(Boolean);

    // Count gap type frequency
    const gapFreq: Record<string, number> = {};
    for (const g of highValueGaps) gapFreq[g] = (gapFreq[g] || 0) + 1;
    const highValueGapTypes = Object.entries(gapFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t]) => t);

    const successfulDifferentiators = data
      .filter(m => (m.actual_views_week1 || 0) > 2000)
      .map(m => m.differentiator_used)
      .filter(Boolean)
      .slice(0, 3);

    return { highValueGapTypes, successfulDifferentiators, sampleSize: data.length };
  } catch {
    return { highValueGapTypes: [], successfulDifferentiators: [], sampleSize: 0 };
  }
}

async function writeCompetitorMemory(
  topicCategory: string,
  gapType: string,
  differentiator: string
): Promise<void> {
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: topicCategory,
      gap_type: gapType,
      differentiator_used: differentiator,
      actual_views_week1: null, // filled by analytics agent
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|payment/.test(t)) return "fintech";
  if (/startup|tech|ai|digital/.test(t)) return "tech";
  if (/cricket|psl|sport/.test(t)) return "sports";
  if (/election|politics|government/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee/.test(t)) return "economy";
  return "general";
}

// ─── Core Competitor Analysis ─────────────────────────────────────────────────

const PAKISTAN_COMPETITORS = {
  premium: ["Dawn.com", "The News International", "Tribune.com.pk", "Geo.tv"],
  digital_first: ["TechJuice.pk", "ProPakistani.pk", "Profit.com.pk", "Ary Digital"],
  social_native: ["Samaa TV", "BOL News", "Nayadaur.tv", "Pakistan Today"],
  niche: ["Propakistani", "Brecorder", "Business Recorder", "Pakistan Observer"],
};

// ─── Load Competitor URLs from Supabase Settings ──────────────────────────────
// Spec: "competitor URLs (stored in Supabase, set in Accounts settings)"

async function loadCompetitorUrls(): Promise<string[]> {
  try {
    // Check site_settings for user-configured competitor URLs
    const { data: settings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "competitor_urls")
      .single();
    if (settings?.value) {
      const urls = JSON.parse(settings.value);
      if (Array.isArray(urls) && urls.length > 0) return urls;
    }
  } catch { /* no config — fall back to defaults */ }
  // Default Pakistani competitors if none configured
  return [
    "https://dawn.com",
    "https://techjuice.pk",
    "https://propakistani.pk",
    "https://profit.com.pk",
    "https://brecorder.com",
  ];
}

async function analyzeCompetitors(
  topic: string,
  competitorUrls: string[],
  scoutData: any,
  learning: Awaited<ReturnType<typeof loadCompetitorLearning>>,
  selectedModel: string
): Promise<CompetitorIntelOutput> {

  const scoutContext = scoutData
    ? `\n━━━ SCOUT SOURCES (competitors already found) ━━━
${(scoutData.sources || []).slice(0, 4).map((s: any, i: number) =>
    `  ${i + 1}. ${s.source_domain}: "${s.title}" | Sentiment: ${s.sentiment} | Facts: ${(s.key_facts || []).slice(0, 2).join("; ")}`
  ).join("\n")}
Scout Angle: ${scoutData.recommended_angle || "N/A"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const competitorContext = competitorUrls.length > 0
    ? `\nCOMPETITOR URLS CONFIGURED (check these for last 7 days coverage):\n${competitorUrls.slice(0,6).join("\n")}`
    : "";


  const learningSection = learning.sampleSize > 0
    ? `\n━━━ LEARNING: GAP TYPES THAT DELIVERED RESULTS (${learning.sampleSize} past runs) ━━━
HIGH-VALUE GAP TYPES: ${learning.highValueGapTypes.join(", ") || "insufficient data"}
DIFFERENTIATORS THAT WORKED: ${learning.successfulDifferentiators.join(" | ") || "insufficient data"}
INSTRUCTION: Prioritize detecting "${learning.highValueGapTypes[0] || "any"}" gaps — historically highest-value.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a competitive intelligence analyst for LADtoday — Pakistan's leading AI content platform.

MISSION: Analyze how Pakistani media competitors are covering this topic.
Find the GAPS — what they're missing — so LADtoday can win with differentiated coverage.

TOPIC: "${topic}"
${scoutContext}
${competitorContext}
${learningSection}

PAKISTAN MEDIA LANDSCAPE:
Premium: ${PAKISTAN_COMPETITORS.premium.join(", ")}
Digital-First: ${PAKISTAN_COMPETITORS.digital_first.join(", ")}
Social-Native: ${PAKISTAN_COMPETITORS.social_native.join(", ")}
Niche/Business: ${PAKISTAN_COMPETITORS.niche.join(", ")}

━━━ COMPETITIVE ANALYSIS FRAMEWORK ━━━

1. MAP COMPETITOR COVERAGE:
   For each major outlet type, estimate:
   - Coverage level: heavy/moderate/light/none for THIS specific topic
   - Their typical angle on topics like this (e.g., Dawn favors policy analysis)
   - Their weakness (e.g., "ProPakistani misses non-tech business readers")
   - Audience overlap with LADtoday's 22-45 professional Pakistani audience

2. IDENTIFY CONTENT GAPS (find 4-6 gaps):
   Gap types:
   - ANGLE gap: everyone covers X angle, no one covers Y angle
   - DEPTH gap: all coverage is surface-level, no one goes deep
   - DATA gap: everyone quotes same 1-2 stats, rich data exists uncovered
   - FORMAT gap: all text articles, no one made a listicle/explainer/calculator
   - TIMING gap: all weekend coverage, morning publishing slot empty
   - AUDIENCE gap: all urban elite, no one writing for tier-2 city professional
   
   Score each gap 1-10 for opportunity value.
   ${learning.highValueGapTypes.length > 0 ? `PRIORITY: Focus extra attention on "${learning.highValueGapTypes[0]}" gaps — historically most valuable.` : ""}

3. IDENTIFY THE DOMINANT NARRATIVE:
   What's the consensus framing all outlets push?
   (This tells us what to AVOID if we want differentiation)

4. CONTRARIAN OPPORTUNITY:
   What's the opposite of the dominant narrative that could work?
   Must be grounded in facts, not just contrarian for its own sake.

5. DIFFERENTIATION SCORE (1-10):
   10 = massive gap, no one covering this angle, easy win
   1 = every outlet has already published on this, no differentiation possible
   
6. FIRST-TO-COVER opportunities:
   3-5 related topics/angles that NO Pakistani outlet has covered yet
   (These are goldmines for future content calendar)

━━━ SPEC REQUIRED: DIFFERENTIATION BRIEF ━━━

After analysis, determine URGENCY:
- first_mover: competitors have NOT covered this topic (last 7 days) → publish ASAP to own the space
- differentiate: competitors have covered it but missed key angles → differentiate and publish  
- skip: topic is oversaturated, no differentiable angle exists → recommend skipping

Also produce:
- topics_covered: list of angles competitors have already taken
- unique_angle: specific angle LADtoday should take
- differentiation_strategy: HOW to execute the unique angle

Return JSON:
{
  "competitor_landscape": [
    {"outlet":"string","coverage_level":"heavy|moderate|light|none","typical_angle":"string","weakness":"string","publish_frequency":"string","audience_overlap":number}
  ],
  "content_gaps": [
    {"gap_description":"string","gap_type":"angle|depth|data|format|timing|audience","opportunity_score":number,"why_valuable":"string","suggested_approach":"string"}
  ],
  "topics_covered": ["string (angles competitors already took)"],
  "unique_angle": "string (the specific angle LADtoday should take)",
  "differentiation_strategy": "string (HOW to execute unique_angle)",
  "urgency": "first_mover|differentiate|skip",
  "skip_reason": "string (only if urgency=skip, else empty)",
  "dominant_narrative": "string",
  "contrarian_opportunity": "string",
  "format_gap": "string",
  "timing_gap": "string",
  "audience_underserved": "string",
  "differentiation_score": number (1-10),
  "recommended_differentiator": "string",
  "first_to_cover": ["string"]
}`;

  const schema = {
    type: "object",
    properties: {
      competitor_landscape: { type: "array", items: { type: "object", properties: { outlet: { type: "string" }, coverage_level: { type: "string" }, typical_angle: { type: "string" }, weakness: { type: "string" }, publish_frequency: { type: "string" }, audience_overlap: { type: "number" } } } },
      content_gaps: { type: "array", items: { type: "object", properties: { gap_description: { type: "string" }, gap_type: { type: "string" }, opportunity_score: { type: "number" }, why_valuable: { type: "string" }, suggested_approach: { type: "string" } } } },
      dominant_narrative: { type: "string" },
      contrarian_opportunity: { type: "string" },
      format_gap: { type: "string" },
      timing_gap: { type: "string" },
      audience_underserved: { type: "string" },
      differentiation_score: { type: "number" },
      recommended_differentiator: { type: "string" },
      first_to_cover: { type: "array", items: { type: "string" } },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: selectedModel, temperature: 0.6, maxOutputTokens: 3500 });
  const topGap = (raw.content_gaps || [])[0];

  return {
    competitor_landscape: raw.competitor_landscape || [],
    content_gaps: raw.content_gaps || [],
    topics_covered: raw.topics_covered || [],
    unique_angle: raw.unique_angle || raw.recommended_differentiator || "",
    differentiation_strategy: raw.differentiation_strategy || "",
    urgency: (raw.urgency || "differentiate") as "first_mover" | "differentiate" | "skip",
    skip_reason: raw.skip_reason || "",
    dominant_narrative: raw.dominant_narrative || "",
    contrarian_opportunity: raw.contrarian_opportunity || "",
    format_gap: raw.format_gap || "",
    timing_gap: raw.timing_gap || "",
    audience_underserved: raw.audience_underserved || "",
    differentiation_score: raw.differentiation_score || 5,
    recommended_differentiator: raw.recommended_differentiator || "",
    first_to_cover: raw.first_to_cover || [],
    competitor_urls_checked: competitorUrls,
    learning_applied: learning.sampleSize > 0,
    high_value_gaps_from_memory: learning.highValueGapTypes.length,
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
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}"`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic}`, { run_id });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // ── Load competitor URLs from Supabase settings (spec requirement) ──
    const competitorUrls = await loadCompetitorUrls();
    console.log(`[${AGENT_NAME}] Competitor URLs: [${competitorUrls.join(", ")}]`);

    // ── Read scout output (graceful — may run in parallel) ──
    const scoutData = await readAgentOutput(run_id, "scout").catch(() => null);

    // ── Load learning context ──
    const learning = await loadCompetitorLearning(topicCategory);
    console.log(`[${AGENT_NAME}] Learning: ${learning.sampleSize} past runs, high-value gaps: [${learning.highValueGapTypes.join(", ")}]`);

    // ── Run competitor analysis ──
    const intelData = await analyzeCompetitors(topic, competitorUrls, scoutData, learning, selectedModel);
    if (intelData.urgency === "skip") {
      await insertLog("warning", AGENT_KEY, `⚠️ SKIP recommended: ${intelData.skip_reason}`, topic, { run_id });
    }

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, intelData, {
      tokens: Math.ceil(JSON.stringify(intelData).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      gaps_found: intelData.content_gaps.length,
      differentiation_score: intelData.differentiation_score,
      competitors_mapped: intelData.competitor_landscape.length,
      learning_applied: intelData.learning_applied,
    });

    // ── Write learning memory ──
    const topGap = intelData.content_gaps[0];
    if (topGap) {
      await writeCompetitorMemory(topicCategory, topGap.gap_type, intelData.recommended_differentiator);
    }

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${intelData.content_gaps.length} gaps found | differentiation=${intelData.differentiation_score}/10 | ${durationMs}ms`,
      { run_id }
    );

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      gaps_found: intelData.content_gaps.length,
      urgency: intelData.urgency,
      unique_angle: intelData.unique_angle,
      differentiation_score: intelData.differentiation_score,
      dominant_narrative: intelData.dominant_narrative,
      recommended_differentiator: intelData.recommended_differentiator,
      competitor_urls_checked: intelData.competitor_urls_checked?.length || 0,
      learning_applied: intelData.learning_applied,
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
