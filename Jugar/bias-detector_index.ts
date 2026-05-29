// ============================================================
// Agent 09 — Bias Detector Agent
// Phase: ANALYZE | Model: gemini-2.5-pro | Depends on: research
// ============================================================
// Core job: Detect framing bias, political slant, source selection
// bias, and missing perspectives. Ensures balanced coverage that
// protects LADtoday from bias allegations and builds trust.
//
// LEARNING: Tracks which bias types appear most in which topic
// categories. Adapts detection focus to known problem areas.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "bias-detector";
const AGENT_NAME = "Bias Detector";
const MODEL = "gemini-2.5-pro";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface BiasInstance {
  bias_type: "political" | "source_selection" | "framing" | "omission" | "language" | "confirmation";
  severity: "critical" | "moderate" | "mild";
  description: string;
  example_text: string;
  correction: string;
  affected_parties: string[];
}

interface MissingPerspective {
  perspective: string; why_important: string;
  how_to_include: string; urgency: "critical" | "recommended" | "optional";
}

interface BiasDetectorOutput {
  bias_instances: BiasInstance[];
  missing_perspectives: MissingPerspective[];
  // Spec exact output fields (LADtoday_50_AGENTS.md)
  overall_bias_score: number;        // 0-1 (spec: 0=neutral, 1=heavily biased)
  political_lean: "left" | "center-left" | "center" | "center-right" | "right" | "neutral";
  political_lean_confidence: number;
  source_diversity_score: number;    // 0-10
  representation_score: number;      // 0-10
  gender_representation_score: number; // 0-10: are women quoted?
  urban_rural_framing: string;       // "urban-centric" | "balanced" | "rural-focused"
  foreign_domestic_framing: string;  // "western-centric" | "balanced" | "Pakistan-centric"
  economic_lean: "pro-business" | "consumer-advocacy" | "balanced"; // spec: economic bias axis
  balance_directive: string;         // SINGULAR — spec exact key: consumed by Rewrite Agent
  balance_directives: string[];      // plural alias for compatibility
  // Extended
  overall_bias_level: "high" | "moderate" | "low" | "minimal"; // computed from overall_bias_score
  safe_voices_to_add: string[];
  phrases_to_avoid: string[];
  phrases_to_replace: Record<string, string>;
  bias_summary: string;
  learning_applied: boolean;
  dominant_bias_type: string;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadBiasLearning(topicCategory: string): Promise<{
  commonBiasTypes: string[];
  avgBiasLevel: string;
  problematicSources: string[];
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data?.length) return { commonBiasTypes: [], avgBiasLevel: "moderate", problematicSources: [], sampleSize: 0 };

    const biasCounts: Record<string, number> = {};
    const biasLevels: Record<string, number> = { high: 0, moderate: 0, low: 0, minimal: 0 };
    const allSources: string[] = [];

    for (const m of data) {
      if (m.dominant_bias_type) biasCounts[m.dominant_bias_type] = (biasCounts[m.dominant_bias_type] || 0) + 1;
      if (m.bias_level) biasLevels[m.bias_level] = (biasLevels[m.bias_level] || 0) + 1;
      if (m.problematic_source) allSources.push(m.problematic_source);
    }

    const commonBiasTypes = Object.entries(biasCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([t]) => t);
    const avgBiasLevel = Object.entries(biasLevels).sort(([, a], [, b]) => b - a)[0]?.[0] || "moderate";
    const problematicSources = [...new Set(allSources)].slice(0, 4);

    return { commonBiasTypes, avgBiasLevel, problematicSources, sampleSize: data.length };
  } catch {
    return { commonBiasTypes: [], avgBiasLevel: "moderate", problematicSources: [], sampleSize: 0 };
  }
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

// ─── Core Bias Detection ──────────────────────────────────────────────────────

async function detectBias(
  topic: string,
  intelOutput: any,
  researchOutput: any,
  scoutOutput: any,
  topicCategory: string,
  learning: Awaited<ReturnType<typeof loadBiasLearning>>
): Promise<BiasDetectorOutput> {

  const contentBrief = intelOutput?.content_brief || "";
  const bestAngle = intelOutput?.best_angle || "";
  const missingPerspectives = intelOutput?.missing_perspectives || [];
  const sources = (scoutOutput?.sources || []).map((s: any) => `${s.source_domain} (credibility: ${((s.credibility_score || 0.5) * 10).toFixed(1)}/10)`).join(", ");
  const sourceDomains = (scoutOutput?.sources || []).map((s: any) => s.source_domain);

  const learningSection = learning.sampleSize > 0
    ? `\n━━━ LEARNING: BIAS PATTERNS IN PAST RUNS (${learning.sampleSize} runs) ━━━
MOST COMMON BIAS TYPES: ${learning.commonBiasTypes.join(", ")}
AVG BIAS LEVEL FOR THIS CATEGORY: ${learning.avgBiasLevel}
HISTORICALLY PROBLEMATIC SOURCES: ${learning.problematicSources.join(", ") || "none documented"}
INSTRUCTION: Apply extra scrutiny to "${learning.commonBiasTypes[0] || "framing"}" bias — most common for this category.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a media bias analyst for LADtoday — Pakistan's AI content platform.
Your job: Detect bias in the proposed article angle and source selection before writing begins.
Bias costs LADtoday credibility, drives Twitter criticism, and invites regulatory scrutiny.

TOPIC: "${topic}"
TOPIC CATEGORY: ${topicCategory}
${learningSection}

PROPOSED ARTICLE ANGLE: "${bestAngle}"

CONTENT BRIEF EXCERPT:
${contentBrief.slice(0, 600)}

SOURCE SELECTION: ${sources}
Missing perspectives already noted by Intelligence Agent: ${missingPerspectives.join(", ") || "none"}

━━━ SPEC REQUIRED: 5 BIAS DIMENSIONS ━━━

1. POLITICAL BIAS:
   - Does the angle favor a political party, government, or ideology?
   - Pakistan context: PTI vs PML-N vs PPP vs establishment framing
   - Rate political lean: left|center-left|center|center-right|right|neutral
   - political_lean_confidence: 0-100

2. SOURCE SELECTION BIAS (Economic lean):
   - Are sources diverse? Rate source_diversity_score: 0-10
   - Detect economic_lean: pro-business | consumer-advocacy | balanced

3. GENDER REPRESENTATION:
   - Are women quoted? Is gender balance addressed?
   - gender_representation_score: 0-10 (10 = excellent balance)

4. URBAN vs RURAL FRAMING:
   - Is the story told only from Lahore/Karachi lens?
   - urban_rural_framing: "urban-centric" | "balanced" | "rural-focused"

5. FOREIGN vs DOMESTIC FRAMING:
   - Is Western framing being applied to a Pakistani topic?
   - Does it compare Pakistan negatively to foreign standards without Pakistani context?
   - foreign_domestic_framing: "western-centric" | "balanced" | "Pakistan-centric"

COMPUTE:
- overall_bias_score: float 0-1 (spec: 0=neutral, 1=heavily biased)
  Formula: average of all 5 bias dimensions, weighted by severity

BALANCE DIRECTIVE (spec: single string consumed by Rewrite Agent):
Write one comprehensive instruction starting with an action verb.
Example: "Add perspective from middle-class Lahori entrepreneur; balance pro-SBP framing with consumer impact data; replace 'reckless spending' with 'increased fiscal deficit'"

Return JSON:
{
  "bias_instances": [
    {"bias_type":"political|source_selection|framing|omission|language|confirmation","severity":"critical|moderate|mild","description":"string","example_text":"string","correction":"string","affected_parties":["string"]}
  ],
  "missing_perspectives": [
    {"perspective":"string","why_important":"string","how_to_include":"string","urgency":"critical|recommended|optional"}
  ],
  "overall_bias_score": number (0-1 float),
  "political_lean": "left|center-left|center|center-right|right|neutral",
  "political_lean_confidence": number (0-100),
  "source_diversity_score": number (0-10),
  "representation_score": number (0-10),
  "gender_representation_score": number (0-10),
  "urban_rural_framing": "urban-centric|balanced|rural-focused",
  "foreign_domestic_framing": "western-centric|balanced|Pakistan-centric",
  "economic_lean": "pro-business|consumer-advocacy|balanced",
  "overall_bias_level": "high|moderate|low|minimal",
  "balance_directive": "string (single actionable instruction for Rewrite Agent)",
  "balance_directives": ["string (detailed list)"],
  "safe_voices_to_add": ["string"],
  "phrases_to_avoid": ["string"],
  "phrases_to_replace": {"biased_phrase": "neutral_replacement"},
  "bias_summary": "string (2 sentences for editor)"
}`;

  const schema = {
    type: "object",
    properties: {
      bias_instances: { type: "array", items: { type: "object", properties: {
        bias_type: { type: "string" }, severity: { type: "string" }, description: { type: "string" },
        example_text: { type: "string" }, correction: { type: "string" }, affected_parties: { type: "array", items: { type: "string" } },
      } } },
      missing_perspectives: { type: "array", items: { type: "object", properties: {
        perspective: { type: "string" }, why_important: { type: "string" },
        how_to_include: { type: "string" }, urgency: { type: "string" },
      } } },
      overall_bias_score: { type: "number" },
      political_lean: { type: "string" }, political_lean_confidence: { type: "number" },
      source_diversity_score: { type: "number" }, representation_score: { type: "number" },
      gender_representation_score: { type: "number" },
      urban_rural_framing: { type: "string" },
      foreign_domestic_framing: { type: "string" },
      economic_lean: { type: "string" },
      overall_bias_level: { type: "string" },
      balance_directive: { type: "string" },
      balance_directives: { type: "array", items: { type: "string" } },
      safe_voices_to_add: { type: "array", items: { type: "string" } },
      phrases_to_avoid: { type: "array", items: { type: "string" } },
      phrases_to_replace: { type: "object" },
      bias_summary: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: MODEL, temperature: 0.4, maxOutputTokens: 4096,
  });

  const instances: BiasInstance[] = raw.bias_instances || [];
  const dominantBiasType = instances.reduce((best: any, curr: any) => {
    if (!best || curr.severity === "critical") return curr;
    return best;
  }, null)?.bias_type || "none";

  // Derive overall_bias_score (0-1) from bias level per spec
  const biasLevelToScore: Record<string, number> = { high: 0.8, moderate: 0.5, low: 0.25, minimal: 0.05 };
  const overallBiasScore = raw.overall_bias_score ?? biasLevelToScore[raw.overall_bias_level || "moderate"] ?? 0.5;
  const overallBiasLevel: "high" | "moderate" | "low" | "minimal" =
    overallBiasScore > 0.65 ? "high" : overallBiasScore > 0.35 ? "moderate" : overallBiasScore > 0.15 ? "low" : "minimal";

  // Write learning
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: topicCategory,
      dominant_bias_type: dominantBiasType, bias_level: overallBiasLevel,
      problematic_source: sourceDomains[0] || null, created_at: new Date().toISOString(),
    });
  } catch { /**/ }

  return {
    bias_instances: instances,
    missing_perspectives: raw.missing_perspectives || [],
    overall_bias_score: overallBiasScore,
    political_lean: raw.political_lean || "center",
    political_lean_confidence: raw.political_lean_confidence || 50,
    source_diversity_score: raw.source_diversity_score || 5,
    representation_score: raw.representation_score || 5,
    gender_representation_score: raw.gender_representation_score || 5,
    urban_rural_framing: raw.urban_rural_framing || "urban-centric",
    foreign_domestic_framing: raw.foreign_domestic_framing || "balanced",
    economic_lean: raw.economic_lean || "balanced",
    balance_directive: raw.balance_directive || (raw.balance_directives || [])[0] || "",
    balance_directives: raw.balance_directives || [],
    overall_bias_level: overallBiasLevel,
    safe_voices_to_add: raw.safe_voices_to_add || [],
    phrases_to_avoid: raw.phrases_to_avoid || [],
    phrases_to_replace: raw.phrases_to_replace || {},
    bias_summary: raw.bias_summary || "",
    learning_applied: learning.sampleSize > 0,
    dominant_bias_type: dominantBiasType,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch { /**/ }
  return false;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    if (!await verifyServiceOrAdmin(req)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const topicCategory = inferTopicCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [researchOut, intelOut, scoutOut] = await Promise.all([
      readAgentOutput(run_id, "research"),
      readAgentOutput(run_id, "intelligence").catch(() => null),
      readAgentOutput(run_id, "scout").catch(() => null),
    ]);
    if (!researchOut) throw new Error("research output not found");

    const learning = await loadBiasLearning(topicCategory);
    const result = await detectBias(topic, intelOut, researchOut, scoutOut, topicCategory, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      bias_instances: result.bias_instances.length, overall_bias_level: result.overall_bias_level,
      political_lean: result.political_lean, source_diversity_score: result.source_diversity_score,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `bias=${result.overall_bias_level} instances=${result.bias_instances.length} lean=${result.political_lean} diversity=${result.source_diversity_score} ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      bias_instances: result.bias_instances.length, overall_bias_level: result.overall_bias_level,
      political_lean: result.political_lean, source_diversity_score: result.source_diversity_score,
      learning_applied: result.learning_applied, duration_ms: durationMs,
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
    } catch { /**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
