// ============================================================
// Agent 02 — Intelligence Agent
// Phase: DISCOVER | Model: gemini-2.5-pro | Depends on: scout
// ============================================================
// LEARNING: Reads past run virality scores from agent_memory.
// Adapts angle-selection strategy based on what performed best.
// Writes back performance signal after publishing downstream.
// Core output: content_brief used by ALL 7 Phase 2 agents.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "intelligence";
const AGENT_NAME = "Intelligence";
const MODEL = "gemini-2.5-pro"; // Pro: deep multi-source reasoning, content_brief accuracy critical

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FactItem {
  fact: string;
  source_domain: string;
  source_index: number;
  confidence: "high" | "medium" | "low";
  fact_type: "statistic" | "event" | "policy" | "quote" | "name" | "general";
}

interface Contradiction {
  claim_a: string; source_a_domain: string;
  claim_b: string; source_b_domain: string;
  severity: "minor" | "major";
  resolution: string; recommended_version: string;
}

interface EntityMention {
  name: string;
  type: "person" | "organization" | "place" | "regulation" | "product";
  mention_count: number; context: string;
}

interface IntelligenceOutput {
  key_facts: FactItem[];
  contradictions: Contradiction[];
  entities: EntityMention[];
  best_angle: string;
  angle_justification: string;
  content_brief: string;           // 300-word writing instructions for downstream agents
  virality_score: number;          // 1–10
  virality_factors: string[];
  noise_sources: number[];
  trusted_sources: number[];
  topic_complexity: "simple" | "moderate" | "complex";
  reader_prerequisite: string;
  missing_perspectives: string[];
  source_count_analyzed: number;
  total_token_context: number;
  intelligence_confidence: "high" | "medium" | "low";
  // Learning metadata (written to agent_memory)
  learned_angle_type: string;
  learning_applied: boolean;
  past_runs_consulted: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Reads from agent_memory table: what angle types have yielded
// high virality scores in past runs? Adapts current prompt accordingly.

interface AgentMemory {
  id: string;
  agent_key: string;
  topic_category: string;
  angle_type: string;
  virality_score: number;
  article_views?: number;
  fb_shares?: number;
  content_brief_style: string;
  created_at: string;
}

async function loadLearningContext(topicCategory: string): Promise<{
  topAngleTypes: string[];
  avgViralityByAngle: Record<string, number>;
  highPerformingBriefPatterns: string[];
  totalRunsLearned: number;
}> {
  try {
    // Ensure table exists gracefully — if not, return empty learning
    const { data: memories, error } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .order("virality_score", { ascending: false })
      .limit(20);

    if (error || !memories?.length) {
      return { topAngleTypes: [], avgViralityByAngle: {}, highPerformingBriefPatterns: [], totalRunsLearned: 0 };
    }

    // Filter by similar topic categories
    const relevant = memories.filter(m =>
      !topicCategory || m.topic_category === topicCategory ||
      m.topic_category === "general"
    );

    // Compute average virality by angle type
    const byAngle: Record<string, { total: number; count: number }> = {};
    for (const m of relevant) {
      if (!byAngle[m.angle_type]) byAngle[m.angle_type] = { total: 0, count: 0 };
      byAngle[m.angle_type].total += m.virality_score || 0;
      byAngle[m.angle_type].count++;
    }
    const avgViralityByAngle: Record<string, number> = {};
    for (const [angle, data] of Object.entries(byAngle)) {
      avgViralityByAngle[angle] = Math.round((data.total / data.count) * 10) / 10;
    }

    // Top performing angle types (sorted by avg virality)
    const topAngleTypes = Object.entries(avgViralityByAngle)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([angle]) => angle);

    // Extract brief patterns from top 5 performers
    const highPerformingBriefPatterns = relevant
      .filter(m => (m.virality_score || 0) >= 7)
      .slice(0, 5)
      .map(m => m.content_brief_style)
      .filter(Boolean);

    return {
      topAngleTypes,
      avgViralityByAngle,
      highPerformingBriefPatterns,
      totalRunsLearned: relevant.length,
    };
  } catch {
    return { topAngleTypes: [], avgViralityByAngle: {}, highPerformingBriefPatterns: [], totalRunsLearned: 0 };
  }
}

async function writeLearningMemory(
  topicCategory: string,
  angleType: string,
  viralityScore: number,
  contentBriefStyle: string
): Promise<void> {
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: topicCategory,
      angle_type: angleType,
      virality_score: viralityScore,
      content_brief_style: contentBriefStyle.slice(0, 500),
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... content truncated for context window ...]";
}

function buildSourceContext(scoutOutput: any): {
  context: string; sourceCount: number; totalTokens: number;
} {
  const sources = scoutOutput?.sources || [];
  const parts: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    parts.push([
      `[SOURCE ${i + 1}: ${s.source_domain || "unknown"} | Credibility: ${((s.credibility_score || 0.5) * 10).toFixed(1)}/10 | Recency: ${((s.recency_score || 0.5) * 10).toFixed(1)}/10]`,
      `Title: ${s.title || "N/A"}`,
      `Author: ${s.author || "Unknown"} | Date: ${s.publish_date || "Unknown"}`,
      `Sentiment: ${s.sentiment || "neutral"} | Credibility signals: ${(s.credibility_signals || []).join("; ")}`,
      `Key Facts: ${(s.key_facts || []).join(" | ")}`,
      `Content: ${s.full_text || s.full_summary || ""}`,
      `---`,
    ].join("\n"));
  }

  const context = parts.join("\n\n");
  const truncated = truncateToTokenLimit(context, 12000);
  return { context: truncated, sourceCount: sources.length, totalTokens: estimateTokens(truncated) };
}

// ─── Core Intelligence Extraction ─────────────────────────────────────────────

async function extractIntelligence(
  topic: string,
  sourceContext: string,
  sourceCount: number,
  brandVoice: string,
  language: string,
  topicCategory: string,
  learning: Awaited<ReturnType<typeof loadLearningContext>>
): Promise<IntelligenceOutput> {

  // Inject learning context into prompt if available
  const learningSection = learning.totalRunsLearned > 0
    ? `
━━━ LEARNING FROM PAST RUNS (${learning.totalRunsLearned} runs analyzed) ━━━
HIGH-PERFORMING ANGLE TYPES: ${learning.topAngleTypes.join(", ") || "insufficient data"}
AVG VIRALITY BY ANGLE:
${Object.entries(learning.avgViralityByAngle).map(([angle, avg]) => `  - ${angle}: ${avg}/10 avg virality`).join("\n")}
BRIEF STYLE PATTERNS THAT WORKED:
${learning.highPerformingBriefPatterns.slice(0, 2).map(p => `  → "${p.slice(0, 150)}..."`).join("\n") || "  → No patterns yet"}

INSTRUCTION: Prefer angle types with avg virality > 7 when content allows.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a senior editorial analyst for LADtoday — Pakistan's leading AI-powered digital media platform.

MISSION: Transform raw multi-source material into actionable editorial intelligence.
This content_brief will be used by 7 downstream AI agents: Fact Checker, Bias Detector,
Story Arc, Quote Extractor, Tone Calibrator, Localization, and Headline Optimizer.
Get this right — everything downstream depends on it.

TOPIC: "${topic}"
TOPIC CATEGORY: ${topicCategory || "general"}
BRAND VOICE: ${brandVoice || "professional"}
LANGUAGE: ${language || "English"}
SOURCE COUNT: ${sourceCount}
${learningSection}

━━━ SOURCE MATERIAL ━━━
${sourceContext}
━━━━━━━━━━━━━━━━━━━━━━━

YOUR 7 TASKS — produce all outputs with equal care:

1. EXTRACT KEY FACTS (5-8 facts):
   - SPECIFIC and DATA-BACKED only: numbers, dates, names, statistics
   - Attribute each to its source index (0-based)
   - Confidence: HIGH=authority source, MEDIUM=multiple agree, LOW=single source
   - Fact types: statistic / event / policy / quote / name / general

2. DETECT CONTRADICTIONS:
   - Claims that conflict between sources — resolve with evidence
   - MAJOR = completely opposite, MINOR = slightly different numbers
   - Recommend which version to use and why

3. EXTRACT ENTITIES (people, orgs, places, regulations, products):
   - Track mention counts and sentiment context
   - Flag key entities the article MUST reference

4. SELECT BEST ANGLE:
   - Must be the most engaging, underreported, or Pakistan-specific framing
   - Different from the most obvious/common take
   ${learning.topAngleTypes.length > 0 ? `- Consider these proven high-performing types: ${learning.topAngleTypes.join(", ")}` : ""}
   - Identify WHICH angle type this is (data-led / narrative / explainer / opinion / contrarian / investigative)

5. WRITE CONTENT BRIEF (300 words MINIMUM):
   - Detailed writing instructions the Rewrite Agent will follow word for word
   - Include: section structure, must-include facts with source citations
   - Include: opening hook strategy (stat / question / scene / controversy)
   - Include: 3 balance directives to avoid one-sided coverage
   - Include: Pakistan-specific context to inject
   - Include: word count target and tone guidance
   - Include: what NOT to say / angles to avoid

6. SCORE VIRALITY (1-10):
   1-3: Niche specialist only | 4-6: Moderate, good for organic
   7-8: High shareability, trending potential | 9-10: Breaking level, PUBLISH NOW
   List specific virality factors (emotional triggers, novelty, timeliness, controversy)

7. FLAG NOISE SOURCES and TRUSTED SOURCES (0-based indices):
   Noise: too old (>30 days), low credibility (<0.4), irrelevant, promotional
   Trusted: government/academic/major news with high credibility signal

Return this exact JSON:
{
  "key_facts": [{"fact":"string","source_domain":"string","source_index":number,"confidence":"high|medium|low","fact_type":"statistic|event|policy|quote|name|general"}],
  "contradictions": [{"claim_a":"string","source_a_domain":"string","claim_b":"string","source_b_domain":"string","severity":"minor|major","resolution":"string","recommended_version":"string"}],
  "entities": [{"name":"string","type":"person|organization|place|regulation|product","mention_count":number,"context":"string"}],
  "best_angle": "string (compelling story framing — 1 sentence)",
  "angle_justification": "string (why this angle, why it performs well for Pakistan)",
  "learned_angle_type": "string (data-led|narrative|explainer|opinion|contrarian|investigative|breaking)",
  "content_brief": "string (300+ word detailed writing instructions)",
  "virality_score": number,
  "virality_factors": ["string"],
  "noise_sources": [number],
  "trusted_sources": [number],
  "topic_complexity": "simple|moderate|complex",
  "reader_prerequisite": "string (what readers should know first)",
  "missing_perspectives": ["string (viewpoints not represented in sources)"],
  "intelligence_confidence": "high|medium|low"
}`;

  const schema = {
    type: "object",
    properties: {
      key_facts: { type: "array", items: { type: "object", properties: { fact: { type: "string" }, source_domain: { type: "string" }, source_index: { type: "integer" }, confidence: { type: "string" }, fact_type: { type: "string" } } } },
      contradictions: { type: "array", items: { type: "object", properties: { claim_a: { type: "string" }, source_a_domain: { type: "string" }, claim_b: { type: "string" }, source_b_domain: { type: "string" }, severity: { type: "string" }, resolution: { type: "string" }, recommended_version: { type: "string" } } } },
      entities: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, mention_count: { type: "integer" }, context: { type: "string" } } } },
      best_angle: { type: "string" },
      angle_justification: { type: "string" },
      learned_angle_type: { type: "string" },
      content_brief: { type: "string" },
      virality_score: { type: "number" },
      virality_factors: { type: "array", items: { type: "string" } },
      noise_sources: { type: "array", items: { type: "integer" } },
      trusted_sources: { type: "array", items: { type: "integer" } },
      topic_complexity: { type: "string" },
      reader_prerequisite: { type: "string" },
      missing_perspectives: { type: "array", items: { type: "string" } },
      intelligence_confidence: { type: "string" },
    },
  };

  // Dynamic temperature: lower when learning says to be precise, higher when exploring
  const temp = learning.totalRunsLearned > 10 ? 0.5 : 0.65;

  const raw = await geminiJson<any>(prompt, schema, {
    model: MODEL,
    temperature: temp,
    maxOutputTokens: 6144,
  });

  return {
    key_facts: raw.key_facts || [],
    contradictions: raw.contradictions || [],
    entities: raw.entities || [],
    best_angle: raw.best_angle || "",
    angle_justification: raw.angle_justification || "",
    content_brief: raw.content_brief || "",
    virality_score: raw.virality_score || 5,
    virality_factors: raw.virality_factors || [],
    noise_sources: raw.noise_sources || [],
    trusted_sources: raw.trusted_sources || [],
    topic_complexity: raw.topic_complexity || "moderate",
    reader_prerequisite: raw.reader_prerequisite || "",
    missing_perspectives: raw.missing_perspectives || [],
    source_count_analyzed: sourceCount,
    total_token_context: estimateTokens(sourceContext),
    intelligence_confidence: raw.intelligence_confidence || "medium",
    learned_angle_type: raw.learned_angle_type || "general",
    learning_applied: learning.totalRunsLearned > 0,
    past_runs_consulted: learning.totalRunsLearned,
  };
}

// Infer topic category from topic string for memory bucketing
function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|secp|payment|wallet|loan|credit/.test(t)) return "fintech";
  if (/startup|tech|ai|software|app|digital/.test(t)) return "tech";
  if (/cricket|psl|sport/.test(t)) return "sports";
  if (/election|politics|government|minister|parliament/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee|dollar|trade|export/.test(t)) return "economy";
  if (/health|covid|hospital|medical|disease/.test(t)) return "health";
  if (/education|university|school|degree/.test(t)) return "education";
  return "general";
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

    const body = await req.json().catch(() => ({}));
    const { run_id } = body;
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const brandVoice = run.brand_voice || "professional";
    const language = run.language || "english";
    const topicCategory = inferTopicCategory(topic);

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}" category=${topicCategory}`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic} | category: ${topicCategory}`, { run_id });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
      topic_category: topicCategory,
    });

    // ── Step 1: Read Scout output ──
    const scoutOutput = await readAgentOutput(run_id, "scout");
    if (!scoutOutput) {
      throw new Error("scout output not found. Scout must complete before Intelligence.");
    }
    console.log(`[${AGENT_NAME}] Loaded ${(scoutOutput.sources || []).length} scout sources`);

    // ── Step 2: Load learning context from past runs ──
    console.log(`[${AGENT_NAME}] Loading learning context for category="${topicCategory}"...`);
    const learning = await loadLearningContext(topicCategory);
    console.log(`[${AGENT_NAME}] Learning: ${learning.totalRunsLearned} past runs, top angles: [${learning.topAngleTypes.join(", ")}]`);

    // ── Step 3: Build combined source context ──
    const { context, sourceCount, totalTokens } = buildSourceContext(scoutOutput);
    console.log(`[${AGENT_NAME}] Context built: ${sourceCount} sources, ~${totalTokens} tokens, temp=${learning.totalRunsLearned > 10 ? 0.5 : 0.65}`);

    // ── Step 4: Run intelligence extraction (Pro model + learning) ──
    console.log(`[${AGENT_NAME}] Calling Gemini Pro (learning_applied=${learning.totalRunsLearned > 0})...`);
    const intelligence = await extractIntelligence(
      topic, context, sourceCount, brandVoice, language, topicCategory, learning
    );

    const durationMs = Date.now() - startedAt;

    // ── Step 5: Write output for downstream agents ──
    await writeAgentOutput(run_id, AGENT_KEY, intelligence, {
      tokens: totalTokens + estimateTokens(JSON.stringify(intelligence)),
      duration_ms: durationMs,
      status: "completed",
    });

    // ── Step 6: Mark completed ──
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      facts_extracted: intelligence.key_facts.length,
      contradictions_found: intelligence.contradictions.length,
      virality_score: intelligence.virality_score,
      confidence: intelligence.intelligence_confidence,
      angle_type: intelligence.learned_angle_type,
      learning_applied: intelligence.learning_applied,
      past_runs_consulted: intelligence.past_runs_consulted,
    });

    // ── Step 7: Write learning memory for future runs ──
    await writeLearningMemory(
      topicCategory,
      intelligence.learned_angle_type,
      intelligence.virality_score,
      intelligence.content_brief.slice(0, 200)
    );

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${intelligence.key_facts.length} facts | virality=${intelligence.virality_score} | angle="${intelligence.learned_angle_type}" | learning_applied=${intelligence.learning_applied} | ${durationMs}ms`,
      { run_id }
    );

    console.log(`[${AGENT_NAME}] ✅ Done in ${durationMs}ms — ${intelligence.key_facts.length} facts, virality=${intelligence.virality_score}, angle="${intelligence.learned_angle_type}"`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      facts_extracted: intelligence.key_facts.length,
      virality_score: intelligence.virality_score,
      best_angle: intelligence.best_angle,
      angle_type: intelligence.learned_angle_type,
      learning_applied: intelligence.learning_applied,
      past_runs_consulted: intelligence.past_runs_consulted,
      duration_ms: durationMs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? (err as GeminiError).status : 500;
    console.error(`[${AGENT_NAME}] ❌ Failed:`, msg);
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
