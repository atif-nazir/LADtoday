// ============================================================
// Agent 14 — Headline Optimizer Agent
// Phase: ANALYZE | Model: gemini-2.5-flash
// Depends on: story-arc(10), tone-calibrator(12), localization(13)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. Generate 20 headline variants using 8 proven formulas:
//    SEO / Curiosity Gap / Number-Led / Bold Claim / Question Hook
//    Data-Led / Story Lead / Negative Angle
// 2. Score each: CTR_score, SEO_score, shareability_score, platform_fit_score
// 3. Select: best headline per platform (WordPress/Facebook/Twitter/LinkedIn/WhatsApp)
// 4. Tag A/B pairs for Account Manager routing
// 5. Pass headline_set to Rewrite Agent + Publish Agent
//
// LEARNING: Tracks predicted CTR vs actual CTR. Calibrates formula
// weights based on which types actually drove clicks.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "headline-optimizer";
const AGENT_NAME = "Headline Optimizer";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

type HeadlineFormula = "seo" | "curiosity_gap" | "number_led" | "bold_claim" | "question_hook" | "data_led" | "story_lead" | "negative_angle";
type Platform = "wordpress" | "facebook" | "twitter" | "linkedin" | "whatsapp";

interface HeadlineVariant {
  headline: string;
  formula: HeadlineFormula;
  char_length: number;
  ctr_score: number;          // predicted CTR 1-10
  seo_score: number;          // SEO optimization 1-10 (50-60 chars ideal)
  shareability_score: number; // 1-10
  platform_fit: Record<Platform, number>; // per-platform fit 1-10
  best_for_platform: Platform;
  is_ab_primary: boolean;     // if true, paired with ab_partner_index
  ab_partner_index?: number;  // index of the A/B test partner headline
  why_it_works: string;
}

interface PlatformHeadlineSet {
  wordpress: HeadlineVariant;   // SEO-optimized, 50-60 chars, keyword-rich
  facebook: HeadlineVariant;    // curiosity gap / emotional hook
  twitter: HeadlineVariant;     // bold claim / under 100 chars
  linkedin: HeadlineVariant;    // professional, data-led or story-lead
  whatsapp: HeadlineVariant;    // conversational, shareable, clear value
}

interface HeadlineOptimizerOutput {
  all_variants: HeadlineVariant[];          // all 20 generated headlines
  platform_best: PlatformHeadlineSet;      // best headline per platform
  ab_pairs: [HeadlineVariant, HeadlineVariant][]; // A/B test pairings
  top_headline: HeadlineVariant;           // overall winner
  seo_headline: HeadlineVariant;           // for article <title> + WordPress
  social_headline: HeadlineVariant;        // for OG tags / social share
  highest_ctr_predicted: number;           // 1-10
  primary_keyword_used: string;
  // Learning metadata
  best_formula_historically: HeadlineFormula | "none";
  formula_calibration_applied: boolean;
  learning_applied: boolean;
  past_runs_consulted: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Learns: which headline formulas predicted CTR < actual CTR (overestimated)
// and which underestimated. Calibrates formula scores over time.

async function loadHeadlineLearning(topicCategory: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .not("actual_ctr_week1", "is", null)
      .order("actual_ctr_week1", { ascending: false })
      .limit(25);

    if (!data?.length) return { bestFormula: "seo" as HeadlineFormula, formulaWeights: {} as Record<HeadlineFormula, number>, sampleSize: 0 };

    // Which formula produced highest actual CTR?
    const formulaPerf: Record<string, { totalActual: number; count: number }> = {};
    for (const m of data) {
      const f = m.headline_formula;
      if (!f) continue;
      if (!formulaPerf[f]) formulaPerf[f] = { totalActual: 0, count: 0 };
      formulaPerf[f].totalActual += m.actual_ctr_week1 || 0;
      formulaPerf[f].count++;
    }
    const formulaAvg: Record<HeadlineFormula, number> = {} as Record<HeadlineFormula, number>;
    for (const [f, v] of Object.entries(formulaPerf)) {
      formulaAvg[f as HeadlineFormula] = v.count > 0 ? v.totalActual / v.count : 0;
    }
    const bestFormula = (Object.entries(formulaAvg).sort(([,a],[,b])=>b-a)[0]?.[0] || "seo") as HeadlineFormula;

    return { bestFormula, formulaWeights: formulaAvg, sampleSize: data.length };
  } catch {
    return { bestFormula: "seo" as HeadlineFormula, formulaWeights: {} as Record<HeadlineFormula, number>, sampleSize: 0 };
  }
}

function inferCategory(topic: string) {
  const t = topic.toLowerCase();
  if (/fintech|sbp|banking|payment/.test(t)) return "fintech";
  if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation|rupee/.test(t)) return "economy";
  return "general";
}

// ─── Core Headline Generation ─────────────────────────────────────────────────

const HEADLINE_FORMULAS: Record<HeadlineFormula, { description: string; example: string; best_platforms: Platform[] }> = {
  "seo": {
    description: "[Primary keyword] + [benefit/outcome/year] — Google-optimized, 50-60 chars",
    example: "Pakistan Fintech Revolution: 5 Trends Reshaping Digital Payments in 2024",
    best_platforms: ["wordpress"],
  },
  "curiosity_gap": {
    description: "Creates knowledge gap. 'The one thing X doesn't know about Y' / 'What nobody is saying about X'",
    example: "What Pakistani Banks Don't Want You to Know About Digital Wallets",
    best_platforms: ["facebook", "whatsapp"],
  },
  "number_led": {
    description: "Specific number creates credibility. '7 reasons' / '3 things' / 'PKR 50 billion opportunity'",
    example: "5 Pakistani Fintech Startups That Raised $100M+ This Year",
    best_platforms: ["facebook", "linkedin"],
  },
  "bold_claim": {
    description: "Strong statement, possibly contrarian. Short, punchy. Creates debate.",
    example: "Pakistan's Crypto Ban Is Over. Here's What Changes.",
    best_platforms: ["twitter"],
  },
  "question_hook": {
    description: "Provocative question audience wants answered. Creates urgency to read.",
    example: "Is Pakistan's Startup Ecosystem a Bubble About to Burst?",
    best_platforms: ["twitter", "facebook"],
  },
  "data_led": {
    description: "Lead with a specific, surprising statistic. '[stat]% of [group] are [finding]'",
    example: "82% of Pakistani MSMEs Now Accept Digital Payments — What Happened?",
    best_platforms: ["linkedin", "twitter"],
  },
  "story_lead": {
    description: "Human story hook. 'How [person/company] [did X] and changed [field]'",
    example: "How a Lahore Student Built Pakistan's Fastest-Growing Fintech in 18 Months",
    best_platforms: ["facebook", "whatsapp"],
  },
  "negative_angle": {
    description: "Problem-focused. 'Why X is failing' / 'The dark side of X'. Drives controversy.",
    example: "Why Pakistan's Digital Payment Revolution Is Leaving Rural Areas Behind",
    best_platforms: ["twitter", "linkedin"],
  },
};

async function generateHeadlines(
  topic: string,
  storyArc: any,
  toneData: any,
  localizationData: any,
  audienceData: any,
  intelData: any,
  category: string,
  learning: Awaited<ReturnType<typeof loadHeadlineLearning>>
): Promise<HeadlineOptimizerOutput> {

  const structure = storyArc?.structure_type || "analysis";
  const hookText = storyArc?.hook_text || "";
  const wordCountTarget = storyArc?.word_count_target || 1200;
  const primaryTone = toneData?.tone_guide?.primary_tone || "analytical";
  const toneKeywords = (toneData?.headline_tone_keywords || []).slice(0, 5).join(", ");
  const localReplacements = (localizationData?.replacements || []).slice(0, 3)
    .map((r: any) => `"${r.global_term}" → "${r.local_equivalent}"`).join(", ");
  const pakistanSeoTerms = (localizationData?.pakistan_seo_terms || []).slice(0, 4).join(", ");
  const audience = audienceData?.primary_segment?.segment_name || "Pakistani Professional";
  const viralityScore = intelData?.virality_score || 5;
  const bestAngle = intelData?.best_angle || topic;
  const painPoint = audienceData?.dominant_pain_point || "";

  const learningNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} past runs): Best formula by actual CTR: "${learning.bestFormula}". Formula weights: ${JSON.stringify(learning.formulaWeights)}. BIAS TOWARD "${learning.bestFormula}" formula — it has proven CTR for this category.`
    : "";

  const prompt = `You are the Headline Optimizer for LADtoday — Pakistan's AI content platform.
Generate 20 headline variants using all 8 formulas, then score each and select the best per platform.

TOPIC: "${topic}" | CATEGORY: ${category}
BEST ANGLE: "${bestAngle}"
AUDIENCE: ${audience}
DOMINANT PAIN POINT: "${painPoint}"
VIRALITY SCORE: ${viralityScore}/10
ARTICLE STRUCTURE: ${structure} | WORD COUNT: ${wordCountTarget}
TONE: ${primaryTone} | TONE KEYWORDS: ${toneKeywords}
LOCALIZATION: ${localReplacements || "N/A"}
PAKISTAN SEO TERMS: ${pakistanSeoTerms || "N/A"}
ARTICLE HOOK: "${hookText.slice(0, 150)}"
${learningNote}

━━━ HEADLINE FORMULAS TO USE ━━━
${Object.entries(HEADLINE_FORMULAS).map(([f,d])=>`${f.toUpperCase()}: ${d.description}\nExample: "${d.example}"\nBest for: ${d.best_platforms.join(", ")}`).join("\n\n")}

━━━ GENERATION RULES ━━━

1. Generate EXACTLY 20 headlines — at least 2 per formula (8 formulas × ~2.5 = 20)
   ${learning.sampleSize > 0 ? `Generate 4-5 variants using "${learning.bestFormula}" formula — learning data shows it performs best` : "Distribute evenly across all formulas"}

2. PAKISTAN SPECIFICITY:
   - Use "Pakistan" or Pakistani city/institution in at least 8 headlines
   - Incorporate localized terms where natural
   - Use PKR amounts where applicable (not USD)

3. SCORING per headline:
   CTR_SCORE (1-10): Will this get clicked in a feed? Consider: curiosity, urgency, specificity
   SEO_SCORE (1-10): Keyword density, length (ideal 50-60 chars), natural language
   SHAREABILITY_SCORE (1-10): Would you screenshot and WhatsApp this?
   PLATFORM_FIT: Score 1-10 per platform (wordpress/facebook/twitter/linkedin/whatsapp)

4. PLATFORM OPTIMIZATION:
   WordPress: SEO formula, 50-60 chars, primary keyword first, no clickbait
   Facebook: Curiosity gap or story lead, emotional, < 80 chars, generates comments
   Twitter/X: Bold claim or data-led, under 100 chars, creates debate, no "…"
   LinkedIn: Data-led or story lead, professional, states the insight directly
   WhatsApp: Conversational, clear value, "You need to know this" energy, < 70 chars

5. A/B PAIRING: Create 3 A/B test pairs (6 headlines total) — one from each formula type
   Mark is_ab_primary=true for the primary, ab_partner_index for its pair

Return JSON:
{
  "variants": [
    {
      "headline": "string",
      "formula": "seo|curiosity_gap|number_led|bold_claim|question_hook|data_led|story_lead|negative_angle",
      "char_length": number,
      "ctr_score": number (1-10),
      "seo_score": number (1-10),
      "shareability_score": number (1-10),
      "platform_fit": {"wordpress":number,"facebook":number,"twitter":number,"linkedin":number,"whatsapp":number},
      "best_for_platform": "wordpress|facebook|twitter|linkedin|whatsapp",
      "is_ab_primary": boolean,
      "ab_partner_index": number (index of partner, or null),
      "why_it_works": "string (one sentence)"
    }
  ],
  "primary_keyword_used": "string"
}`;

  const schema = {
    type: "object",
    properties: {
      variants: { type: "array", items: { type: "object", properties: {
        headline:{type:"string"}, formula:{type:"string"}, char_length:{type:"integer"},
        ctr_score:{type:"number"}, seo_score:{type:"number"}, shareability_score:{type:"number"},
        platform_fit:{type:"object",properties:{wordpress:{type:"number"},facebook:{type:"number"},twitter:{type:"number"},linkedin:{type:"number"},whatsapp:{type:"number"}}},
        best_for_platform:{type:"string"}, is_ab_primary:{type:"boolean"}, ab_partner_index:{type:"integer"}, why_it_works:{type:"string"},
      }}},
      primary_keyword_used:{type:"string"},
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.75, maxOutputTokens: 5000 });
  const variants: HeadlineVariant[] = (raw.variants || []).slice(0, 20);

  // Find best per platform
  const findBestFor = (platform: Platform): HeadlineVariant =>
    variants.sort((a, b) => (b.platform_fit?.[platform] || 0) - (a.platform_fit?.[platform] || 0))[0] || variants[0];

  const platformBest: PlatformHeadlineSet = {
    wordpress: findBestFor("wordpress"),
    facebook: findBestFor("facebook"),
    twitter: findBestFor("twitter"),
    linkedin: findBestFor("linkedin"),
    whatsapp: findBestFor("whatsapp"),
  };

  // Extract A/B pairs
  const abPairs: [HeadlineVariant, HeadlineVariant][] = [];
  for (const v of variants) {
    if (v.is_ab_primary && v.ab_partner_index !== undefined && v.ab_partner_index !== null && variants[v.ab_partner_index]) {
      abPairs.push([v, variants[v.ab_partner_index]]);
    }
  }

  // Overall winner (highest combined CTR + shareability)
  const topVariant = [...variants].sort((a, b) => (b.ctr_score + b.shareability_score) - (a.ctr_score + a.shareability_score))[0] || variants[0];
  const seoVariant = [...variants].sort((a, b) => b.seo_score - a.seo_score)[0] || variants[0];
  const socialVariant = [...variants].sort((a, b) => b.shareability_score - a.shareability_score)[0] || variants[0];

  // Write learning memory
  const bestFormula = topVariant?.formula as HeadlineFormula;
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: category,
      headline_formula: bestFormula, predicted_ctr: topVariant?.ctr_score || 5,
      actual_ctr_week1: null, // backfilled by analytics
      created_at: new Date().toISOString(),
    });
  } catch {/**/ }

  return {
    all_variants: variants,
    platform_best: platformBest,
    ab_pairs: abPairs.slice(0, 3),
    top_headline: topVariant,
    seo_headline: seoVariant,
    social_headline: socialVariant,
    highest_ctr_predicted: topVariant?.ctr_score || 0,
    primary_keyword_used: raw.primary_keyword_used || topic,
    best_formula_historically: learning.bestFormula || "none",
    formula_calibration_applied: learning.sampleSize > 0,
    learning_applied: learning.sampleSize > 0,
    past_runs_consulted: learning.sampleSize,
  };
}

// ─── Auth + Handler ───────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization"); if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", ""); if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch {/**/ }
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
    const category = inferCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    // Depends on: story-arc(10), tone-calibrator(12), localization(13)
    // Also reads: intelligence(02) + audience-listener(05) for context
    const [storyArcOut, toneOut, locOut, intelOut, audienceOut] = await Promise.all([
      readAgentOutput(run_id, "story-arc"),
      readAgentOutput(run_id, "tone-calibrator"),
      readAgentOutput(run_id, "localization"),
      readAgentOutput(run_id, "intelligence").catch(() => null),
      readAgentOutput(run_id, "audience-listener").catch(() => null),
    ]);
    if (!storyArcOut) throw new Error("story-arc output not found");
    if (!toneOut) throw new Error("tone-calibrator output not found");
    if (!locOut) throw new Error("localization output not found");

    const learning = await loadHeadlineLearning(category);
    console.log(`[${AGENT_NAME}] Generating 20 headlines | best_formula="${learning.bestFormula}" (${learning.sampleSize} past runs)`);

    const result = await generateHeadlines(topic, storyArcOut, toneOut, locOut, audienceOut, intelOut, category, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      variants_generated: result.all_variants.length,
      top_headline: result.top_headline?.headline?.slice(0, 100),
      highest_ctr_predicted: result.highest_ctr_predicted,
      ab_pairs: result.ab_pairs.length,
      best_formula_used: result.top_headline?.formula,
      learning_applied: result.learning_applied,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${result.all_variants.length} variants | top="${result.top_headline?.headline?.slice(0,60)}" (CTR=${result.highest_ctr_predicted}/10) | formula=${result.top_headline?.formula} | AB_pairs=${result.ab_pairs.length} | ${durationMs}ms`,
      { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      variants_generated: result.all_variants.length,
      top_headline: result.top_headline?.headline,
      highest_ctr_predicted: result.highest_ctr_predicted,
      ab_pairs_created: result.ab_pairs.length,
      primary_keyword: result.primary_keyword_used,
      learning_applied: result.learning_applied,
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
    } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
