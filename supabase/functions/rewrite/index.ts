// ============================================================
// Agent 03 — Rewrite Agent (10-agent pipeline)
// Phase: CREATE | Depends on: intelligence
// ============================================================
// Reads intelligence output (content_brief, best_angle, key_facts)
// and writes a full publish-ready HTML article.
// No dependency on fact-checker / story-arc / tone-calibrator —
// those are 50-agent pipeline agents not present here.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "rewrite";
const AGENT_NAME = "Rewrite";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RewriteOutput {
  article_html: string;
  article_text: string;
  word_count: number;
  section_count: number;
  headline_used: string;
  meta_description: string;
  social_caption: string;
  email_version: string;
  quotes_embedded: number;
  balance_directive_followed: boolean;
  localization_applied: boolean;
  self_review_notes: string;
  quality_score: number;
}

function inferCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|sbp|banking|payment/.test(t)) return "fintech";
  if (/tech|ai|startup|software/.test(t)) return "tech";
  if (/cricket|sport|psl/.test(t)) return "sports";
  if (/politics|government|minister/.test(t)) return "politics";
  if (/economy|inflation|rupee|gdp/.test(t)) return "economy";
  return "general";
}

async function writeArticle(
  topic: string,
  intelligence: any,
  brandVoice: string,
  language: string,
  model: string
): Promise<RewriteOutput> {
  const wordTarget = 1200;
  const brief = intelligence?.content_brief || "";
  const bestAngle = intelligence?.best_angle || topic;
  const keyFacts = (intelligence?.key_facts || [])
    .slice(0, 8)
    .map((f: any) => `[FACT] ${f.fact} (source: ${f.source_domain}, confidence: ${f.confidence})`)
    .join("\n");
  const entities = (intelligence?.entities || [])
    .slice(0, 6)
    .map((e: any) => e.name)
    .join(", ");
  const viralityFactors = (intelligence?.virality_factors || []).join(", ");
  const missingPerspectives = (intelligence?.missing_perspectives || []).join("; ");
  const readerPrereq = intelligence?.reader_prerequisite || "";
  const topicComplexity = intelligence?.topic_complexity || "moderate";
  const confidence = intelligence?.intelligence_confidence || "medium";

  const prompt = `You are a senior editor at a world-class Pakistani digital publication.
Write a complete, publication-ready article in semantic HTML.

TOPIC: "${topic}"
BEST ANGLE: "${bestAngle}"
BRAND VOICE: ${brandVoice}
LANGUAGE: ${language}
WORD TARGET: ${wordTarget} words
TOPIC COMPLEXITY: ${topicComplexity}
READER PREREQUISITE: ${readerPrereq}

━━━ CONTENT BRIEF (follow this precisely) ━━━
${brief || `Write a ${wordTarget}-word article about "${topic}" for a Pakistani audience. Open with a compelling statistic or question. Structure: Introduction, 3-4 body sections, Conclusion.`}

━━━ VERIFIED FACTS (use these — do NOT invent statistics) ━━━
${keyFacts || "Use general knowledge carefully. Attribute all statistics."}

━━━ KEY ENTITIES TO REFERENCE ━━━
${entities || "Reference relevant Pakistani organizations, people, and regulations."}

━━━ VIRALITY FACTORS ━━━
${viralityFactors || "Pakistan relevance, timeliness, informational value"}

━━━ MISSING PERSPECTIVES TO INCLUDE ━━━
${missingPerspectives || "Include government, industry, and citizen perspectives."}

━━━ HTML FORMATTING RULES ━━━
- Wrap article in <article> tag
- Use <h1> for the headline (exactly one, compelling, SEO-optimized)
- Use <h2> for each section heading (3-4 sections)
- Use <p> for paragraphs (3-4 sentences each)
- Bold key stats/terms: <strong>
- Lists where appropriate: <ul><li>
- NO inline styles. NO <style> tags. Semantic HTML only.
- Currency: use PKR/Rs. Large numbers: crore/lakh notation.
- Active voice. Sentences under 25 words. No AI clichés.

━━━ SELF-REVIEW ━━━
After writing, check: balance (multiple perspectives), attribution (all stats sourced),
Pakistan context (local relevance), word count (~${wordTarget}).
Rate quality 1-10.

Return JSON:
{
  "article_html": "string (full semantic HTML, minimum 900 words)",
  "meta_description": "string (140-155 chars, includes primary keyword, benefit-led)",
  "social_caption": "string (240-260 chars for Facebook/WhatsApp)",
  "email_version": "string (450-550 word plain text email version)",
  "quotes_embedded": number,
  "balance_directive_followed": boolean,
  "localization_applied": boolean,
  "self_review_notes": "string",
  "quality_score": number
}`;

  const schema = {
    type: "object",
    properties: {
      article_html: { type: "string" },
      meta_description: { type: "string" },
      social_caption: { type: "string" },
      email_version: { type: "string" },
      quotes_embedded: { type: "integer" },
      balance_directive_followed: { type: "boolean" },
      localization_applied: { type: "boolean" },
      self_review_notes: { type: "string" },
      quality_score: { type: "number" },
    },
    required: ["article_html", "meta_description", "social_caption", "email_version", "quality_score"],
  };

  const raw = await geminiJson<any>(prompt, schema, { model, temperature: 0.7, maxOutputTokens: 8192 });

  const plainText = (raw.article_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText.split(" ").filter(Boolean).length;
  const sectionCount = (raw.article_html || "").split("<h2").length - 1;
  const headlineMatch = (raw.article_html || "").match(/<h1[^>]*>(.*?)<\/h1>/i);
  const headline = headlineMatch ? headlineMatch[1].replace(/<[^>]+>/g, "").trim() : topic;

  // Store learning for future runs
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: inferCategory(topic),
      word_count: wordCount,
      section_count: sectionCount,
      quality_score: raw.quality_score || 7,
      actual_time_on_page: null,
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }

  return {
    article_html: raw.article_html || `<article><h1>${topic}</h1><p>Article generation failed.</p></article>`,
    article_text: plainText,
    word_count: wordCount,
    section_count: sectionCount,
    headline_used: headline,
    meta_description: raw.meta_description || topic.slice(0, 155),
    social_caption: raw.social_caption || "",
    email_version: raw.email_version || plainText.slice(0, 550),
    quotes_embedded: raw.quotes_embedded || 0,
    balance_directive_followed: raw.balance_directive_followed ?? true,
    localization_applied: raw.localization_applied ?? true,
    self_review_notes: raw.self_review_notes || "No self-review data",
    quality_score: raw.quality_score || 7,
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
    const language = run.language || "english";
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    // Read intelligence output
    const intelligenceOutput = await readAgentOutput(run_id, "intelligence");
    if (!intelligenceOutput) throw new Error("intelligence output not found — intelligence must complete before rewrite");

    console.log(`[${AGENT_NAME}] Writing article | angle="${intelligenceOutput.best_angle?.slice(0, 60)}" | facts=${intelligenceOutput.key_facts?.length || 0} | virality=${intelligenceOutput.virality_score}`);

    const result = await writeArticle(topic, intelligenceOutput, brandVoice, language, selectedModel);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, {
      tokens: Math.ceil(result.article_html.length / 3),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      word_count: result.word_count, section_count: result.section_count,
      quality_score: result.quality_score, headline_used: result.headline_used?.slice(0, 100),
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `words=${result.word_count} quality=${result.quality_score}/10 | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      word_count: result.word_count, quality_score: result.quality_score,
      headline_used: result.headline_used, duration_ms: durationMs,
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
