// ============================================================
// Agent 05 — Vision Agent
// Phase: CREATE | Depends on: rewrite
// ============================================================
// Recommends images, generates ALT text, creates infographic data
// Handles image_mode=true from Scout (image input)
// ============================================================

import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { aiJson } from "../_shared/ai-provider.ts";
import { generateImage } from "../_shared/image-gen.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "vision";
const AGENT_NAME = "Vision Agent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VisionOutput {
  hero_image: {
    query: string;
    alt_text: string;
    caption: string;
    unsplash_url: string;
    generated_url?: string | null;
    generation_provider?: string;
  };
  inline_images: {
    placement: string;
    query: string;
    alt_text: string;
    caption: string;
  }[];
  infographic_data: {
    should_create: boolean;
    type: "comparison" | "timeline" | "stats" | "flow" | "none";
    title: string;
    data_points: string[];
    color_scheme: string;
  };
  og_image_description: string;
  og_image_url?: string | null;
  image_mode_analysis?: string;
  accessibility_notes: string[];
}

async function generateVisionRecommendations(
  topic: string,
  articleHtml: string,
  scoutOutput: any,
  model: string
): Promise<VisionOutput> {
  const plainText = articleHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
  const imageMode = scoutOutput?.image_mode === true;
  const imageUrl = scoutOutput?.image_url || "";

  const prompt = `You are a visual content strategist for LADtoday — Pakistan's AI content platform.
Generate image recommendations for this article.

TOPIC: ${topic}
ARTICLE SUMMARY: ${plainText}
${imageMode ? `IMAGE INPUT MODE: User provided an image. Analyze the image context and recommend supporting visuals.` : ""}
${imageUrl ? `IMAGE URL: ${imageUrl}` : ""}

Return ONLY valid JSON:
{
  "hero_image": {
    "query": "Specific Unsplash/Pexels search query for hero image (be specific, not generic)",
    "alt_text": "SEO-optimized alt text under 125 chars describing the image",
    "caption": "Descriptive caption for the image (1-2 sentences)",
    "unsplash_url": "https://unsplash.com/s/photos/[search-term]"
  },
  "inline_images": [
    {
      "placement": "after second paragraph",
      "query": "specific search query",
      "alt_text": "alt text under 125 chars",
      "caption": "caption"
    }
  ],
  "infographic_data": {
    "should_create": true,
    "type": "stats",
    "title": "Key Statistics: [Topic]",
    "data_points": ["Stat 1 with number", "Stat 2 with number", "Stat 3 with number"],
    "color_scheme": "orange-dark"
  },
  "og_image_description": "Description for social media preview image (for OG tags)",
  ${imageMode ? `"image_mode_analysis": "Analysis of what the provided image shows and how it relates to the article",` : ""}
  "accessibility_notes": ["Note 1 about image accessibility", "Note 2"]
}`;

  const schema = {
    type: "object",
    properties: {
      hero_image: { type: "object" },
      inline_images: { type: "array" },
      infographic_data: { type: "object" },
      og_image_description: { type: "string" },
      image_mode_analysis: { type: "string" },
      accessibility_notes: { type: "array", items: { type: "string" } },
    },
    required: ["hero_image", "inline_images", "infographic_data", "og_image_description", "accessibility_notes"],
  };

  let raw: any;
  try {
    const { result } = await aiJson<any>(prompt, schema, { prefer: "auto", model, aimlModel: "gpt-4o-mini", temperature: 0.4, maxOutputTokens: 800 });
    raw = result;
  } catch (err) {
    console.error(`[${AGENT_NAME}] AI providers failed, using template:`, err);
    raw = {
      hero_image: { query: topic, alt_text: `Image illustrating ${topic}`, caption: topic, unsplash_url: `https://unsplash.com/s/photos/${encodeURIComponent(topic)}` },
      inline_images: [],
      infographic_data: { should_create: false, type: "none", title: "", data_points: [], color_scheme: "orange-dark" },
      og_image_description: `Social preview for ${topic}`,
      accessibility_notes: ["Ensure all images have descriptive alt text"],
    };
  }

  return {
    hero_image: raw.hero_image || {
      query: topic,
      alt_text: topic,
      caption: topic,
      unsplash_url: `https://unsplash.com/s/photos/${encodeURIComponent(topic)}`,
    },
    inline_images: raw.inline_images || [],
    infographic_data: raw.infographic_data || { should_create: false, type: "none", title: "", data_points: [], color_scheme: "orange-dark" },
    og_image_description: raw.og_image_description || topic,
    image_mode_analysis: raw.image_mode_analysis,
    accessibility_notes: raw.accessibility_notes || ["Ensure all images have descriptive alt text", "Use captions for context"],
  };
}

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch { /* */ }
  return false;
}

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

    const [rewriteOutput, scoutOutput] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "scout"),
    ]);

    if (!rewriteOutput) throw new Error("rewrite output not found");

    const visionOutput = await generateVisionRecommendations(topic, rewriteOutput.article_html || "", scoutOutput, selectedModel);

    // Generate hero image (Lovable → Gemini cascade). Non-fatal if both fail.
    const generateImages = run?.input_payload?.generate_images !== false;
    if (generateImages) {
      const heroPrompt = `Editorial hero photo for an article about: ${visionOutput.hero_image.query || topic}. ${visionOutput.hero_image.caption || ""}. Pakistani context, photojournalism style, vivid, news-magazine quality, 16:9 composition.`;
      const heroResult = await generateImage(heroPrompt, { prefix: "hero" });
      visionOutput.hero_image.generated_url = heroResult.url;
      visionOutput.hero_image.generation_provider = heroResult.provider;
      if (visionOutput.og_image_description) {
        const ogResult = await generateImage(
          `Social share OG image: ${visionOutput.og_image_description}. Bold composition, readable at small sizes.`,
          { prefix: "og" }
        );
        visionOutput.og_image_url = ogResult.url;
      }
      await insertLog("ai", AGENT_KEY, "Image generation", `hero=${heroResult.provider} url=${heroResult.url ? "ok" : "none"}`, { run_id });
    }

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, visionOutput, { tokens: 500, duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      hero_image_query: visionOutput.hero_image.query,
      hero_image_url: visionOutput.hero_image.generated_url,
      infographic_created: visionOutput.infographic_data.should_create,
      image_mode: scoutOutput?.image_mode || false,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, `hero="${visionOutput.hero_image.query}" | infographic=${visionOutput.infographic_data.should_create} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({ ok: true, agent: AGENT_KEY, run_id, hero_query: visionOutput.hero_image.query, duration_ms: durationMs }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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
