// ============================================================
// Agent 04 — SEO Agent (Bright Data SERP API)
// Phase: CREATE | Depends on: rewrite
// ============================================================
// Uses Bright Data SERP API for REAL keyword data:
// - People Also Ask questions
// - Related searches
// - Top competitor snippets
// Without Bright Data: keyword data is guessed. With it: live.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { aiJson } from "../_shared/ai-provider.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "seo";
const AGENT_NAME = "SEO Agent";

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Bright Data SERP API ─────────────────────────────────────────────────────
// Returns real People Also Ask, related searches, and top competitor snippets
// This is live data — not guessed keywords

interface SerpData {
  paa: { question: string; answer?: string }[];
  related_searches: string[];
  top_results: { title: string; snippet: string; url: string }[];
  bright_data_used: boolean;
}

async function getKeywordDataFromBrightData(keyword: string, geo = "pk"): Promise<SerpData> {
  if (!BRIGHTDATA_API_TOKEN) {
    console.log(`[${AGENT_NAME}] No Bright Data token — using fallback keyword extraction`);
    return { paa: [], related_searches: [], top_results: [], bright_data_used: false };
  }

  try {
    const params = new URLSearchParams({
      q: keyword,
      gl: geo,
      hl: "en",
      num: "10",
      feature: "paa,related_searches",
    });

    const response = await fetch(
      `https://api.brightdata.com/serp/google/search?${params}`,
      {
        headers: {
          "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.error(`[${AGENT_NAME}] Bright Data SERP error: ${response.status}`);
      return { paa: [], related_searches: [], top_results: [], bright_data_used: false };
    }

    const data = await response.json();

    return {
      paa: (data.people_also_ask || []).slice(0, 5).map((q: any) => ({
        question: q.question || q.text || "",
        answer: q.answer || q.snippet || "",
      })),
      related_searches: (data.related_searches || []).slice(0, 8).map((r: any) => r.query || r.text || r),
      top_results: (data.organic || []).slice(0, 3).map((r: any) => ({
        title: r.title || "",
        snippet: r.snippet || "",
        url: r.link || r.url || "",
      })),
      bright_data_used: true,
    };
  } catch (err) {
    console.error(`[${AGENT_NAME}] Bright Data SERP failed:`, err);
    return { paa: [], related_searches: [], top_results: [], bright_data_used: false };
  }
}

// ─── Keyword extraction from article text ────────────────────────────────────

function extractKeywordsFromText(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to",
    "for", "of", "and", "or", "but", "with", "this", "that", "it", "be",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "not", "from", "by", "as",
    "its", "their", "they", "we", "you", "he", "she", "his", "her", "our",
  ]);

  const words = text.toLowerCase().split(/\W+/);
  const freq: Record<string, number> = {};
  words.forEach((w) => {
    if (w.length > 4 && !stopWords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k]) => k);
}

// ─── SEO metadata generation ──────────────────────────────────────────────────

interface SEOOutput {
  meta_title: string;
  meta_description: string;
  focus_keyword: string;
  secondary_keywords: string[];
  url_slug: string;
  schema_type: string;
  seo_score: number;
  suggested_headers: string[];
  internal_link_anchors: string[];
  paa_questions: string[];
  related_searches: string[];
  bright_data_used: boolean;
  keyword_density: number;
  readability_grade: string;
  estimated_serp_position: number;
}

async function generateSEOMetadata(
  topic: string,
  articleHtml: string,
  serpData: SerpData,
  model: string
): Promise<SEOOutput> {
  const plainText = articleHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const topKeywords = extractKeywordsFromText(plainText);

  // Extract headline from HTML
  const headlineMatch = articleHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const headline = headlineMatch
    ? headlineMatch[1].replace(/<[^>]+>/g, "").trim()
    : topic;

  const paaQuestions = serpData.paa.map((q) => q.question).filter(Boolean);
  const relatedSearches = serpData.related_searches.filter(Boolean);

  const prompt = `You are an SEO specialist for LADtoday — Pakistan's AI content platform.
Generate comprehensive SEO metadata for this article.

ARTICLE HEADLINE: ${headline}
TOPIC: ${topic}
TOP KEYWORDS FROM ARTICLE: ${topKeywords.slice(0, 10).join(", ")}
${paaQuestions.length > 0 ? `PEOPLE ALSO ASK (from Bright Data SERP API): ${paaQuestions.slice(0, 4).join(" | ")}` : ""}
${relatedSearches.length > 0 ? `RELATED SEARCHES (from Bright Data): ${relatedSearches.slice(0, 6).join(", ")}` : ""}
${serpData.top_results.length > 0 ? `TOP COMPETITOR SNIPPETS:\n${serpData.top_results.map(r => `- ${r.title}: ${r.snippet.slice(0, 100)}`).join("\n")}` : ""}

Return ONLY valid JSON:
{
  "meta_title": "SEO title under 60 characters with primary keyword",
  "meta_description": "Compelling description 140-160 chars with primary keyword and benefit",
  "focus_keyword": "single primary keyword phrase (2-4 words)",
  "secondary_keywords": ["3-5 secondary keyword phrases"],
  "url_slug": "hyphenated-url-slug-under-60-chars",
  "schema_type": "Article",
  "seo_score": 78,
  "suggested_headers": ["H2 suggestion 1", "H2 suggestion 2", "H2 suggestion 3"],
  "internal_link_anchors": ["2-3 anchor text suggestions for internal linking"],
  "readability_grade": "Grade 8",
  "estimated_serp_position": 12
}`;

  const schema = {
    type: "object",
    properties: {
      meta_title: { type: "string" },
      meta_description: { type: "string" },
      focus_keyword: { type: "string" },
      secondary_keywords: { type: "array", items: { type: "string" } },
      url_slug: { type: "string" },
      schema_type: { type: "string" },
      seo_score: { type: "number" },
      suggested_headers: { type: "array", items: { type: "string" } },
      internal_link_anchors: { type: "array", items: { type: "string" } },
      readability_grade: { type: "string" },
      estimated_serp_position: { type: "number" },
    },
    required: ["meta_title", "meta_description", "focus_keyword", "secondary_keywords", "url_slug", "seo_score"],
  };

  let raw: any;
  try {
    const { result } = await aiJson<any>(prompt, schema, {
      prefer: "auto", model, aimlModel: "gpt-4o-mini",
      temperature: 0.2, maxOutputTokens: 800,
    });
    raw = result;
  } catch (err) {
    console.error(`[${AGENT_NAME}] AI providers failed, using heuristic SEO:`, err);
    raw = {
      meta_title: headline.slice(0, 60),
      meta_description: (topic + " — " + plainText.slice(0, 120)).slice(0, 155),
      focus_keyword: topKeywords[0] || topic,
      secondary_keywords: topKeywords.slice(1, 5),
      url_slug: topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      schema_type: "Article",
      seo_score: 55,
      suggested_headers: paaQuestions.slice(0, 3),
      internal_link_anchors: topKeywords.slice(0, 3),
      readability_grade: "Grade 9",
      estimated_serp_position: 20,
    };
  }

  // Calculate keyword density
  const focusKeyword = raw.focus_keyword || topic;
  const keywordCount = (plainText.toLowerCase().match(new RegExp(focusKeyword.toLowerCase(), "g")) || []).length;
  const wordCount = plainText.split(/\s+/).length;
  const keywordDensity = wordCount > 0 ? Math.round((keywordCount / wordCount) * 1000) / 10 : 0;

  return {
    meta_title: raw.meta_title || headline.slice(0, 60),
    meta_description: raw.meta_description || topic.slice(0, 155),
    focus_keyword: focusKeyword,
    secondary_keywords: raw.secondary_keywords || topKeywords.slice(0, 4),
    url_slug: raw.url_slug || topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
    schema_type: raw.schema_type || "Article",
    seo_score: raw.seo_score || 65,
    suggested_headers: raw.suggested_headers || [],
    internal_link_anchors: raw.internal_link_anchors || [],
    paa_questions: paaQuestions,
    related_searches: relatedSearches,
    bright_data_used: serpData.bright_data_used,
    keyword_density: keywordDensity,
    readability_grade: raw.readability_grade || "Grade 8",
    estimated_serp_position: raw.estimated_serp_position || 15,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const p = JSON.parse(atob(t.split(".")[1]));
    if (p.role === "service_role") return true;
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
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    // Load rewrite output
    const rewriteOutput = await readAgentOutput(run_id, "rewrite");
    if (!rewriteOutput) throw new Error("rewrite output not found. Rewrite must complete before SEO.");

    const articleHtml = rewriteOutput.article_html || "";
    console.log(`[${AGENT_NAME}] Article length: ${articleHtml.length} chars`);

    // Get real keyword data from Bright Data SERP API
    console.log(`[${AGENT_NAME}] Querying Bright Data SERP API for "${topic}"...`);
    const serpData = await getKeywordDataFromBrightData(topic);
    console.log(`[${AGENT_NAME}] Bright Data: ${serpData.bright_data_used ? "✅" : "⚠️ fallback"} | PAA: ${serpData.paa.length} | Related: ${serpData.related_searches.length}`);

    // Generate SEO metadata
    const seoOutput = await generateSEOMetadata(topic, articleHtml, serpData, selectedModel);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, seoOutput, {
      tokens: Math.ceil(JSON.stringify(seoOutput).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      seo_score: seoOutput.seo_score,
      focus_keyword: seoOutput.focus_keyword,
      bright_data_used: seoOutput.bright_data_used,
      paa_count: seoOutput.paa_questions.length,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `seo_score=${seoOutput.seo_score} | keyword="${seoOutput.focus_keyword}" | bright_data=${seoOutput.bright_data_used} | ${durationMs}ms`,
      { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      seo_score: seoOutput.seo_score,
      focus_keyword: seoOutput.focus_keyword,
      bright_data_used: seoOutput.bright_data_used,
      paa_questions: seoOutput.paa_questions.length,
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
