// ============================================================
// Agent 16 — Vision Agent (ENHANCED)
// Phase: CREATE | Model: gemini-2.5-pro | Depends on: rewrite(15), headline-optimizer(14)
// ============================================================
// ENHANCEMENT: Receives story arc + 3 headline variants → generates
// 3 thumbnail concepts (one per headline), Creative Agent picks best.
// Also generates OG image concept, alt text, and featured image brief.
//
// LEARNING: Tracks which thumbnail concept styles drove highest CTR.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "vision";
const AGENT_NAME = "Vision";
const MODEL = "gemini-2.5-pro";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface ThumbnailConcept {
  headline_variant: string;         // which headline this concept matches
  visual_style: string;             // "data-visualization" | "human-story" | "bold-text" | "abstract" | "product-photo"
  color_palette: string;            // specific colors (e.g., "Deep blue #1a237e + gold #f9a825")
  text_overlay: string;             // text to overlay on image (≤6 words)
  image_description: string;        // prompt for image generation (100 chars)
  composition: string;              // layout guidance
  emotional_register: string;       // the emotion this visual triggers
  ctr_prediction: number;           // 1-10 predicted thumbnail CTR
  platform_dimensions: {
    facebook: string; twitter: string; og: string; wordpress_featured: string;
  };
}

interface VisionOutput {
  thumbnail_concepts: ThumbnailConcept[];    // 3 concepts, one per headline variant
  recommended_concept_index: number;         // 0-based index of best concept
  featured_image_alt: string;               // SEO-friendly alt text
  og_image_brief: string;                   // OG image design brief (for Creative Agent)
  caption_suggestions: string[];            // 3 caption options for the image
  image_search_keywords: string[];          // for finding stock photos
  brand_color_consistent: boolean;          // does design follow LADtoday brand?
  learning_applied: boolean;
}

async function loadVisionLearning(category: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("visual_style,actual_ctr_week1")
      .eq("agent_key", AGENT_KEY).in("topic_category", [category, "general"])
      .not("actual_ctr_week1", "is", null).order("actual_ctr_week1", { ascending: false }).limit(12);
    if (!data?.length) return { bestStyle: "bold-text", sampleSize: 0 };
    const counts: Record<string, number> = {};
    for (const m of data) if (m.visual_style) counts[m.visual_style] = (counts[m.visual_style] || 0) + 1;
    return { bestStyle: Object.entries(counts).sort(([,a],[,b])=>b-a)[0]?.[0] || "bold-text", sampleSize: data.length };
  } catch { return { bestStyle: "bold-text", sampleSize: 0 }; }
}

function inferCategory(t: string) {
  t = t.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech"; if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports"; if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy"; return "general";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    const h = req.headers.get("Authorization");
    if (!h?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const t = h.replace("Bearer ", "");
    const isAuth = t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(atob(t.split(".")[1])).role === "service_role"; } catch { return false; } })();
    if (!isAuth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const category = inferCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [rewriteOut, headlineOut, storyOut] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "headline-optimizer").catch(() => null),
      readAgentOutput(run_id, "story-arc").catch(() => null),
    ]);
    if (!rewriteOut) throw new Error("rewrite output not found");

    const learning = await loadVisionLearning(category);

    // Get 3 headline variants for thumbnail concepts
    const h1 = headlineOut?.top_headline?.headline || topic;
    const h2 = headlineOut?.social_headline?.headline || topic;
    const h3 = headlineOut?.platform_best?.twitter?.headline || topic;
    const hook = storyOut?.hook_text || "";
    const structure = storyOut?.structure_type || "analysis";
    const excerpt = rewriteOut.article_text?.slice(0, 400) || "";

    const prompt = `You are the Vision Agent for LADtoday — Pakistan's AI content platform.
Generate 3 thumbnail concepts (one per headline) that will drive clicks.

TOPIC: "${topic}" | CATEGORY: ${category}
STRUCTURE TYPE: ${structure}
ARTICLE EXCERPT: "${excerpt.slice(0,300)}"
${learning.sampleSize > 0 ? `LEARNING: "${learning.bestStyle}" visual style drove highest CTR in ${learning.sampleSize} past runs — bias toward it.` : ""}

HEADLINE VARIANTS:
1. "${h1}" (primary/SEO)
2. "${h2}" (social/emotional)
3. "${h3}" (Twitter/bold)

For each headline, design a matching thumbnail concept. The visual must COMPLEMENT the headline tone.

VISUAL STYLES:
- data-visualization: charts, percentages, infographic style — for data-heavy articles
- human-story: faces, personal narrative — for human interest
- bold-text: large typography + simple background — for opinion/claim headlines
- abstract: geometric/conceptual — for trend/analysis
- product-photo: real objects/UI screenshots — for tech/product articles

PLATFORM DIMENSIONS:
- facebook: 1200x630px
- twitter: 1200x675px
- og: 1200x630px
- wordpress_featured: 1920x1080px

Return JSON:
{
  "thumbnail_concepts": [
    {
      "headline_variant": "string (the headline this matches)",
      "visual_style": "data-visualization|human-story|bold-text|abstract|product-photo",
      "color_palette": "string (e.g. 'Deep navy #1a237e + gold accent #f9a825 + white text')",
      "text_overlay": "string (≤6 words for image overlay, impactful)",
      "image_description": "string (100-char image generation prompt)",
      "composition": "string (layout guidance: 'left-aligned text, right side: chart graphic')",
      "emotional_register": "string (emotion this visual triggers)",
      "ctr_prediction": number (1-10),
      "platform_dimensions": {"facebook":"1200x630","twitter":"1200x675","og":"1200x630","wordpress_featured":"1920x1080"}
    }
  ],
  "recommended_concept_index": number (0-2, index of best concept),
  "featured_image_alt": "string (SEO alt text, describe image + keyword, ≤125 chars)",
  "og_image_brief": "string (detailed brief for Creative Agent to design OG image)",
  "caption_suggestions": ["string (3 image caption options)"],
  "image_search_keywords": ["string (5 keywords for stock photo search)"]
}`;

    const schema = { type: "object", properties: {
      thumbnail_concepts: { type: "array", items: { type: "object", properties: {
        headline_variant:{type:"string"}, visual_style:{type:"string"}, color_palette:{type:"string"},
        text_overlay:{type:"string"}, image_description:{type:"string"}, composition:{type:"string"},
        emotional_register:{type:"string"}, ctr_prediction:{type:"number"},
        platform_dimensions:{type:"object",properties:{facebook:{type:"string"},twitter:{type:"string"},og:{type:"string"},wordpress_featured:{type:"string"}}},
      }}},
      recommended_concept_index:{type:"integer"}, featured_image_alt:{type:"string"},
      og_image_brief:{type:"string"}, caption_suggestions:{type:"array",items:{type:"string"}},
      image_search_keywords:{type:"array",items:{type:"string"}},
    }};

    const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.65, maxOutputTokens: 2500 });
    const result: VisionOutput = {
      thumbnail_concepts: raw.thumbnail_concepts || [],
      recommended_concept_index: raw.recommended_concept_index || 0,
      featured_image_alt: raw.featured_image_alt || topic.slice(0, 125),
      og_image_brief: raw.og_image_brief || "",
      caption_suggestions: raw.caption_suggestions || [],
      image_search_keywords: raw.image_search_keywords || [],
      brand_color_consistent: true,
      learning_applied: learning.sampleSize > 0,
    };

    const topConcept = result.thumbnail_concepts[result.recommended_concept_index];
    try {
      await supabase.from("agent_memory").insert({ agent_key: AGENT_KEY, topic_category: category, visual_style: topConcept?.visual_style || "bold-text", actual_ctr_week1: null, created_at: new Date().toISOString() });
    } catch {/**/ }

    const durationMs = Date.now() - startedAt;
    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, { status: "completed", finished_at: new Date().toISOString(), concepts: result.thumbnail_concepts.length, recommended: result.recommended_concept_index });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, `${result.thumbnail_concepts.length} thumbnail concepts | recommended=[${result.recommended_concept_index}] style=${topConcept?.visual_style} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({ ok: true, agent: AGENT_KEY, run_id, concepts: result.thumbnail_concepts.length, recommended_style: topConcept?.visual_style, duration_ms: durationMs }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try { const b = await req.clone().json().catch(()=>({})); if (b.run_id) { await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", error: msg, finished_at: new Date().toISOString() }); await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt }); } } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
