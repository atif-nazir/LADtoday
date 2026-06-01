// ============================================================
// Agent 10 — Account Manager Agent
// Phase: OPERATE | Depends on: analytics
// ============================================================
// Monitors competitor activity, social mentions, trending topics
// Uses Bright Data Web Scraper API for LinkedIn hiring signals
// Uses Bright Data SERP API for topic velocity monitoring
//
// This agent runs AFTER the pipeline completes to:
// 1. Monitor competitor responses to published content
// 2. Detect trending topic spikes for next pipeline run
// 3. Track LinkedIn hiring signals (GTM intelligence)
// 4. Store competitive intelligence for future runs
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiJson } from "../_shared/ai-provider.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "account-manager";
const AGENT_NAME = "Account Manager";

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN") || "";
const BRIGHTDATA_USERNAME = Deno.env.get("BRIGHTDATA_USERNAME") || "";
const BRIGHTDATA_PASSWORD = Deno.env.get("BRIGHTDATA_PASSWORD") || "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Bright Data SERP: Topic Velocity Monitoring ─────────────────────────────
// Detects if a topic is trending (more results = higher velocity)

async function checkTopicVelocity(topic: string): Promise<{
  result_count: number;
  trending: boolean;
  top_sources: string[];
  bright_data_used: boolean;
}> {
  if (!BRIGHTDATA_API_TOKEN) {
    return { result_count: 0, trending: false, top_sources: [], bright_data_used: false };
  }

  try {
    const params = new URLSearchParams({
      q: `${topic} site:dawn.com OR site:thenews.com.pk OR site:geo.tv OR site:arynews.tv`,
      gl: "pk",
      num: "10",
      tbs: "qdr:d", // last 24 hours
    });

    const response = await fetch(
      `https://api.brightdata.com/serp/google/search?${params}`,
      {
        headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` },
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!response.ok) return { result_count: 0, trending: false, top_sources: [], bright_data_used: false };

    const data = await response.json();
    const results = data.organic || [];
    const resultCount = results.length;
    const topSources = results.slice(0, 5).map((r: any) => {
      try { return new URL(r.link || r.url || "").hostname.replace("www.", ""); } catch { return ""; }
    }).filter(Boolean);

    return {
      result_count: resultCount,
      trending: resultCount >= 5, // 5+ results in 24h = trending
      top_sources: topSources,
      bright_data_used: true,
    };
  } catch (err) {
    console.error(`[${AGENT_NAME}] Topic velocity check failed:`, err);
    return { result_count: 0, trending: false, top_sources: [], bright_data_used: false };
  }
}

// ─── Bright Data Web Scraper API: LinkedIn Hiring Signals ────────────────────
// Detects competitor hiring activity as a GTM intelligence signal
// "Company X is hiring 10 engineers" = product launch signal

async function getLinkedInHiringSignals(topic: string): Promise<{
  signals: any[];
  bright_data_used: boolean;
}> {
  if (!BRIGHTDATA_API_TOKEN) {
    return { signals: [], bright_data_used: false };
  }

  // Only run for GTM/tech topics
  const isRelevant = /company|startup|tech|fintech|hiring|launch|product/i.test(topic);
  if (!isRelevant) return { signals: [], bright_data_used: false };

  try {
    const response = await fetch("https://api.brightdata.com/datasets/v3/trigger", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataset_id: "gd_l1viktl72bvl7bjuj0", // LinkedIn Jobs dataset
        include_errors: true,
        data: [{ keyword: topic, location: "Pakistan" }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return { signals: [], bright_data_used: false };

    const { snapshot_id } = await response.json();
    if (!snapshot_id) return { signals: [], bright_data_used: false };

    // Poll for completion (max 20s)
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        `https://api.brightdata.com/datasets/v3/snapshots/${snapshot_id}`,
        { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
      );
      const statusData = await statusRes.json();
      if (statusData.status === "ready") {
        const dataRes = await fetch(
          `https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}`,
          { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
        );
        const jobs = await dataRes.json();
        return {
          signals: Array.isArray(jobs) ? jobs.slice(0, 5) : [],
          bright_data_used: true,
        };
      }
    }

    return { signals: [], bright_data_used: true };
  } catch (err) {
    console.error(`[${AGENT_NAME}] LinkedIn signals failed:`, err);
    return { signals: [], bright_data_used: false };
  }
}

// ─── Competitive Intelligence Analysis ───────────────────────────────────────

async function analyzeCompetitiveIntelligence(
  topic: string,
  velocityData: any,
  hiringSignals: any,
  analyticsOutput: any,
  model: string
): Promise<{
  competitive_summary: string;
  next_topic_suggestions: string[];
  opportunity_score: number;
  competitor_activity: string;
  recommended_follow_up: string;
  gtm_signals: string[];
}> {
  const prompt = `You are the Account Manager agent for LADtoday — Pakistan's AI content platform.
Analyze competitive intelligence and suggest next content opportunities.

PUBLISHED TOPIC: ${topic}
TOPIC VELOCITY (24h): ${velocityData.result_count} results | trending=${velocityData.trending}
TOP SOURCES COVERING THIS: ${velocityData.top_sources.join(", ") || "none detected"}
LINKEDIN HIRING SIGNALS: ${hiringSignals.signals.length > 0 ? JSON.stringify(hiringSignals.signals.slice(0, 2)) : "none"}
PROJECTED VIEWS: ${analyticsOutput?.metrics?.projected_views || 0}
VIRALITY SCORE: ${analyticsOutput?.metrics?.virality_score || 5}/10

Return ONLY valid JSON:
{
  "competitive_summary": "2-3 sentence summary of competitive landscape for this topic",
  "next_topic_suggestions": ["3 follow-up topic ideas based on competitive gaps"],
  "opportunity_score": 7,
  "competitor_activity": "low|medium|high",
  "recommended_follow_up": "Specific recommendation for next article to publish",
  "gtm_signals": ["GTM signal 1 detected", "GTM signal 2 detected"]
}`;

  const schema = {
    type: "object",
    properties: {
      competitive_summary: { type: "string" },
      next_topic_suggestions: { type: "array", items: { type: "string" } },
      opportunity_score: { type: "number" },
      competitor_activity: { type: "string" },
      recommended_follow_up: { type: "string" },
      gtm_signals: { type: "array", items: { type: "string" } },
    },
    required: ["competitive_summary", "next_topic_suggestions", "opportunity_score", "competitor_activity", "recommended_follow_up", "gtm_signals"],
  };

  try {
    const { result } = await aiJson<any>("You are a competitive intelligence analyst", prompt, schema, { 
      model, 
      temperature: 0.5, 
      maxTokens: 600 
    });
    return result;
  } catch {
    return {
      competitive_summary: `Competitive analysis for "${topic}" completed. ${velocityData.trending ? "Topic is trending." : "Topic has moderate coverage."} (fallback)`,
      next_topic_suggestions: [`Follow-up on ${topic}`, `Deep dive: ${topic} impact on Pakistan`, `Expert analysis: ${topic}`],
      opportunity_score: velocityData.trending ? 8 : 5,
      competitor_activity: velocityData.result_count > 5 ? "high" : "medium",
      recommended_follow_up: `Publish a follow-up analysis on ${topic} within 48 hours`,
      gtm_signals: hiringSignals.signals.length > 0 ? ["LinkedIn hiring activity detected"] : [],
    };
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

    const { run_id, model_override } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const analyticsOutput = await readAgentOutput(run_id, "analytics");

    // Run competitive intelligence gathering in parallel
    console.log(`[${AGENT_NAME}] Gathering competitive intelligence via Bright Data...`);
    const [velocityData, hiringSignals] = await Promise.all([
      checkTopicVelocity(topic),
      getLinkedInHiringSignals(topic),
    ]);

    console.log(`[${AGENT_NAME}] Velocity: ${velocityData.result_count} results | trending=${velocityData.trending} | BD=${velocityData.bright_data_used}`);
    console.log(`[${AGENT_NAME}] LinkedIn signals: ${hiringSignals.signals.length} | BD=${hiringSignals.bright_data_used}`);

    // Analyze competitive intelligence
    const intelligence = await analyzeCompetitiveIntelligence(
      topic, velocityData, hiringSignals, analyticsOutput, selectedModel
    );

    const durationMs = Date.now() - startedAt;

    const output = {
      topic,
      topic_velocity: velocityData,
      linkedin_hiring_signals: hiringSignals,
      competitive_intelligence: intelligence,
      monitoring_schedule: {
        next_velocity_check: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
        next_competitor_check: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
        next_linkedin_check: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours
      },
      bright_data_calls: (velocityData.bright_data_used ? 1 : 0) + (hiringSignals.bright_data_used ? 1 : 0),
    };

    await writeAgentOutput(run_id, AGENT_KEY, output, { tokens: 400, duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      topic_trending: velocityData.trending,
      opportunity_score: intelligence.opportunity_score,
      competitor_activity: intelligence.competitor_activity,
      bright_data_calls: output.bright_data_calls,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `trending=${velocityData.trending} | opportunity=${intelligence.opportunity_score}/10 | BD_calls=${output.bright_data_calls} | ${durationMs}ms`,
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ ${durationMs}ms — opportunity=${intelligence.opportunity_score}/10 | trending=${velocityData.trending}`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      topic_trending: velocityData.trending,
      opportunity_score: intelligence.opportunity_score,
      next_topic_suggestions: intelligence.next_topic_suggestions,
      bright_data_calls: output.bright_data_calls,
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
