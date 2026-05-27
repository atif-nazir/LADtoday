// ============================================================
// Agent 06 — News Wire Agent
// Phase: DISCOVER | Model: gemini-2.5-flash | Depends on: scout
// Runs PARALLEL with intelligence, trend-forecaster, competitor-intel, audience-listener
// ============================================================
// LEARNING: Tracks which "breaking" classifications were accurate.
// If past breaking alerts led to priority publishes with high views,
// that validates the urgency scoring. If false alarms, it calibrates down.
// Core output: wire_items + has_breaking → Priority publish trigger
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";
import { selectModelForAgent, getModelInfo } from "../_shared/model-config.ts";

const AGENT_KEY = "news-wire";
const AGENT_NAME = "News Wire";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeSensitivity = "breaking" | "fresh" | "context" | "evergreen";
type AuthorityLevel = "government_statement" | "regulatory_body" | "agency_wire" | "official_press_release" | "news_brief" | "blog_mention";

interface WireItem {
  headline: string;
  summary: string;                  // 2-sentence summary
  source: string;
  authority: AuthorityLevel;
  time_sensitivity: TimeSensitivity;
  hours_old: number;
  urgency_score: number;            // 1-10
  publish_action: "publish_now" | "include_as_context" | "monitor" | "ignore";
  alert_text: string;
  breaking_brief?: string;          // 2-sentence brief for instant publish
}

interface NewsWireOutput {
  wire_items: WireItem[];
  has_breaking: boolean;
  priority_publish: boolean;
  breaking_count: number;
  fresh_count: number;
  topic_status: "breaking" | "developing" | "established" | "archive";
  instant_brief?: {
    headline: string; body: string;
    priority: "urgent" | "high" | "normal";
    publish_format: "breaking_brief" | "news_brief" | "full_article";
  };
  supplementary_context: string[];
  regulatory_mentions: string[];
  ticker_items: string[];
  news_cycle_position: string;
  recommended_coverage_timing: string;
  // Learning metadata
  calibrated_urgency_threshold: number;
  false_alarm_risk: "low" | "medium" | "high";
  learning_applied: boolean;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Tracks breaking news accuracy: was the breaking alert real and did it drive traffic?
// Calibrates urgency threshold based on false positive rate.

async function loadWireLearning(topicCategory: string): Promise<{
  accurateSources: string[];        // sources that were accurate in the past
  falseAlarmRate: number;           // 0-1, how often "breaking" was wrong
  calibratedUrgencyThreshold: number; // min urgency score to call "breaking" (default 7)
  avgViralityForBreaking: number;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data?.length) {
      return { accurateSources: [], falseAlarmRate: 0, calibratedUrgencyThreshold: 7, avgViralityForBreaking: 0, sampleSize: 0 };
    }

    // Calculate false alarm rate (breaking_predicted=true but views_week1 was low)
    const breakingPredictions = data.filter(m => m.was_breaking_predicted === true);
    const falseAlarms = breakingPredictions.filter(m =>
      m.actual_views_week1 !== null && m.actual_views_week1 < 500
    );
    const falseAlarmRate = breakingPredictions.length > 0
      ? falseAlarms.length / breakingPredictions.length
      : 0;

    // If false alarm rate > 30%, raise urgency threshold to be more conservative
    const calibratedUrgencyThreshold = falseAlarmRate > 0.3
      ? Math.min(9, 7 + Math.round(falseAlarmRate * 5))
      : 7;

    // Accurate sources (ones where breaking was real)
    const truePredictions = breakingPredictions.filter(m =>
      m.actual_views_week1 !== null && m.actual_views_week1 >= 500
    );
    const accurateSources = [...new Set(truePredictions.map(m => m.source_used).filter(Boolean))].slice(0, 5);

    const breakingViews = truePredictions.map(m => m.actual_views_week1 || 0);
    const avgViralityForBreaking = breakingViews.length > 0
      ? Math.round(breakingViews.reduce((a, b) => a + b, 0) / breakingViews.length)
      : 0;

    return { accurateSources, falseAlarmRate, calibratedUrgencyThreshold, avgViralityForBreaking, sampleSize: data.length };
  } catch {
    return { accurateSources: [], falseAlarmRate: 0, calibratedUrgencyThreshold: 7, avgViralityForBreaking: 0, sampleSize: 0 };
  }
}

async function writeWireMemory(
  topicCategory: string,
  wasBreakingPredicted: boolean,
  sourceUsed: string
): Promise<void> {
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: topicCategory,
      was_breaking_predicted: wasBreakingPredicted,
      source_used: sourceUsed,
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

// ─── Pakistani Official Wire Sources ──────────────────────────────────────────

const PAKISTAN_WIRE_SOURCES = {
  regulatory: ["State Bank of Pakistan (SBP)", "SECP", "PTA", "PMEX", "PSX", "FBR", "NEPRA", "OGRA"],
  government: ["PMO Pakistan", "Ministry of Finance", "Ministry of IT", "ECC", "ECNEC", "Federal Cabinet"],
  agencies: ["Dawn.com Breaking", "Geo News Wire", "APP (Associated Press of Pakistan)", "PPI News"],
  international: ["Reuters Pakistan", "Bloomberg Pakistan", "AFP Pakistan"],
};

// ─── Core Wire Monitoring ─────────────────────────────────────────────────────

async function monitorNewsWire(
  topic: string,
  dateStr: string,
  timeStr: string,
  scoutData: any,
  learning: Awaited<ReturnType<typeof loadWireLearning>>,
  selectedModel: string
): Promise<NewsWireOutput> {

  // Build context from scout data
  const scoutContext = scoutData
    ? `\n━━━ SCOUT SOURCES (recently published about this topic) ━━━
${(scoutData.sources || []).slice(0, 4).map((s: any, i: number) =>
    `  ${i + 1}. [${s.source_domain}] "${s.title}" | Age: ${s.publish_date} | Facts: ${(s.key_facts || []).slice(0, 2).join("; ")}`
  ).join("\n")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const learningSection = learning.sampleSize > 0
    ? `\n━━━ LEARNING: WIRE ACCURACY (${learning.sampleSize} past runs) ━━━
False Alarm Rate: ${(learning.falseAlarmRate * 100).toFixed(0)}%
Calibrated Urgency Threshold: ${learning.calibratedUrgencyThreshold}/10 (min to call "breaking")
High-Accuracy Sources: ${learning.accurateSources.join(", ") || "insufficient data"}
Avg Views When Breaking Was Real: ${learning.avgViralityForBreaking.toLocaleString()}
INSTRUCTION: Only flag as breaking if urgency_score >= ${learning.calibratedUrgencyThreshold}.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a news wire monitor for LADtoday — Pakistan's leading AI-powered digital media platform.

TOPIC: "${topic}"
CURRENT DATE: ${dateStr} | TIME: ${timeStr} PKT
${scoutContext}
${learningSection}

WIRE SOURCES TO MONITOR:
Regulatory Bodies: ${PAKISTAN_WIRE_SOURCES.regulatory.join(", ")}
Government: ${PAKISTAN_WIRE_SOURCES.government.join(", ")}
News Agencies: ${PAKISTAN_WIRE_SOURCES.agencies.join(", ")}
International: ${PAKISTAN_WIRE_SOURCES.international.join(", ")}

━━━ WIRE MONITORING PROTOCOL ━━━

URGENCY SCORING (1-10):
10 = Active emergency, SBP rate announcement, cabinet decision in last 2 hours
7-9 = Official statement, regulatory action, market-moving news (same day)
4-6 = Policy discussion, industry report, company announcement (this week)
1-3 = Evergreen context, background information (older)

TIME CATEGORIES:
- BREAKING: < 4 hours old — Generate instant brief, flag priority publish
- FRESH: 4-24 hours — Include as supplementary context
- CONTEXT: 1-7 days — Reference for depth
- EVERGREEN: > 7 days — Background only

BREAKING BRIEF FORMAT (only if has_breaking = true):
"⚡ BREAKING: [One-sentence headline.] [Second sentence with key detail.] — Source: [Source]"
Must be publishable as standalone news brief in under 5 minutes.

AUTHORITY LEVELS:
government_statement > regulatory_body > agency_wire > official_press_release > news_brief > blog_mention

${learning.calibratedUrgencyThreshold > 7 ? `⚠️ CALIBRATED: Due to ${(learning.falseAlarmRate * 100).toFixed(0)}% past false alarm rate, only set has_breaking=true if urgency_score >= ${learning.calibratedUrgencyThreshold}` : ""}

IMPORTANT: If no breaking news exists, has_breaking=false is CORRECT — don't force alerts.
Provide accurate news cycle positioning instead.

Return JSON:
{
  "wire_items": [
    {
      "headline": "string",
      "summary": "string (exactly 2 sentences)",
      "source": "string (e.g. 'SBP Press Release')",
      "authority": "government_statement|regulatory_body|agency_wire|official_press_release|news_brief|blog_mention",
      "time_sensitivity": "breaking|fresh|context|evergreen",
      "hours_old": number (estimated),
      "urgency_score": number (1-10),
      "publish_action": "publish_now|include_as_context|monitor|ignore",
      "alert_text": "string (⚡ for breaking, 📰 for fresh, 📋 for context)",
      "breaking_brief": "string (only for breaking items — 2-sentence publishable brief)"
    }
  ],
  "has_breaking": boolean,
  "priority_publish": boolean,
  "breaking_count": number,
  "fresh_count": number,
  "topic_status": "breaking|developing|established|archive",
  "instant_brief": {
    "headline": "string",
    "body": "string (2 sentences, publishable immediately)",
    "priority": "urgent|high|normal",
    "publish_format": "breaking_brief|news_brief|full_article"
  },
  "supplementary_context": ["string (5-7 key contextual points for the article)"],
  "regulatory_mentions": ["string (specific Pakistani regulatory body statements)"],
  "ticker_items": ["string (3-5 short strings for real-time dashboard ticker)"],
  "news_cycle_position": "string (where in news cycle — early/mid/late/post-cycle)",
  "recommended_coverage_timing": "string (when LADtoday should publish for max impact)"
}`;

  const schema = {
    type: "object",
    properties: {
      wire_items: { type: "array", items: { type: "object", properties: {
        headline: { type: "string" }, summary: { type: "string" }, source: { type: "string" },
        authority: { type: "string" }, time_sensitivity: { type: "string" }, hours_old: { type: "number" },
        urgency_score: { type: "number" }, publish_action: { type: "string" }, alert_text: { type: "string" }, breaking_brief: { type: "string" },
      } } },
      has_breaking: { type: "boolean" }, priority_publish: { type: "boolean" },
      breaking_count: { type: "integer" }, fresh_count: { type: "integer" },
      topic_status: { type: "string" },
      instant_brief: { type: "object", properties: { headline: { type: "string" }, body: { type: "string" }, priority: { type: "string" }, publish_format: { type: "string" } } },
      supplementary_context: { type: "array", items: { type: "string" } },
      regulatory_mentions: { type: "array", items: { type: "string" } },
      ticker_items: { type: "array", items: { type: "string" } },
      news_cycle_position: { type: "string" },
      recommended_coverage_timing: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: selectedModel,
    temperature: 0.45, // Low temp: factual news classification
    maxOutputTokens: 2500,
  });

  return {
    wire_items: raw.wire_items || [],
    has_breaking: raw.has_breaking || false,
    priority_publish: raw.priority_publish || false,
    breaking_count: raw.breaking_count || 0,
    fresh_count: raw.fresh_count || 0,
    topic_status: raw.topic_status || "established",
    instant_brief: raw.instant_brief,
    supplementary_context: raw.supplementary_context || [],
    regulatory_mentions: raw.regulatory_mentions || [],
    ticker_items: raw.ticker_items || [],
    news_cycle_position: raw.news_cycle_position || "",
    recommended_coverage_timing: raw.recommended_coverage_timing || "",
    calibrated_urgency_threshold: learning.calibratedUrgencyThreshold,
    false_alarm_risk: learning.falseAlarmRate > 0.3 ? "high" : learning.falseAlarmRate > 0.15 ? "medium" : "low",
    learning_applied: true,
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
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour12: true });

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}"`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic} at ${timeStr} PKT`, { run_id });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // Read scout data (graceful — may run in parallel)
    const scoutData = await readAgentOutput(run_id, "scout").catch(() => null);

    // Load wire learning calibration
    console.log(`[${AGENT_NAME}] Loading wire calibration for category="${topicCategory}"...`);
    const learning = await loadWireLearning(topicCategory);
    console.log(`[${AGENT_NAME}] Calibration: threshold=${learning.calibratedUrgencyThreshold}, false_alarm=${(learning.falseAlarmRate * 100).toFixed(0)}%, n=${learning.sampleSize}`);

    // Monitor news wire
    const wireData = await monitorNewsWire(topic, dateStr, timeStr, scoutData, learning, selectedModel);

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, wireData, {
      tokens: Math.ceil(JSON.stringify(wireData).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      has_breaking: wireData.has_breaking,
      priority_publish: wireData.priority_publish,
      topic_status: wireData.topic_status,
      wire_items_count: wireData.wire_items.length,
      calibrated_urgency_threshold: wireData.calibrated_urgency_threshold,
    });

    // Write learning memory
    const topSource = wireData.wire_items[0]?.source || "";
    await writeWireMemory(topicCategory, wireData.has_breaking, topSource);

    // Special handling for breaking news: log as warning to catch attention in logs
    if (wireData.has_breaking) {
      await insertLog("warning", AGENT_KEY, `⚡ BREAKING NEWS DETECTED`,
        `${wireData.breaking_count} breaking items for "${topic}" | threshold=${wireData.calibrated_urgency_threshold}`, { run_id }
      );
    }

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `breaking=${wireData.has_breaking} | fresh=${wireData.fresh_count} | status=${wireData.topic_status} | calibrated=${wireData.learning_applied} | ${durationMs}ms`,
      { run_id }
    );

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      has_breaking: wireData.has_breaking,
      priority_publish: wireData.priority_publish,
      topic_status: wireData.topic_status,
      wire_items_count: wireData.wire_items.length,
      calibrated_urgency_threshold: wireData.calibrated_urgency_threshold,
      false_alarm_risk: wireData.false_alarm_risk,
      learning_applied: wireData.learning_applied,
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
