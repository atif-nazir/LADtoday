// ============================================================
// Agent 10 — Story Arc Agent
// Phase: ANALYZE | Model: gemini-2.5-pro | Depends on: research, trend-forecaster, audience-listener
// ============================================================
// Core job: Choose the optimal article structure and build a detailed
// narrative blueprint. Reduces Rewrite Agent's cognitive load by
// pre-computing: structure type, section headings, content flow,
// word targets per section, hook + close strategy.
//
// LEARNING: Tracks which structure types led to highest engagement
// (time-on-page, scroll depth). Adapts structure selection to proven winners.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "story-arc";
const AGENT_NAME = "Story Arc";
const MODEL = "gemini-2.5-pro"; // Pro: narrative architecture requires deep reasoning

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlueprintSection {
  heading: string; heading_alternatives: string[];
  purpose: string; content_points: string[];
  target_words: number; must_include_facts: string[];
  tone_for_section: string; transition_from_previous: string;
  engagement_hook: string;
}

interface StoryArcOutput {
  structure_type: string;            // "explainer"|"analysis"|"listicle"|"narrative"|"problem-solution"|"how-to"|"investigation"|"comparison"
  structure_rationale: string;
  sections: BlueprintSection[];
  hook_type: "stat" | "question" | "scene" | "controversy" | "quote" | "anecdote";
  hook_text: string;                 // The actual opening hook sentence
  recommended_tone: string;
  word_count_target: number;
  subheading_count: number;
  opening_strategy: string;
  closing_strategy: string;
  climax_position: string;
  pacing_notes: string;
  // Spec: output key is 'story_blueprint' (Rewrite Agent reads this directly)
  story_blueprint: {
    structure_type: string;
    sections: BlueprintSection[];
    hook_type: string;
    hook_text: string;
    word_count_target: number;
    recommended_tone: string;
    opening_strategy: string;
    closing_strategy: string;
  };
  // Learning metadata
  structure_chosen_because: string;
  learning_applied: boolean;
  past_top_structure: string;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadStoryArcLearning(topicCategory: string): Promise<{
  topStructures: string[];           // structures with highest engagement
  avgWordCountHighPerformers: number;
  bestHookType: string;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("actual_views_week1", { ascending: false })
      .limit(20);

    if (!data?.length) return { topStructures: [], avgWordCountHighPerformers: 1200, bestHookType: "stat", sampleSize: 0 };

    const structureCounts: Record<string, number> = {};
    const hookCounts: Record<string, number> = {};
    let totalWords = 0; let count = 0;
    for (const m of data) {
      if (m.structure_type) structureCounts[m.structure_type] = (structureCounts[m.structure_type] || 0) + 1;
      if (m.hook_type) hookCounts[m.hook_type] = (hookCounts[m.hook_type] || 0) + 1;
      if (m.word_count_target) { totalWords += m.word_count_target; count++; }
    }
    const topStructures = Object.entries(structureCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([t]) => t);
    const bestHookType = Object.entries(hookCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "stat";
    return { topStructures, avgWordCountHighPerformers: count > 0 ? Math.round(totalWords / count) : 1200, bestHookType, sampleSize: data.length };
  } catch {
    return { topStructures: [], avgWordCountHighPerformers: 1200, bestHookType: "stat", sampleSize: 0 };
  }
}

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp/.test(t)) return "fintech";
  if (/startup|tech|ai/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation|rupee/.test(t)) return "economy";
  return "general";
}

// ─── Core Story Arc ───────────────────────────────────────────────────────────

const STRUCTURE_TYPES = {
  "explainer": "What/Why/How format — ideal for complex topics, educational, builds authority",
  "analysis": "Deep-dive with multiple perspectives — ideal for policy, markets, controversial topics",
  "listicle": "Numbered/bulleted key points — high skim-readability, drives shares",
  "narrative": "Story-driven, human angle, characters — high time-on-page, emotional",
  "problem-solution": "Problem → Impact → Solution — ideal for actionable, helpful content",
  "how-to": "Step-by-step guide — high bookmark rate, evergreen value",
  "investigation": "Reveal, evidence, response — high shares, controversy, social media traction",
  "comparison": "A vs B — drives debate, comments, high engagement",
};

async function buildStoryArc(
  topic: string,
  intelligence: any,
  trendData: any,
  audienceData: any,
  researchData: any,
  topicCategory: string,
  learning: Awaited<ReturnType<typeof loadStoryArcLearning>>
): Promise<StoryArcOutput> {

  const learningSection = learning.sampleSize > 0
    ? `\n━━━ LEARNING: STRUCTURES THAT WIN FOR THIS CATEGORY (${learning.sampleSize} past runs) ━━━
TOP-PERFORMING STRUCTURES: ${learning.topStructures.join(", ")}
AVG WORD COUNT IN TOP ARTICLES: ${learning.avgWordCountHighPerformers}
BEST HOOK TYPE: ${learning.bestHookType}
INSTRUCTION: Strongly prefer "${learning.topStructures[0] || "analysis"}" structure unless content strongly suggests otherwise.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a narrative architect for LADtoday — Pakistan's AI content platform.
Your blueprint will be executed by the Rewrite Agent — make it detailed enough they can write word-by-word.

TOPIC: "${topic}"
CATEGORY: ${topicCategory}
${learningSection}

INPUTS FROM UPSTREAM AGENTS:
BEST ANGLE (Intelligence): ${intelligence?.best_angle || "N/A"}
CONTENT BRIEF: ${(intelligence?.content_brief || "").slice(0, 500)}
VIRALITY SCORE: ${intelligence?.virality_score || 5}/10
TREND: ${trendData?.trajectory || "stable"}, momentum=${trendData?.trend_momentum || 5}/10, publish="${trendData?.optimal_publish || "now"}"
AUDIENCE: ${audienceData?.primary_segment?.segment_name || "Pakistani Professional"}, knowledge=${audienceData?.knowledge_level || "intermediate"}, preferred tone="${audienceData?.preferred_tone || "professional"}"
EMOTIONAL HOOK TARGET: ${audienceData?.emotional_hook || "surprise"}
DOMINANT PAIN POINT: ${audienceData?.dominant_pain_point || "N/A"}
AUTHORITATIVE SOURCES FOUND: ${researchData?.verified_statistics?.length || 0} verified stats, ${researchData?.government_source_found ? "GOV SOURCE ✓" : "no gov source"}
Pakistan SPECIFIC DATA: ${(researchData?.pakistan_specific_data || []).slice(0, 2).join(" | ")}

AVAILABLE STRUCTURE TYPES:
${Object.entries(STRUCTURE_TYPES).map(([k, v]) => `- ${k.toUpperCase()}: ${v}`).join("\n")}

━━━ STORY ARCHITECTURE MISSION ━━━

1. SELECT OPTIMAL STRUCTURE:
   Consider:
   - Topic complexity (${intelligence?.topic_complexity || "moderate"})
   - Audience knowledge level (${audienceData?.knowledge_level || "intermediate"})
   - Trend urgency (${trendData?.optimal_publish || "now"} → "now" favors news format)
   - Virality score (${intelligence?.virality_score || 5}/10 → high score favors investigation/listicle)
   ${learning.topStructures.length > 0 ? `- Learning data shows "${learning.topStructures[0]}" performs best for this category` : ""}
   
2. DESIGN EACH SECTION (4-7 sections):
   For each section:
   - heading: compelling H2 (not generic, must be scannable)
   - heading_alternatives: 2 variations
   - purpose: why this section exists in the narrative
   - content_points: 3-5 specific points to cover (not vague — cite what research found)
   - target_words: exact word target
   - must_include_facts: specific facts from research that belong here
   - tone_for_section: how this section should feel (urgent/analytical/empathetic)
   - transition_from_previous: how to connect to previous section
   - engagement_hook: what within-section element drives continued reading

3. CRAFT THE OPENING HOOK:
   Type: ${learning.bestHookType || "stat"} (learning-informed)
   Must: capture attention in first 8 words
   Must: make the reader feel this article is worth their time
   Provide the actual hook text (first 2-3 sentences of article)

4. CLOSING STRATEGY:
   How to end the article that drives:
   - Share motivation (they want others to know this)
   - Return visit (they'll want to follow up)
   - Action (what should the reader do with this information?)

Return JSON:
{
  "structure_type": "explainer|analysis|listicle|narrative|problem-solution|how-to|investigation|comparison",
  "structure_rationale": "string (why this structure, including learning influence)",
  "sections": [
    {
      "heading": "string (compelling H2)",
      "heading_alternatives": ["string", "string"],
      "purpose": "string",
      "content_points": ["string (specific point 1)", "string", "string"],
      "target_words": number (150-400),
      "must_include_facts": ["string (specific fact from research)"],
      "tone_for_section": "string",
      "transition_from_previous": "string (how to connect, or 'opening' for first)",
      "engagement_hook": "string (what keeps reader going through this section)"
    }
  ],
  "hook_type": "stat|question|scene|controversy|quote|anecdote",
  "hook_text": "string (first 2-3 sentences of the article, ready to use)",
  "recommended_tone": "string",
  "word_count_target": number (800-2500),
  "subheading_count": number,
  "opening_strategy": "string (detailed opening strategy for Rewrite Agent)",
  "closing_strategy": "string (how to close for max share/return)",
  "climax_position": "string (where the most impactful revelation goes)",
  "pacing_notes": "string (how to manage reading pace — where to speed up, slow down)",
  "structure_chosen_because": "string (concise justification)"
}`;

  const schema = {
    type: "object",
    properties: {
      structure_type: { type: "string" }, structure_rationale: { type: "string" },
      sections: { type: "array", items: { type: "object", properties: {
        heading: { type: "string" }, heading_alternatives: { type: "array", items: { type: "string" } },
        purpose: { type: "string" }, content_points: { type: "array", items: { type: "string" } },
        target_words: { type: "integer" }, must_include_facts: { type: "array", items: { type: "string" } },
        tone_for_section: { type: "string" }, transition_from_previous: { type: "string" }, engagement_hook: { type: "string" },
      } } },
      hook_type: { type: "string" }, hook_text: { type: "string" },
      recommended_tone: { type: "string" }, word_count_target: { type: "integer" },
      subheading_count: { type: "integer" }, opening_strategy: { type: "string" },
      closing_strategy: { type: "string" }, climax_position: { type: "string" },
      pacing_notes: { type: "string" }, structure_chosen_because: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.6, maxOutputTokens: 5120 });

  // Write learning
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: topicCategory,
      structure_type: raw.structure_type || "analysis",
      hook_type: raw.hook_type || "stat",
      word_count_target: raw.word_count_target || 1200,
      actual_views_week1: null, created_at: new Date().toISOString(),
    });
  } catch { /**/ }

  const result: StoryArcOutput = {
    structure_type: raw.structure_type || "analysis",
    structure_rationale: raw.structure_rationale || "",
    sections: raw.sections || [],
    hook_type: raw.hook_type || "stat",
    hook_text: raw.hook_text || "",
    recommended_tone: raw.recommended_tone || "analytical",
    word_count_target: raw.word_count_target || 1200,
    subheading_count: raw.subheading_count || (raw.sections || []).length,
    opening_strategy: raw.opening_strategy || "",
    closing_strategy: raw.closing_strategy || "",
    climax_position: raw.climax_position || "middle",
    pacing_notes: raw.pacing_notes || "",
    structure_chosen_because: raw.structure_chosen_because || "",
    learning_applied: learning.sampleSize > 0,
    past_top_structure: learning.topStructures[0] || "none",
    // spec: story_blueprint — consumed by Rewrite Agent directly
    story_blueprint: {
      structure_type: raw.structure_type || "analysis",
      sections: raw.sections || [],
      hook_type: raw.hook_type || "stat",
      hook_text: raw.hook_text || "",
      word_count_target: raw.word_count_target || 1200,
      recommended_tone: raw.recommended_tone || "analytical",
      opening_strategy: raw.opening_strategy || "",
      closing_strategy: raw.closing_strategy || "",
    },
  };
  return result;
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

    const [intelOut, trendOut, audienceOut, researchOut] = await Promise.all([
      readAgentOutput(run_id, "intelligence"),
      readAgentOutput(run_id, "trend-forecaster").catch(() => null),
      readAgentOutput(run_id, "audience-listener").catch(() => null),
      readAgentOutput(run_id, "research"),
    ]);
    if (!researchOut) throw new Error("research output not found");

    const learning = await loadStoryArcLearning(topicCategory);
    console.log(`[${AGENT_NAME}] Learning: n=${learning.sampleSize} top="${learning.topStructures[0] || "none"}" best_hook="${learning.bestHookType}"`);

    const result = await buildStoryArc(topic, intelOut, trendOut, audienceOut, researchOut, topicCategory, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      structure_type: result.structure_type, sections: result.sections.length,
      word_count_target: result.word_count_target, hook_type: result.hook_type, learning_applied: result.learning_applied,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `structure=${result.structure_type} sections=${result.sections.length} words=${result.word_count_target} hook=${result.hook_type} ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      structure_type: result.structure_type, sections: result.sections.length,
      word_count_target: result.word_count_target, hook_type: result.hook_type,
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
