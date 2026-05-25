// ============================================================
// Agent 05 — Audience Listener Agent
// Phase: DISCOVER | Model: gemini-2.5-flash | Depends on: scout
// Runs PARALLEL with intelligence, trend-forecaster, competitor-intel, news-wire
// ============================================================
// LEARNING: Tracks audience pain points vs. actual engagement rates.
// Learns which question types drive comments, shares, return visits.
// Adapts pain point detection focus based on what resonates historically.
// Core output: audience_profile + pain_points → drives Tone Calibrator
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";
import { selectModelForAgent, getModelInfo } from "../_shared/model-config.ts";

const AGENT_KEY = "audience-listener";
const AGENT_NAME = "Audience Listener";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudienceSegment {
  segment_name: string;             // e.g., "Young Karachi Fintech Professional"
  age_range: string;                // e.g., "22-30"
  location: string;                 // e.g., "Karachi, Lahore"
  education_level: string;
  income_level: "low" | "middle" | "upper_middle" | "high";
  digital_behavior: string;         // how they consume content
  platform_preference: string[];
  reading_time_preference: string;  // morning / evening / night
  content_format_preference: string[];
  pain_points: string[];            // what worries them about this topic
  aspirations: string[];            // what they hope to achieve
  questions_they_ask: string[];     // literal questions this audience asks online
  emotional_triggers: string[];     // what makes them share / comment
  trust_signals: string[];          // what makes them trust a news source
}

interface AudienceOutput {
  primary_segment: AudienceSegment;
  secondary_segments: AudienceSegment[];
  combined_audience_size_estimate: string;

  // ── SPEC REQUIRED (LADtoday_50_AGENTS.md) ────────────────────────────────────
  vocabulary: string[];             // exact phrases audience uses — NOT jargon
  content_gaps: string[];           // questions with no satisfying answer online yet
  pain_points: string[];            // 3-5 frustrations (top-level, not per-segment)
  emotional_triggers: string[];     // what makes audience react (fear/hope/outrage/curiosity)
  // ─────────────────────────────────────────────────────────────────────────────

  // Content intelligence (Tone Calibrator + Rewrite Agent)
  dominant_pain_point: string;
  emotional_hook: string;
  knowledge_level: "beginner" | "intermediate" | "expert";
  preferred_tone: string;
  content_length_preference: "short" | "medium" | "long";

  // Platform distribution
  best_distribution_platform: string;
  platform_rationale: string;

  // Questions (SEO + engagement)
  top_questions: string[];          // 8-12 questions audience Googles (per spec)
  faq_suggestions: string[];

  // Engagement predictions
  comment_trigger_potential: "high" | "medium" | "low";
  share_trigger_emotion: string;
  viral_element: string;

  // Learning metadata
  learning_applied: boolean;
  dominant_pain_from_memory?: string;
  past_runs_analyzed: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Learns: which pain points led to highest comment/share rates?
// If "financial anxiety" pain points drove 3x shares for fintech content, focus there.

async function loadAudienceLearning(topicCategory: string): Promise<{
  highEngagementPainPoints: string[];
  highShareEmotions: string[];
  bestPlatformForCategory: string;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .not("actual_fb_shares", "is", null)
      .order("actual_fb_shares", { ascending: false })
      .limit(20);

    if (!data?.length) return { highEngagementPainPoints: [], highShareEmotions: [], bestPlatformForCategory: "facebook", sampleSize: 0 };

    const highEngagementPainPoints: string[] = [];
    const emotionCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    for (const m of data) {
      if (m.pain_point_used && (m.actual_fb_shares || 0) > 50) {
        highEngagementPainPoints.push(m.pain_point_used);
      }
      if (m.share_emotion) emotionCounts[m.share_emotion] = (emotionCounts[m.share_emotion] || 0) + 1;
      if (m.platform_used) platformCounts[m.platform_used] = (platformCounts[m.platform_used] || 0) + 1;
    }

    const highShareEmotions = Object.entries(emotionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([emotion]) => emotion);

    const bestPlatformForCategory = Object.entries(platformCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || "facebook";

    return {
      highEngagementPainPoints: [...new Set(highEngagementPainPoints)].slice(0, 5),
      highShareEmotions,
      bestPlatformForCategory,
      sampleSize: data.length,
    };
  } catch {
    return { highEngagementPainPoints: [], highShareEmotions: [], bestPlatformForCategory: "facebook", sampleSize: 0 };
  }
}

async function writeAudienceMemory(
  topicCategory: string,
  painPointUsed: string,
  shareEmotion: string,
  platformUsed: string
): Promise<void> {
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: topicCategory,
      pain_point_used: painPointUsed,
      share_emotion: shareEmotion,
      platform_used: platformUsed,
      actual_fb_shares: null, // filled by analytics agent later
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|payment|wallet|loan/.test(t)) return "fintech";
  if (/startup|tech|ai|digital|app|software/.test(t)) return "tech";
  if (/cricket|psl|sport/.test(t)) return "sports";
  if (/election|politics|government|minister/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee|dollar/.test(t)) return "economy";
  if (/health|covid|hospital|medical/.test(t)) return "health";
  return "general";
}

// ─── Core Audience Analysis ───────────────────────────────────────────────────

const PAKISTAN_AUDIENCE_CONTEXT = {
  core_audience: "Pakistani professionals and knowledge workers, ages 22-45",
  digital_reality: "80%+ access content on mobile, 45% prefer video + text combo",
  language_split: "60% prefer English content, 40% prefer Urdu or bilingual",
  platform_usage: "WhatsApp (96%), Facebook (72%), YouTube (65%), Twitter/X (35%), LinkedIn (28%)",
  content_timing: "Peak hours: 8-10am commute, 1-2pm lunch, 9-11pm evening",
  pain_context: "Inflation sensitivity high, rupee devaluation, job market anxiety, education costs",
  aspiration_context: "Entrepreneurship, overseas jobs, digital skills, financial independence",
};

async function analyzeAudience(
  topic: string,
  scoutData: any,
  learning: Awaited<ReturnType<typeof loadAudienceLearning>>,
  brandVoice: string,
  language: string,
  topicCategory: string,
  selectedModel: string
): Promise<AudienceOutput> {

  const scoutContext = scoutData
    ? `\nSCOUT DATA: ${scoutData.recommended_angle || ""} | Sentiment: ${scoutData.overall_sentiment || "neutral"} | Pakistan Relevance: ${scoutData.pakistan_relevance_score || 5}/10`
    : "";

  const learningSection = learning.sampleSize > 0
    ? `\n━━━ LEARNING: WHAT RESONATED IN PAST RUNS (${learning.sampleSize} runs) ━━━
HIGH-ENGAGEMENT PAIN POINTS: ${learning.highEngagementPainPoints.join(", ") || "insufficient data"}
EMOTIONS THAT DROVE SHARES: ${learning.highShareEmotions.join(", ") || "insufficient data"}
BEST PLATFORM FOR THIS CATEGORY: ${learning.bestPlatformForCategory}
INSTRUCTION: Emphasize "${learning.highEngagementPainPoints[0] || "general"}" pain point if present in this topic.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are an audience intelligence analyst for LADtoday — Pakistan's AI content platform.

MISSION: Profile the exact audience for this article topic. Your output drives:
- Tone Calibrator (how to write for this audience)
- Headline Optimizer (what hooks this audience)
- Social Scheduler (where and when to reach them)
- Community Agent (which communities to target)

TOPIC: "${topic}"
BRAND VOICE: ${brandVoice || "professional"}
LANGUAGE: ${language || "english"}
TOPIC CATEGORY: ${topicCategory}
${scoutContext}
${learningSection}

PAKISTAN AUDIENCE CONTEXT:
Core: ${PAKISTAN_AUDIENCE_CONTEXT.core_audience}
Digital Reality: ${PAKISTAN_AUDIENCE_CONTEXT.digital_reality}
Language: ${PAKISTAN_AUDIENCE_CONTEXT.language_split}
Platforms: ${PAKISTAN_AUDIENCE_CONTEXT.platform_usage}
Peak Times: ${PAKISTAN_AUDIENCE_CONTEXT.content_timing}
Pain Context: ${PAKISTAN_AUDIENCE_CONTEXT.pain_context}
Aspirations: ${PAKISTAN_AUDIENCE_CONTEXT.aspiration_context}

━━━ AUDIENCE PROFILING FRAMEWORK ━━━

1. PRIMARY SEGMENT (most important reader for this topic):
   - Who SPECIFICALLY will search for and read this article?
   - Not demographics only — be psychographic: their worldview, fears, ambitions
   - What is their DAILY LIFE context when they encounter this topic?
   - What are their 3-5 most pressing pain points about this topic?
   - What literal questions do they Google about this topic?

2. SECONDARY SEGMENTS (2 additional audience types):
   - May have different needs from the same content
   - Note what they want differently from the primary segment

3. EMOTIONAL HOOK SELECTION:
   Choose the ONE primary emotion this article should trigger:
   - ANGER: "outrage at injustice or incompetence" → high shares, divisive
   - HOPE: "this is the path forward" → high saves, aspirational sharing
   - SURPRISE: "I didn't know this" → high social sharing
   - FEAR: "you need to know this risk" → high click-through, urgency
   - PRIDE: "Pakistan achievement" → high WhatsApp forwarding
   - FOMO: "this opportunity is closing" → high conversion action
   ${learning.highShareEmotions.length > 0 ? `Based on past run data, "${learning.highShareEmotions[0]}" emotion drove most shares for this category.` : ""}

4. DOMINANT PAIN POINT:
   The single most powerful pain point this topic addresses for the audience.
   ${learning.highEngagementPainPoints.length > 0 ? `Data suggests: "${learning.highEngagementPainPoints[0]}" pain drives highest engagement in this category.` : ""}

5. PLATFORM + TIMING:
   Where does this specific audience actually consume this type of content?
   When (time of day, day of week) are they most receptive?

6. VIRAL ELEMENT:
   What single element (stat, story, twist, revelation) could make this go viral in Pakistan?

━━━ SPEC REQUIRED: EXTRACT THESE EXACTLY ━━━

7. VOCABULARY (spec: "exact phrases the audience uses — not jargon"):
   List 8-12 actual words/phrases this audience uses when talking about this topic.
   These go directly into the article for natural language matching.
   Example for fintech: ["mobile banking", "jazzcash pe transfer", "account freeze", "digital wallet charges"]
   RULE: If the audience would say it on WhatsApp, include it. If only experts say it, exclude it.

8. CONTENT GAPS (spec: "questions with no satisfying answer online yet"):
   4-6 questions that have poor or no answers currently online in Pakistani context.
   These are OPPORTUNITIES — if LADtoday answers them first, it owns that search query.

Return JSON:
{
  "primary_segment": {
    "segment_name": "string",
    "age_range": "string",
    "location": "string (cities)",
    "education_level": "string",
    "income_level": "low|middle|upper_middle|high",
    "digital_behavior": "string",
    "platform_preference": ["string"],
    "reading_time_preference": "string",
    "content_format_preference": ["string"],
    "pain_points": ["string (5 specific pain points)"],
    "aspirations": ["string (3 aspirations)"],
    "questions_they_ask": ["string (5 literal Google questions)"],
    "emotional_triggers": ["string"],
    "trust_signals": ["string"]
  },
  "secondary_segments": [
    {
      "segment_name": "string", "age_range": "string", "location": "string",
      "education_level": "string", "income_level": "low|middle|upper_middle|high",
      "digital_behavior": "string", "platform_preference": ["string"],
      "reading_time_preference": "string", "content_format_preference": ["string"],
      "pain_points": ["string"], "aspirations": ["string"],
      "questions_they_ask": ["string"], "emotional_triggers": ["string"], "trust_signals": ["string"]
    }
  ],
  "combined_audience_size_estimate": "string",
  "vocabulary": ["string (8-12 exact phrases audience uses on WhatsApp/Google)"],
  "content_gaps": ["string (4-6 unanswered questions in Pakistani context)"],
  "pain_points": ["string (3-5 top-level frustrations)"],
  "emotional_triggers": ["string (what makes them share/comment)"],
  "dominant_pain_point": "string",
  "emotional_hook": "string (anger|hope|surprise|fear|pride|fomo + why)",
  "knowledge_level": "beginner|intermediate|expert",
  "preferred_tone": "string",
  "content_length_preference": "short|medium|long",
  "best_distribution_platform": "string",
  "platform_rationale": "string",
  "top_questions": ["string (8-12 Google questions in audience's own words)"],
  "faq_suggestions": ["string (3-5 FAQ items)"],
  "comment_trigger_potential": "high|medium|low",
  "share_trigger_emotion": "string",
  "viral_element": "string"
}`;

  const schema = {
    type: "object",
    properties: {
      primary_segment: { type: "object", properties: {
        segment_name: { type: "string" }, age_range: { type: "string" }, location: { type: "string" },
        education_level: { type: "string" }, income_level: { type: "string" },
        digital_behavior: { type: "string" }, platform_preference: { type: "array", items: { type: "string" } },
        reading_time_preference: { type: "string" }, content_format_preference: { type: "array", items: { type: "string" } },
        pain_points: { type: "array", items: { type: "string" } }, aspirations: { type: "array", items: { type: "string" } },
        questions_they_ask: { type: "array", items: { type: "string" } },
        emotional_triggers: { type: "array", items: { type: "string" } }, trust_signals: { type: "array", items: { type: "string" } },
      } },
      secondary_segments: { type: "array", items: { type: "object" } },
      combined_audience_size_estimate: { type: "string" },
      // spec required fields
      vocabulary: { type: "array", items: { type: "string" } },
      content_gaps: { type: "array", items: { type: "string" } },
      pain_points: { type: "array", items: { type: "string" } },
      emotional_triggers: { type: "array", items: { type: "string" } },
      dominant_pain_point: { type: "string" },
      emotional_hook: { type: "string" },
      knowledge_level: { type: "string" },
      preferred_tone: { type: "string" },
      content_length_preference: { type: "string" },
      best_distribution_platform: { type: "string" },
      platform_rationale: { type: "string" },
      top_questions: { type: "array", items: { type: "string" } },
      faq_suggestions: { type: "array", items: { type: "string" } },
      comment_trigger_potential: { type: "string" },
      share_trigger_emotion: { type: "string" },
      viral_element: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: selectedModel,
    temperature: 0.65,
    maxOutputTokens: 4096,
  });

  return {
    primary_segment: raw.primary_segment || { segment_name: "Pakistani Professional", age_range: "25-40", location: "Karachi, Lahore", education_level: "Graduate", income_level: "middle", digital_behavior: "Mobile-first", platform_preference: ["Facebook", "WhatsApp"], reading_time_preference: "morning", content_format_preference: ["article"], pain_points: [], aspirations: [], questions_they_ask: [], emotional_triggers: [], trust_signals: [] },
    secondary_segments: raw.secondary_segments || [],
    combined_audience_size_estimate: raw.combined_audience_size_estimate || "1-3 million",
    // spec required
    vocabulary: raw.vocabulary || [],
    content_gaps: raw.content_gaps || [],
    pain_points: raw.pain_points || raw.primary_segment?.pain_points || [],
    emotional_triggers: raw.emotional_triggers || raw.primary_segment?.emotional_triggers || [],
    // core
    dominant_pain_point: raw.dominant_pain_point || "",
    emotional_hook: raw.emotional_hook || "surprise",
    knowledge_level: raw.knowledge_level || "intermediate",
    preferred_tone: raw.preferred_tone || "professional",
    content_length_preference: raw.content_length_preference || "medium",
    best_distribution_platform: raw.best_distribution_platform || "facebook",
    platform_rationale: raw.platform_rationale || "",
    top_questions: raw.top_questions || [],
    faq_suggestions: raw.faq_suggestions || [],
    comment_trigger_potential: raw.comment_trigger_potential || "medium",
    share_trigger_emotion: raw.share_trigger_emotion || "surprise",
    viral_element: raw.viral_element || "",
    learning_applied: learning.sampleSize > 0,
    dominant_pain_from_memory: learning.highEngagementPainPoints[0],
    past_runs_analyzed: learning.sampleSize,
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
    const brandVoice = run.brand_voice || "professional";
    const language = run.language || "english";
    const topicCategory = inferTopicCategory(topic);
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}"`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic}`, { run_id });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // Read scout (graceful — parallel execution)
    const scoutData = await readAgentOutput(run_id, "scout").catch(() => null);

    // Load audience learning
    console.log(`[${AGENT_NAME}] Loading audience learning for category="${topicCategory}"...`);
    const learning = await loadAudienceLearning(topicCategory);
    console.log(`[${AGENT_NAME}] Learning: ${learning.sampleSize} runs | top pain: "${learning.highEngagementPainPoints[0] || "none"}" | top emotion: "${learning.highShareEmotions[0] || "none"}"`);

    // Run audience analysis
    const audienceData = await analyzeAudience(topic, scoutData, learning, brandVoice, language, topicCategory, selectedModel);

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, audienceData, {
      tokens: Math.ceil(JSON.stringify(audienceData).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      primary_segment: audienceData.primary_segment.segment_name,
      dominant_pain_point: audienceData.dominant_pain_point,
      emotional_hook: audienceData.emotional_hook,
      viral_element: audienceData.viral_element,
      learning_applied: audienceData.learning_applied,
    });

    // Write learning memory
    await writeAudienceMemory(
      topicCategory,
      audienceData.dominant_pain_point,
      audienceData.share_trigger_emotion,
      audienceData.best_distribution_platform
    );

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `segment="${audienceData.primary_segment.segment_name}" | pain="${audienceData.dominant_pain_point.slice(0, 60)}" | emotion=${audienceData.share_trigger_emotion} | ${durationMs}ms`,
      { run_id }
    );

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      primary_segment: audienceData.primary_segment.segment_name,
      dominant_pain_point: audienceData.dominant_pain_point,
      emotional_hook: audienceData.emotional_hook,
      best_distribution_platform: audienceData.best_distribution_platform,
      learning_applied: audienceData.learning_applied,
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
