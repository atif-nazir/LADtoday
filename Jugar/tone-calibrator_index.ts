// ============================================================
// Agent 12 — Tone Calibrator Agent
// Phase: ANALYZE | Model: gemini-2.5-pro | Depends on: audience-listener
// ============================================================
// Core job: Define the exact writing voice, sentence patterns, vocabulary
// level, and emotional register for the article. Gives the Rewrite Agent
// a precise style guide so writing feels human and audience-matched.
//
// LEARNING: Tracks which tone settings led to highest time-on-page and
// comments. Adapts tone recommendations to proven performer patterns.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "tone-calibrator";
const AGENT_NAME = "Tone Calibrator";
const MODEL = "gemini-2.5-pro"; // Pro: nuanced tone calibration requires deep language understanding

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToneGuide {
  primary_tone: string;              // "authoritative" | "conversational" | "urgent" | "empathetic" | "analytical" | "investigative"
  secondary_tone: string;            // complement tone
  formality_level: 1 | 2 | 3 | 4 | 5; // 1=casual blog, 3=journalistic, 5=academic
  vocabulary_level: "simple" | "intermediate" | "advanced"; // for target audience
  sentence_structure: string;        // short/medium/long preference + pattern
  paragraph_length: string;          // e.g., "3-4 sentences max for mobile readers"
  active_vs_passive: string;         // guidance on voice
  reading_ease_target: string;       // "7th grade / Flesch-Kincaid 65+"
}

interface ToneCalibratorOutput {
  tone_guide: ToneGuide;
  // Spec required: exact output keys consumed by Rewrite + all content agents
  style_guide: {
    sentence_length_target: string;       // e.g. "mix short (5-8w) with medium (15-20w)"
    preferred_transitions: string[];      // 10 transition phrases to use
    avoid_phrases: string[];              // 10 phrases that clash with their style
    opening_pattern: string;             // "Start with question OR surprising statistic"
    closing_pattern: string;             // "End with CTA + forward-looking statement"
    formality_score: number;             // 1-10 (not 1-5)
    pronoun_guidance: string;            // we/you/they usage guidance
    punctuation_notes: string;           // em dashes? Oxford comma? exclamations?
  };
  style_fingerprint: string;            // 200-word comprehensive writing fingerprint
  formality_score: number;              // 1-10 (spec exact key name)
  sentence_length_target: string;       // spec exact key name
  opening_pattern: string;              // spec exact key name
  closing_pattern: string;              // spec exact key name
  // Extended
  opening_tone: string;
  body_tone: string;
  closing_tone: string;
  emotional_journey: string;
  language_examples: { good: string[]; avoid: string[]; };
  pakistan_voice_notes: string;
  headline_tone_keywords: string[];
  call_to_action_tone: string;
  brand_voice_alignment: string;
  cultural_sensitivities: string[];
  full_style_brief: string;             // legacy alias for style_fingerprint
  // Learning
  learning_applied: boolean;
  tone_historically_best: string;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadToneLearning(topicCategory: string): Promise<{
  bestTones: string[];               // tones with highest time-on-page
  bestFormalityLevel: number;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("actual_time_on_page", { ascending: false })
      .limit(15);

    if (!data?.length) return { bestTones: [], bestFormalityLevel: 3, sampleSize: 0 };

    const toneCounts: Record<string, number> = {};
    let totalFormality = 0;
    for (const m of data) {
      if (m.primary_tone) toneCounts[m.primary_tone] = (toneCounts[m.primary_tone] || 0) + 1;
      totalFormality += m.formality_level || 3;
    }
    const bestTones = Object.entries(toneCounts).sort(([, a], [, b]) => b - a).slice(0, 2).map(([t]) => t);
    return { bestTones, bestFormalityLevel: Math.round(totalFormality / data.length), sampleSize: data.length };
  } catch {
    return { bestTones: [], bestFormalityLevel: 3, sampleSize: 0 };
  }
}

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp/.test(t)) return "fintech";
  if (/startup|tech|ai/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy";
  return "general";
}

async function calibrateTone(
  topic: string, brandVoice: string, language: string,
  audienceData: any, intelData: any, topicCategory: string,
  learning: Awaited<ReturnType<typeof loadToneLearning>>
): Promise<ToneCalibratorOutput> {

  const segment = audienceData?.primary_segment || {};
  const learningSection = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} past runs): Best tone for this category: ${learning.bestTones.join(", ")}. Best formality: ${learning.bestFormalityLevel}/5. Prefer "${learning.bestTones[0] || "analytical"}" tone unless audience data strongly suggests otherwise.`
    : "";

  const prompt = `You are a voice and tone specialist for LADtoday — Pakistan's AI media platform.
Define the EXACT writing style for this article so the Rewrite Agent writes consistently.

TOPIC: "${topic}"
BRAND VOICE: ${brandVoice}
LANGUAGE: ${language}
CATEGORY: ${topicCategory}
${learningSection}

AUDIENCE PROFILE:
Segment: ${segment.segment_name || "Pakistani Professional"}
Age: ${segment.age_range || "25-40"} | Location: ${segment.location || "Karachi, Lahore"}
Knowledge level: ${audienceData?.knowledge_level || "intermediate"}
Preferred tone: ${audienceData?.preferred_tone || "professional"}
Platform: ${segment.platform_preference?.join(", ") || "Facebook, WhatsApp"}
Content format preference: ${segment.content_format_preference?.join(", ") || "article"}
Pain points: ${(segment.pain_points || []).slice(0, 2).join(", ")}
Emotional hook target: ${audienceData?.emotional_hook || "surprise"}

TOPIC CONTEXT:
Virality score: ${intelData?.virality_score || 5}/10
Topic complexity: ${intelData?.topic_complexity || "moderate"}
Virality factors: ${(intelData?.virality_factors || []).join(", ")}

TONE VOCABULARY:
- AUTHORITATIVE: Clear, confident, expert. "The data shows..." "According to..." "This matters because..."
- CONVERSATIONAL: Warm, direct, like a smart colleague. Short sentences. Contractions OK.
- URGENT: Breaking news energy. Short sentences. Active voice. Time references.
- EMPATHETIC: Acknowledges audience pain. Validates concerns. "You may be wondering..."
- ANALYTICAL: Systematic, evidence-led. "Three factors drive this..." "When we examine..."
- INVESTIGATIVE: Follow the evidence. Reveal-style. Questions drive narrative.

PAKISTAN CULTURAL CONTEXT:
- Respect for authority figures (careful how you challenge)
- Family-unit decision making (content should address household impact)
- Religious sensitivities (avoid assumptions about prayer/fasting/celebration times)
- Economic anxiety (acknowledge financial pressures directly)
- Urdu loanwords: Use sparingly for color but not to exclude English readers
- Digital Pakistan context: Mobile-first, data-conscious readers

Return JSON:
{
  "tone_guide": {
    "primary_tone": "string",
    "secondary_tone": "string",
    "formality_level": number (1-5),
    "vocabulary_level": "simple|intermediate|advanced",
    "sentence_structure": "string (detailed guidance)",
    "paragraph_length": "string",
    "active_vs_passive": "string (guidance)",
    "reading_ease_target": "string"
  },
  "style_guide": {
    "sentence_length_target": "string (e.g. 'mix short 5-8w with medium 15-20w sentences')",
    "preferred_transitions": ["string (list of 10 transition phrases this writer uses)"],
    "avoid_phrases": ["string (list of 10 phrases that clash with this style)"],
    "opening_pattern": "string (how articles should open: question / statistic / scene / quote)",
    "closing_pattern": "string (how articles should close: CTA / forward-look / summary)",
    "formality_score": number (1-10: 1=WhatsApp casual, 5=blog, 8=newspaper, 10=academic),
    "pronoun_guidance": "string (we/you/they usage)",
    "punctuation_notes": "string (em dashes, Oxford comma, exclamation usage)"
  },
  "style_fingerprint": "string (200-word comprehensive writing fingerprint for Rewrite Agent)",
  "opening_tone": "string (specific tone for opening paragraph)",
  "body_tone": "string",
  "closing_tone": "string",
  "emotional_journey": "string (how emotion evolves from hook to close)",
  "language_examples": {
    "good": ["string (example phrase/sentence to emulate)", "string", "string"],
    "avoid": ["string (phrase/pattern to avoid)", "string", "string"]
  },
  "pakistan_voice_notes": "string (Pakistan-specific tone adjustments)",
  "headline_tone_keywords": ["string (power words matching this tone)"],
  "call_to_action_tone": "string (how to frame any CTA)",
  "brand_voice_alignment": "string",
  "cultural_sensitivities": ["string"],
  "full_style_brief": "string (same as style_fingerprint — 200 words)"
}`;

  const schema = {
    type: "object",
    properties: {
      tone_guide: { type: "object", properties: {
        primary_tone: { type: "string" }, secondary_tone: { type: "string" },
        formality_level: { type: "integer" }, vocabulary_level: { type: "string" },
        sentence_structure: { type: "string" }, paragraph_length: { type: "string" },
        active_vs_passive: { type: "string" }, reading_ease_target: { type: "string" },
      } },
      style_guide: { type: "object", properties: {
        sentence_length_target: { type: "string" },
        preferred_transitions: { type: "array", items: { type: "string" } },
        avoid_phrases: { type: "array", items: { type: "string" } },
        opening_pattern: { type: "string" }, closing_pattern: { type: "string" },
        formality_score: { type: "number" },
        pronoun_guidance: { type: "string" }, punctuation_notes: { type: "string" },
      } },
      style_fingerprint: { type: "string" },
      opening_tone: { type: "string" }, body_tone: { type: "string" }, closing_tone: { type: "string" },
      emotional_journey: { type: "string" },
      language_examples: { type: "object", properties: {
        good: { type: "array", items: { type: "string" } }, avoid: { type: "array", items: { type: "string" } },
      } },
      pakistan_voice_notes: { type: "string" },
      headline_tone_keywords: { type: "array", items: { type: "string" } },
      call_to_action_tone: { type: "string" }, brand_voice_alignment: { type: "string" },
      cultural_sensitivities: { type: "array", items: { type: "string" } },
      full_style_brief: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.55, maxOutputTokens: 3500 });

  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: topicCategory,
      primary_tone: raw.tone_guide?.primary_tone || "analytical",
      formality_level: raw.tone_guide?.formality_level || 3,
      actual_time_on_page: null, created_at: new Date().toISOString(),
    });
  } catch { /**/ }

  const sg = raw.style_guide || {};
  return {
    tone_guide: raw.tone_guide || { primary_tone: "analytical", secondary_tone: "authoritative", formality_level: 3, vocabulary_level: "intermediate", sentence_structure: "medium", paragraph_length: "3-4 sentences", active_vs_passive: "prefer active", reading_ease_target: "Flesch-Kincaid 65+" },
    // spec required keys
    style_guide: {
      sentence_length_target: sg.sentence_length_target || "Mix short (5-8 words) with medium (15-20 words) sentences",
      preferred_transitions: sg.preferred_transitions || ["However", "This means", "As a result", "Meanwhile", "In addition", "That said", "More importantly", "To put it simply", "What this means for Pakistanis", "The key takeaway"],
      avoid_phrases: sg.avoid_phrases || ["It is worth noting", "In conclusion", "Having said that", "It goes without saying", "At the end of the day", "Going forward", "Leverage", "Synergy", "Paradigm shift", "Stakeholders"],
      opening_pattern: sg.opening_pattern || raw.opening_tone || "Start with a surprising statistic or direct question",
      closing_pattern: sg.closing_pattern || raw.closing_tone || "End with forward-looking statement + clear reader action",
      formality_score: sg.formality_score || (raw.tone_guide?.formality_level || 3) * 2,
      pronoun_guidance: sg.pronoun_guidance || "Use 'you' for reader engagement, avoid 'I', use 'we' sparingly",
      punctuation_notes: sg.punctuation_notes || "Em dashes for emphasis — use sparingly. No exclamation marks in body text.",
    },
    style_fingerprint: raw.style_fingerprint || raw.full_style_brief || "",
    formality_score: sg.formality_score || (raw.tone_guide?.formality_level || 3) * 2,
    sentence_length_target: sg.sentence_length_target || "Mix short (5-8w) with medium (15-20w)",
    opening_pattern: sg.opening_pattern || raw.opening_tone || "",
    closing_pattern: sg.closing_pattern || raw.closing_tone || "",
    // extended
    opening_tone: raw.opening_tone || "",
    body_tone: raw.body_tone || "",
    closing_tone: raw.closing_tone || "",
    emotional_journey: raw.emotional_journey || "",
    language_examples: raw.language_examples || { good: [], avoid: [] },
    pakistan_voice_notes: raw.pakistan_voice_notes || "",
    headline_tone_keywords: raw.headline_tone_keywords || [],
    call_to_action_tone: raw.call_to_action_tone || "",
    brand_voice_alignment: raw.brand_voice_alignment || "",
    cultural_sensitivities: raw.cultural_sensitivities || [],
    full_style_brief: raw.full_style_brief || raw.style_fingerprint || "",
    learning_applied: learning.sampleSize > 0,
    tone_historically_best: learning.bestTones[0] || "analytical",
  };
}

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch { /**/ }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    if (!await verifyServiceOrAdmin(req)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const brandVoice = run.brand_voice || "professional";
    const language = run.language || "english";
    const topicCategory = inferTopicCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [audienceOut, intelOut] = await Promise.all([
      readAgentOutput(run_id, "audience-listener"),
      readAgentOutput(run_id, "intelligence").catch(() => null),
    ]);
    if (!audienceOut) throw new Error("audience-listener output not found");

    const learning = await loadToneLearning(topicCategory);
    const result = await calibrateTone(topic, brandVoice, language, audienceOut, intelOut, topicCategory, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      primary_tone: result.tone_guide.primary_tone, formality_level: result.tone_guide.formality_level,
      vocabulary_level: result.tone_guide.vocabulary_level, learning_applied: result.learning_applied,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `tone=${result.tone_guide.primary_tone} formality=${result.tone_guide.formality_level}/5 vocab=${result.tone_guide.vocabulary_level} ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      primary_tone: result.tone_guide.primary_tone, formality_level: result.tone_guide.formality_level,
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
