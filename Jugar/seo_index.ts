// ============================================================
// Agent 17 — SEO Agent (ENHANCED)
// Phase: CREATE | Model: gemini-2.5-flash | Depends on: rewrite(15), audience-listener(05)
// ============================================================
// ENHANCEMENT: FAQ section now directly answers audience_questions
// from Agent 05 — targets Featured Snippets and voice search.
// Also generates keyword density report and internal link strategy.
//
// LEARNING: Tracks predicted ranking position vs actual Google position.
// Adapts keyword strategy to what actually ranks.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "seo";
const AGENT_NAME = "SEO";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface SEOOutput {
  meta_title: string;               // 50-60 chars, keyword-first
  meta_description: string;         // 140-155 chars, benefit-led with CTA
  focus_keyword: string;            // primary target keyword
  secondary_keywords: string[];     // 3-5 secondary keywords
  keyword_density_report: Record<string, number>; // keyword → occurrence count
  lsi_keywords: string[];           // latent semantic indexing terms to include
  faq_section_html: string;         // HTML FAQ from audience questions (for Featured Snippet)
  faq_items: Array<{ question: string; answer: string }>; // structured FAQ data
  title_tag_variants: string[];     // 3 title tag options for testing
  canonical_url_slug: string;       // SEO-friendly URL slug
  internal_link_strategy: string;   // guidance for Internal Linker agent
  google_news_headline: string;     // Google News optimized headline
  search_intent: "informational" | "navigational" | "transactional" | "commercial";
  featured_snippet_opportunity: boolean;
  featured_snippet_format: "paragraph" | "list" | "table" | "none";
  estimated_difficulty: number;     // 1-10 (10 = very hard to rank)
  pakistan_search_volume: string;   // "high" | "medium" | "low" estimate
  learning_applied: boolean;
}

async function loadSeoLearning(category: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("focus_keyword,actual_google_position,search_intent")
      .eq("agent_key", AGENT_KEY).in("topic_category", [category, "general"])
      .not("actual_google_position", "is", null).order("actual_google_position").limit(15);
    if (!data?.length) return { bestIntent: "informational", avgRankingKeywordLength: 4, sampleSize: 0 };
    const intents: Record<string, number> = {};
    let totalKwLen = 0;
    for (const m of data) {
      if (m.search_intent) intents[m.search_intent] = (intents[m.search_intent] || 0) + 1;
      totalKwLen += (m.focus_keyword || "").split(" ").length;
    }
    return { bestIntent: Object.entries(intents).sort(([,a],[,b])=>b-a)[0]?.[0] || "informational", avgRankingKeywordLength: Math.round(totalKwLen / data.length), sampleSize: data.length };
  } catch { return { bestIntent: "informational", avgRankingKeywordLength: 4, sampleSize: 0 }; }
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
    const h = req.headers.get("Authorization"); if (!h?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const t = h.replace("Bearer ", ""); const isAuth = t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(atob(t.split(".")[1])).role === "service_role"; } catch { return false; } })();
    if (!isAuth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const category = inferCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [rewriteOut, audienceOut, headlineOut] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "audience-listener").catch(() => null),
      readAgentOutput(run_id, "headline-optimizer").catch(() => null),
    ]);
    if (!rewriteOut) throw new Error("rewrite output not found");

    const learning = await loadSeoLearning(category);
    const articleText = rewriteOut.article_text?.slice(0, 3000) || "";
    const audienceQuestions = (audienceOut?.top_questions || []).slice(0, 5);
    const faqSuggestions = (audienceOut?.faq_suggestions || []).slice(0, 4);
    const primaryKeyword = headlineOut?.primary_keyword_used || topic;
    const metaDesc = rewriteOut.meta_description || "";
    const headline = rewriteOut.headline_used || topic;

    const prompt = `You are the SEO Agent for LADtoday — Pakistan's AI content platform.
Optimize this article for Google Pakistan search + Featured Snippets.

TOPIC: "${topic}" | CATEGORY: ${category}
HEADLINE: "${headline}"
EXISTING META DESC: "${metaDesc}"
PRIMARY KEYWORD (from Headline Optimizer): "${primaryKeyword}"
${learning.sampleSize > 0 ? `LEARNING (${learning.sampleSize} past articles): Best-ranking intent="${learning.bestIntent}", optimal keyword length=${learning.avgRankingKeywordLength} words.` : ""}

ARTICLE TEXT (first 2500 chars):
${articleText.slice(0, 2500)}

AUDIENCE QUESTIONS (from Audience Listener — use ALL for FAQ section):
${audienceQuestions.map((q:string,i:number)=>`${i+1}. ${q}`).join("\n") || "1. What is happening with this topic in Pakistan?\n2. How does this affect ordinary Pakistanis?\n3. What should I do about this?"}

ADDITIONAL FAQ SUGGESTIONS:
${faqSuggestions.join("\n") || "none"}

━━━ SEO OPTIMIZATION RULES ━━━

META TITLE (50-60 chars):
- Start with primary keyword
- Include "Pakistan" if not already in keyword
- Include year (2024/2025) for news content
- No clickbait — Google penalizes

META DESCRIPTION (140-155 chars):
- First sentence: what the article covers
- Second sentence: why it matters / benefit to reader
- Include primary keyword naturally
- End with soft CTA: "Read more" or "Here's what you need to know"

FAQ SECTION (answer ALL audience questions):
- Use proper HTML: <div class="faq-section"><h2>Frequently Asked Questions</h2>
  <div class="faq-item"><h3 class="faq-question">Q: string</h3><p class="faq-answer">A: 40-60 word answer</p></div>...
- Answers: 40-60 words, direct, start with affirmative/direct answer
- This format is optimized for Google Featured Snippet extraction

FEATURED SNIPPET OPPORTUNITY:
- "paragraph" snippet: if article answers a clear "what is X" question → 40-60 word summary
- "list" snippet: if article has numbered steps or ranked list
- "table" snippet: if article compares options with data
- "none": if no clear snippet opportunity

KEYWORD DENSITY (optimal range 1-2%):
- focus_keyword: aim for 1-1.5% of article
- No keyword stuffing

LSI KEYWORDS (related terms Google associates with topic):
- 5-8 semantically related terms already in article or to add

Return JSON:
{
  "meta_title": "string (50-60 chars)",
  "meta_description": "string (140-155 chars)",
  "focus_keyword": "string",
  "secondary_keywords": ["string"],
  "keyword_density_report": {"keyword": number_occurrences},
  "lsi_keywords": ["string"],
  "faq_section_html": "string (full HTML faq block)",
  "faq_items": [{"question":"string","answer":"string (40-60 words)"}],
  "title_tag_variants": ["string (3 options)"],
  "canonical_url_slug": "string (lowercase-hyphenated-slug)",
  "internal_link_strategy": "string (guidance for Internal Linker)",
  "google_news_headline": "string (Google News optimized)",
  "search_intent": "informational|navigational|transactional|commercial",
  "featured_snippet_opportunity": boolean,
  "featured_snippet_format": "paragraph|list|table|none",
  "estimated_difficulty": number (1-10),
  "pakistan_search_volume": "high|medium|low"
}`;

    const schema = { type: "object", properties: {
      meta_title:{type:"string"}, meta_description:{type:"string"}, focus_keyword:{type:"string"},
      secondary_keywords:{type:"array",items:{type:"string"}},
      keyword_density_report:{type:"object"}, lsi_keywords:{type:"array",items:{type:"string"}},
      faq_section_html:{type:"string"}, faq_items:{type:"array",items:{type:"object",properties:{question:{type:"string"},answer:{type:"string"}}}},
      title_tag_variants:{type:"array",items:{type:"string"}}, canonical_url_slug:{type:"string"},
      internal_link_strategy:{type:"string"}, google_news_headline:{type:"string"},
      search_intent:{type:"string"}, featured_snippet_opportunity:{type:"boolean"},
      featured_snippet_format:{type:"string"}, estimated_difficulty:{type:"number"}, pakistan_search_volume:{type:"string"},
    }};

    const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.4, maxOutputTokens: 3500 });
    const result: SEOOutput = { ...raw, learning_applied: learning.sampleSize > 0 };

    try {
      await supabase.from("agent_memory").insert({ agent_key: AGENT_KEY, topic_category: category, focus_keyword: raw.focus_keyword || topic, search_intent: raw.search_intent || "informational", actual_google_position: null, created_at: new Date().toISOString() });
    } catch {/**/ }

    const durationMs = Date.now() - startedAt;
    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, { status: "completed", finished_at: new Date().toISOString(), focus_keyword: result.focus_keyword, faq_items: result.faq_items?.length, featured_snippet: result.featured_snippet_opportunity, difficulty: result.estimated_difficulty });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, `kw="${result.focus_keyword}" intent=${result.search_intent} snippet=${result.featured_snippet_opportunity} difficulty=${result.estimated_difficulty}/10 faqs=${result.faq_items?.length} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({ ok: true, agent: AGENT_KEY, run_id, focus_keyword: result.focus_keyword, featured_snippet_opportunity: result.featured_snippet_opportunity, faq_items: result.faq_items?.length, estimated_difficulty: result.estimated_difficulty, duration_ms: durationMs }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try { const b = await req.clone().json().catch(()=>({})); if (b.run_id) { await patchAgentState(b.run_id, AGENT_KEY, { status:"failed", finished_at:new Date().toISOString(), error:msg }); await writeAgentOutput(b.run_id, AGENT_KEY, { error:msg }, { status:"failed", error:msg, duration_ms:Date.now()-startedAt }); } } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
