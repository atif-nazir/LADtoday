// ============================================================
// Agent 06 — Creative Agent
// Phase: CREATE | Depends on: rewrite, seo
// ============================================================
// Generates headline variants, hooks, social snippets, CTAs
// A/B variants for testing via Analytics Agent
// ============================================================

import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "creative";
const AGENT_NAME = "Creative Agent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HeadlineVariant {
  variant: string;
  type: "question" | "number" | "shock" | "how-to" | "contrarian" | "data-led";
  predicted_ctr: number;
  character_count: number;
}

interface CreativeOutput {
  headlines: HeadlineVariant[];
  top_headline: string;
  hooks: string[];
  cta_variants: string[];
  social_snippets: {
    twitter: string;
    linkedin: string;
    facebook: string;
    whatsapp: string;
  };
  email_subject_lines: string[];
  push_notification: string;
  ab_test_pairs: { a: string; b: string; test_dimension: string }[];
}

async function generateCreativeVariants(
  topic: string,
  articleHtml: string,
  intelligenceOutput: any,
  seoOutput: any,
  brandVoice: string,
  model: string
): Promise<CreativeOutput> {
  const headline = articleHtml.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || topic;
  const summary = intelligenceOutput?.best_angle || intelligenceOutput?.content_brief?.slice(0, 200) || topic;
  const focusKeyword = seoOutput?.focus_keyword || topic;
  const viralityScore = intelligenceOutput?.virality_score || 5;

  const prompt = `You are a world-class content strategist for LADtoday — Pakistan's AI content platform.
Generate creative variants for maximum engagement.

ARTICLE HEADLINE: ${headline}
TOPIC: ${topic}
BEST ANGLE: ${summary}
FOCUS KEYWORD: ${focusKeyword}
VIRALITY SCORE: ${viralityScore}/10
BRAND VOICE: ${brandVoice}

Return ONLY valid JSON:
{
  "headlines": [
    {"variant": "Question format headline?", "type": "question", "predicted_ctr": 0.08, "character_count": 45},
    {"variant": "7 Facts About X That Change Everything", "type": "number", "predicted_ctr": 0.07, "character_count": 42},
    {"variant": "The Uncomfortable Truth About X", "type": "contrarian", "predicted_ctr": 0.09, "character_count": 35},
    {"variant": "How Pakistan's X Teams Are Solving Y in 2026", "type": "how-to", "predicted_ctr": 0.06, "character_count": 48},
    {"variant": "Data: X Shows 47% Growth in Pakistan", "type": "data-led", "predicted_ctr": 0.085, "character_count": 40}
  ],
  "top_headline": "The single best headline from the list above",
  "hooks": [
    "Compelling first sentence variant 1 (under 25 words, starts with fact or stat)",
    "Compelling first sentence variant 2 (under 25 words, starts with question)"
  ],
  "cta_variants": [
    "Get the full analysis →",
    "See how teams are doing this →",
    "Read the complete breakdown"
  ],
  "social_snippets": {
    "twitter": "Tweet under 280 chars with hook + [URL] placeholder",
    "linkedin": "LinkedIn post 3-4 sentences. Professional insight framing. [URL]",
    "facebook": "Facebook post 2-3 sentences. Conversational. Emoji ok. [URL]",
    "whatsapp": "WhatsApp broadcast message. Concise. 1-2 sentences. [URL]"
  },
  "email_subject_lines": [
    "Subject line 1 (under 50 chars, creates curiosity)",
    "Subject line 2 (under 50 chars, benefit-led)"
  ],
  "push_notification": "Push notification under 100 chars",
  "ab_test_pairs": [
    {"a": "Headline A", "b": "Headline B", "test_dimension": "question_vs_number"},
    {"a": "Hook A", "b": "Hook B", "test_dimension": "stat_vs_question_opening"}
  ]
}`;

  const schema = {
    type: "object",
    properties: {
      headlines: { type: "array" },
      top_headline: { type: "string" },
      hooks: { type: "array", items: { type: "string" } },
      cta_variants: { type: "array", items: { type: "string" } },
      social_snippets: { type: "object" },
      email_subject_lines: { type: "array", items: { type: "string" } },
      push_notification: { type: "string" },
      ab_test_pairs: { type: "array" },
    },
    required: ["headlines", "top_headline", "hooks", "cta_variants", "social_snippets"],
  };

  const raw = await geminiJson<any>(prompt, schema, { model, temperature: 0.8, maxOutputTokens: 1200 });

  return {
    headlines: (raw.headlines || []).map((h: any) => ({
      variant: h.variant || headline,
      type: h.type || "default",
      predicted_ctr: h.predicted_ctr || 0.05,
      character_count: h.character_count || (h.variant || headline).length,
    })),
    top_headline: raw.top_headline || headline,
    hooks: raw.hooks || [],
    cta_variants: raw.cta_variants || ["Read more →"],
    social_snippets: {
      twitter: raw.social_snippets?.twitter || `${headline} [URL]`,
      linkedin: raw.social_snippets?.linkedin || `${headline} [URL]`,
      facebook: raw.social_snippets?.facebook || `${headline} [URL]`,
      whatsapp: raw.social_snippets?.whatsapp || `${headline} [URL]`,
    },
    email_subject_lines: raw.email_subject_lines || [headline.slice(0, 50)],
    push_notification: raw.push_notification || headline.slice(0, 100),
    ab_test_pairs: raw.ab_test_pairs || [],
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
    const brandVoice = run.brand_voice || "professional";
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [rewriteOutput, intelligenceOutput, seoOutput] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "intelligence"),
      readAgentOutput(run_id, "seo"),
    ]);

    if (!rewriteOutput) throw new Error("rewrite output not found");

    const creativeOutput = await generateCreativeVariants(
      topic, rewriteOutput.article_html || "", intelligenceOutput, seoOutput, brandVoice, selectedModel
    );
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, creativeOutput, { tokens: 600, duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      top_headline: creativeOutput.top_headline?.slice(0, 100),
      headline_variants: creativeOutput.headlines.length,
      ab_tests: creativeOutput.ab_test_pairs.length,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${creativeOutput.headlines.length} headlines | top="${creativeOutput.top_headline?.slice(0, 60)}" | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      top_headline: creativeOutput.top_headline,
      headline_variants: creativeOutput.headlines.length,
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
