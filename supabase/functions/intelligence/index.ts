// ============================================================
// Agent 02 — Intelligence Agent
// Phase: DISCOVER | Model: AI/ML API GPT-4o | Depends on: scout
// ============================================================
// LEARNING: Reads past run virality scores from agent_memory.
// Adapts angle-selection strategy based on what performed best.
// Writes back performance signal after publishing downstream.
// Core output: content_brief used by ALL 7 Phase 2 agents.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";
import { 
  hasAIMLAPIKey, 
  aimlIntelligenceAnalysis
} from "../_shared/aimlapi.ts";
import { 
  hasCogneeKey, 
  cogneeRecallSuccessfulAngles,
  cogneeStoreIntelligence 
} from "../_shared/cognee.ts";

const AGENT_KEY = "intelligence";
const AGENT_NAME = "Intelligence";

// Feature flags
const USE_AIML_API = Deno.env.get("USE_AIML_API") === "true" && hasAIMLAPIKey();
const USE_COGNEE = Deno.env.get("USE_COGNEE") === "true" && hasCogneeKey();

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
  cognee_used: boolean;
}> {
  // Try Cognee first if enabled
  if (USE_COGNEE) {
    try {
      console.log(`[${AGENT_NAME}] Loading learning from Cognee...`);
      const cogneeResults = await cogneeRecallSuccessfulAngles(topicCategory);
      
      if (cogneeResults.successful_angles.length > 0) {
        console.log(`[${AGENT_NAME}] ✅ Cognee recall: ${cogneeResults.successful_angles.length} angles, avg virality ${cogneeResults.avg_virality}`);
        
        // Convert Cognee results to our format
        const avgViralityByAngle: Record<string, number> = {};
        cogneeResults.successful_angles.forEach(angle => {
          avgViralityByAngle[angle] = cogneeResults.avg_virality;
        });
        
        return {
          topAngleTypes: cogneeResults.successful_angles,
          avgViralityByAngle,
          highPerformingBriefPatterns: cogneeResults.recommendations,
          totalRunsLearned: cogneeResults.successful_angles.length,
          cognee_used: true,
        };
      }
    } catch (err) {
      console.error(`[${AGENT_NAME}] Cognee recall failed:`, err);
      // Fall through to database method
    }
  }

  // Fallback to database method
  try {
    const { data: memories, error } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .order("virality_score", { ascending: false })
      .limit(20);

    if (error || !memories?.length) {
      return { topAngleTypes: [], avgViralityByAngle: {}, highPerformingBriefPatterns: [], totalRunsLearned: 0, cognee_used: false };
    }

    const relevant = memories.filter(m =>
      !topicCategory || m.topic_category === topicCategory ||
      m.topic_category === "general"
    );

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

    const topAngleTypes = Object.entries(avgViralityByAngle)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([angle]) => angle);

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
      cognee_used: false,
    };
  } catch {
    return { topAngleTypes: [], avgViralityByAngle: {}, highPerformingBriefPatterns: [], totalRunsLearned: 0, cognee_used: false };
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

// ─── Helpers ────────���─────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... content truncated for context window ...]";
}

function buildSourceContext(scoutOutput: any, topic: string): {
  context: string; sourceCount: number; totalTokens: number;
} {
  const sources = scoutOutput?.sources || [];

  // If no sources were found, provide a topic-based context so Intelligence can still produce useful output
  if (sources.length === 0) {
    const fallbackContext = `[NO EXTERNAL SOURCES FOUND]
The Scout agent found 0 external sources for this topic. You MUST still produce ALL outputs
using your own knowledge. This is the user's topic:
"""${topic}"""

Scout metadata:
- Content density: ${scoutOutput?.content_density || "medium"}
- Overall sentiment: ${scoutOutput?.overall_sentiment || "neutral"}
- Recommended angle: ${scoutOutput?.recommended_angle || "general coverage"}
- Pakistan relevance: ${scoutOutput?.pakistan_relevance_score || 5}/10
- Discovery method: ${scoutOutput?.discovery_method || "N/A"}
- Scout notes: ${scoutOutput?.scout_notes || "No sources discovered."}

IMPORTANT: Even with no external sources, you MUST:
1. Extract 3-5 key facts from your knowledge about this topic
2. Write a full 300+ word content_brief with writing instructions
3. Identify the best_angle for a Pakistan audience
4. Provide angle_justification explaining your choice
5. List missing_perspectives and reader_prerequisite
6. Score virality and provide virality_factors
7. Populate contradictions and entities (look closer or provide at least one entry, or write default values based on your general knowledge of this topic area).
Do NOT leave any field empty.`;
    return { context: fallbackContext, sourceCount: 0, totalTokens: estimateTokens(fallbackContext) };
  }

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
  learning: Awaited<ReturnType<typeof loadLearningContext>>,
  selectedModel: string
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

5. WRITE CONTENT BRIEF (250-300 words):
   - Detailed writing instructions the Rewrite Agent will follow word for word
   - Include: section structure, must-include facts with source citations
   - Include: opening hook strategy (stat / question / scene / controversy)
   - Include: 2 balance directives to avoid one-sided coverage
   - Include: Pakistan-specific context to inject
   - Include: word count target and tone guidance
   - BE CONCISE: 250-300 words maximum for the brief

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
}

IMPORTANT: You MUST populate all properties in the schema with valid, non-empty, and substantive values. Do NOT return empty strings, empty arrays, nulls, or generic placeholders for any of the fields. Every single property is strictly required to have a real value generated by you.`;

  const schema = {
    type: "object",
    properties: {
      key_facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fact: { type: "string" },
            source_domain: { type: "string" },
            source_index: { type: "integer" },
            confidence: { type: "string" },
            fact_type: { type: "string" },
          },
          required: ["fact", "source_domain", "source_index", "confidence", "fact_type"],
        },
      },
      contradictions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            claim_a: { type: "string" },
            source_a_domain: { type: "string" },
            claim_b: { type: "string" },
            source_b_domain: { type: "string" },
            severity: { type: "string" },
            resolution: { type: "string" },
            recommended_version: { type: "string" },
          },
          required: ["claim_a", "source_a_domain", "claim_b", "source_b_domain", "severity", "resolution", "recommended_version"],
        },
      },
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            mention_count: { type: "integer" },
            context: { type: "string" },
          },
          required: ["name", "type", "mention_count", "context"],
        },
      },
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
    required: [
      "key_facts",
      "contradictions",
      "entities",
      "best_angle",
      "angle_justification",
      "learned_angle_type",
      "content_brief",
      "virality_score",
      "virality_factors",
      "noise_sources",
      "trusted_sources",
      "topic_complexity",
      "reader_prerequisite",
      "missing_perspectives",
      "intelligence_confidence",
    ],
  };

  // Dynamic temperature: lower when learning says to be precise, higher when exploring
  const temp = learning.totalRunsLearned > 10 ? 0.5 : 0.65;

  // Use Gemini for JSON extraction (with proper error handling for quota)
  const raw = await geminiJson<any>(prompt, schema, {
    model: selectedModel,
    temperature: temp,
    maxOutputTokens: 6144,
    retries: 3,
  });

  console.log(`[${AGENT_NAME}] Intelligence extraction completed via Gemini`);

  return {
    key_facts: raw.key_facts || [],
    contradictions: raw.contradictions || [],
    entities: raw.entities || [],
    best_angle: raw.best_angle || `A comprehensive look at "${topic}" from a Pakistan-centric perspective`,
    angle_justification: raw.angle_justification || `This angle provides direct relevance to Pakistani readers by connecting the topic "${topic}" to local context, trends, and impact.`,
    content_brief: raw.content_brief || `Write a 1200-word article about "${topic}" targeting Pakistani readers. Open with a compelling statistic or question. Structure: Introduction (150 words), Background Context (200 words), Main Analysis (400 words), Pakistan Impact (250 words), Expert Perspectives (100 words), Conclusion with forward-looking statement (100 words). Maintain ${brandVoice} tone throughout. Include data points where possible. Avoid generic global framing — anchor every section in Pakistan-specific context.`,
    virality_score: raw.virality_score || 5,
    virality_factors: raw.virality_factors?.length ? raw.virality_factors : ["Pakistan relevance", "timely topic", "informational value"],
    noise_sources: raw.noise_sources || [],
    trusted_sources: raw.trusted_sources || [],
    topic_complexity: raw.topic_complexity || "moderate",
    reader_prerequisite: raw.reader_prerequisite || `Basic familiarity with the topic of ${topic}`,
    missing_perspectives: raw.missing_perspectives?.length ? raw.missing_perspectives : [`Government/regulatory viewpoint on ${topic}`, `Impact on common Pakistani citizens`, `Expert academic analysis`],
    source_count_analyzed: sourceCount,
    total_token_context: estimateTokens(sourceContext),
    intelligence_confidence: raw.intelligence_confidence || "medium",
    learned_angle_type: raw.learned_angle_type || "general",
    learning_applied: true,
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

    const { run_id, model_override } = await req.json().catch(() => ({}));
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
    const scoutSourceCount = (scoutOutput.sources || []).length;
    console.log(`[${AGENT_NAME}] Loaded ${scoutSourceCount} scout sources`);
    
    // If Scout found 0 sources, we can still proceed with knowledge-based analysis
    if (scoutSourceCount === 0) {
      console.log(`[${AGENT_NAME}] ⚠️ Scout found 0 sources — proceeding with knowledge-based analysis`);
    }

    // ── Step 2: Load learning context from past runs ──
    console.log(`[${AGENT_NAME}] Loading learning context for category="${topicCategory}"...`);
    const learning = await loadLearningContext(topicCategory);
    console.log(`[${AGENT_NAME}] Learning: ${learning.totalRunsLearned} past runs, top angles: [${learning.topAngleTypes.join(", ")}]`);

    // ── Step 3: Build combined source context ──
    const { context, sourceCount, totalTokens } = buildSourceContext(scoutOutput, topic);
    console.log(`[${AGENT_NAME}] Context built: ${sourceCount} sources, ~${totalTokens} tokens, temp=${learning.totalRunsLearned > 10 ? 0.5 : 0.65}`);

    // ── Step 4: Run intelligence extraction (Pro model + learning) ──
    console.log(`[${AGENT_NAME}] Calling AI model (AIML=${USE_AIML_API}, Cognee=${USE_COGNEE}, learning_applied=${learning.totalRunsLearned > 0})...`);
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);
    
    let intelligence: IntelligenceOutput;
    
    // Try AI/ML API first if enabled (GPT-4o for deep reasoning)
    if (USE_AIML_API && sourceCount > 0) {
      try {
        console.log(`[${AGENT_NAME}] Using AI/ML API (GPT-4o) for intelligence analysis...`);
        const aimlResult = await aimlIntelligenceAnalysis(topic, scoutOutput.sources, {
          brand_voice: brandVoice,
          language: language,
        });
        
        // Convert AI/ML API result to our format
        intelligence = {
          key_facts: aimlResult.key_insights?.map((insight: string, idx: number) => ({
            fact: insight,
            source_domain: scoutOutput.sources[0]?.source_domain || "unknown",
            source_index: 0,
            confidence: "high" as const,
            fact_type: "general" as const,
          })) || [],
          contradictions: aimlResult.contradictions || [],
          entities: [],
          best_angle: aimlResult.recommended_angle || `Comprehensive analysis of ${topic}`,
          angle_justification: aimlResult.angle_justification || "AI/ML API deep reasoning analysis",
          content_brief: `Write a comprehensive article about "${topic}" based on ${sourceCount} sources. ${aimlResult.recommended_angle || ""}`,
          virality_score: aimlResult.pakistan_relevance || 5,
          virality_factors: ["AI/ML API analysis", "Deep reasoning", "Contradiction detection"],
          noise_sources: [],
          trusted_sources: Array.from({ length: sourceCount }, (_, i) => i),
          topic_complexity: "moderate" as const,
          reader_prerequisite: `Understanding of ${topic}`,
          missing_perspectives: [],
          source_count_analyzed: sourceCount,
          total_token_context: estimateTokens(context),
          intelligence_confidence: "high" as const,
          learned_angle_type: "data-led",
          learning_applied: true,
          past_runs_consulted: learning.totalRunsLearned,
        };
        
        console.log(`[${AGENT_NAME}] ✅ AI/ML API analysis complete`);
      } catch (aimlErr) {
        console.error(`[${AGENT_NAME}] AI/ML API failed, falling back to Gemini:`, aimlErr);
        // Fall through to Gemini
        intelligence = await extractIntelligence(
          topic, context, sourceCount, brandVoice, language, topicCategory, learning, selectedModel
        );
      }
    } else {
      // Use Gemini (default)
      intelligence = await extractIntelligence(
        topic, context, sourceCount, brandVoice, language, topicCategory, learning, selectedModel
      );
    }

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
      aiml_used: USE_AIML_API,
      cognee_used: learning.cognee_used,
    });

    // ── Step 7: Write learning memory for future runs ──
    await writeLearningMemory(
      topicCategory,
      intelligence.learned_angle_type,
      intelligence.virality_score,
      intelligence.content_brief.slice(0, 200)
    );
    
    // ── Step 8: Store in Cognee if enabled ──
    if (USE_COGNEE) {
      try {
        const insights = intelligence.key_facts.map(f => f.fact);
        await cogneeStoreIntelligence(topic, insights, {
          angle: intelligence.best_angle,
          virality_score: intelligence.virality_score,
          source_count: sourceCount,
        });
        console.log(`[${AGENT_NAME}] ✅ Stored intelligence in Cognee`);
      } catch (cogneeErr) {
        console.error(`[${AGENT_NAME}] Failed to store in Cognee:`, cogneeErr);
        // Non-fatal
      }
    }

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${intelligence.key_facts.length} facts | virality=${intelligence.virality_score} | angle="${intelligence.learned_angle_type}" | AIML=${USE_AIML_API} | Cognee=${USE_COGNEE} | ${durationMs}ms`,
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
      aiml_used: USE_AIML_API,
      cognee_used: learning.cognee_used,
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
