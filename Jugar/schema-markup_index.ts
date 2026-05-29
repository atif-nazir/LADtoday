// ============================================================
// Agent 20 — Schema Markup Agent (ENHANCED — full Schema Architect)
// Phase: CREATE | Model: gemini-2.5-flash
// Depends on: seo(17), readability(18), internal-linker(19)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md — Schema Architect):
// 1. Determine content type from story_arc:
//    News report → NewsArticle | How-to → HowTo + BreadcrumbList
//    Data analysis → Article + Dataset | Event → Event | Video → VideoObject
// 2. Extract structured data elements from article:
//    HowTo: parse numbered steps | Event: date/location | FAQ: Q&A pairs
// 3. Generate complete JSON-LD block (validated against schema.org)
// 4. Generate OpenGraph meta tags (og:title/description/image/type)
// 5. Generate Twitter Card meta tags
// 6. Combine: schema_block = complete <head> injection for WordPress
//
// LEARNING: Tracks which schema types led to rich result impressions in GSC.
// Adapts schema type selection for each content category.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "schema-markup";
const AGENT_NAME = "Schema Markup";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

type SchemaType = "NewsArticle" | "HowTo" | "Article" | "Event" | "VideoObject" | "FAQPage" | "Dataset";

interface SchemaOutput {
  primary_schema_type: SchemaType;
  schema_types_applied: SchemaType[];
  json_ld_blocks: string[];        // array of complete JSON-LD script tags
  og_tags: string;                 // HTML string of OpenGraph meta tags
  twitter_card_tags: string;       // HTML string of Twitter Card meta tags
  complete_head_injection: string; // all of the above combined — paste into <head>
  rich_result_types_targeted: string[];
  snippet_eligibility: {
    faq_rich_result: boolean; howto_rich_result: boolean;
    news_rich_result: boolean; event_rich_result: boolean;
  };
  schema_validation_notes: string[];
  learning_applied: boolean;
  schema_type_historically_best: string;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadSchemaLearning(category: string): Promise<{
  bestSchemaType: SchemaType;
  richResultRate: number;  // 0-1, how often schema led to rich results
  sampleSize: number;
}> {
  try {
    const { data } = await supabase.from("agent_memory").select("primary_schema_type,got_rich_result")
      .eq("agent_key", AGENT_KEY).in("topic_category", [category, "general"])
      .order("created_at", { ascending: false }).limit(20);
    if (!data?.length) return { bestSchemaType: "NewsArticle", richResultRate: 0, sampleSize: 0 };
    const counts: Record<string, number> = {};
    const richResults = data.filter(m => m.got_rich_result === true).length;
    for (const m of data) if (m.primary_schema_type) counts[m.primary_schema_type] = (counts[m.primary_schema_type] || 0) + 1;
    const bestSchemaType = (Object.entries(counts).sort(([,a],[,b])=>b-a)[0]?.[0] || "NewsArticle") as SchemaType;
    return { bestSchemaType, richResultRate: richResults / data.length, sampleSize: data.length };
  } catch { return { bestSchemaType: "NewsArticle", richResultRate: 0, sampleSize: 0 }; }
}

function inferCategory(t: string) {
  t = t.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech"; if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports"; if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy"; return "general";
}

// ─── Site Config from DB ──────────────────────────────────────────────────────

async function loadSiteConfig() {
  try {
    const { data } = await supabase.from("site_settings").select("key,value");
    const cfg: Record<string, string> = {};
    for (const row of data || []) cfg[row.key] = row.value;
    return {
      siteName: cfg.site_name || "LADtoday",
      siteUrl: cfg.site_url || "https://ladtoday.com",
      logoUrl: cfg.logo_url || "https://ladtoday.com/logo.png",
      twitterHandle: cfg.twitter_handle || "@LADtoday",
      facebookAppId: cfg.facebook_app_id || "",
    };
  } catch {
    return { siteName: "LADtoday", siteUrl: "https://ladtoday.com", logoUrl: "https://ladtoday.com/logo.png", twitterHandle: "@LADtoday", facebookAppId: "" };
  }
}

// ─── Core Schema Generation ───────────────────────────────────────────────────

async function generateSchema(
  topic: string,
  rewriteOut: any,
  seoOut: any,
  readabilityOut: any,
  storyArcOut: any,
  site: Awaited<ReturnType<typeof loadSiteConfig>>,
  category: string,
  learning: Awaited<ReturnType<typeof loadSchemaLearning>>
): Promise<SchemaOutput> {

  const articleHtml = readabilityOut?.optimized_article_html || rewriteOut?.article_html || "";
  const articleText = rewriteOut?.article_text || articleHtml.replace(/<[^>]+>/g, " ");
  const headline = rewriteOut?.headline_used || topic;
  const metaDesc = seoOut?.meta_description || rewriteOut?.meta_description || "";
  const focusKw = seoOut?.focus_keyword || topic;
  const faqItems = seoOut?.faq_items || [];
  const structureType = storyArcOut?.structure_type || "analysis";
  const urlSlug = seoOut?.canonical_url_slug || topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const canonicalUrl = `${site.siteUrl}/${urlSlug}`;
  const authorName = "LADtoday Editorial Team";
  const publishDate = new Date().toISOString();

  const learningNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} past articles): Best schema type for this category: "${learning.bestSchemaType}" (rich result rate: ${(learning.richResultRate * 100).toFixed(0)}%). Apply this as primary type unless content strongly suggests another.`
    : "";

  const prompt = `You are the Schema Architect for LADtoday — Pakistan's AI content platform.
Generate complete, validated structured data for Google rich results.

TOPIC: "${topic}" | CATEGORY: ${category}
HEADLINE: "${headline}"
META DESCRIPTION: "${metaDesc}"
FOCUS KEYWORD: "${focusKw}"
STRUCTURE TYPE: ${structureType}
CANONICAL URL: "${canonicalUrl}"
SITE NAME: "${site.siteName}"
SITE URL: "${site.siteUrl}"
LOGO: "${site.logoUrl}"
TWITTER: "${site.twitterHandle}"
${learningNote}

ARTICLE EXCERPT:
${articleText.slice(0, 600)}

FAQ ITEMS FROM SEO AGENT:
${faqItems.map((f: any, i: number) => `Q${i+1}: ${f.question}\nA${i+1}: ${f.answer}`).join("\n")}

━━━ SCHEMA DETERMINATION (STEP 1) ━━━

Determine primary schema type based on structure_type:
- "analysis" or "news report" → NewsArticle (for Google News eligibility)
- "how-to" → HowTo + BreadcrumbList
- "explainer" → Article + FAQPage (if has FAQ items)
- "listicle" → Article + FAQPage
- "investigation" → NewsArticle
- "comparison" → Article

${learning.sampleSize > 0 ? `LEARNING OVERRIDE: "${learning.bestSchemaType}" has historically produced most rich results for this category.` : ""}

━━━ SCHEMA GENERATION (STEPS 2-6) ━━━

Generate ALL applicable schemas. Always include:
1. PRIMARY SCHEMA (NewsArticle/HowTo/Article) — based on content type
2. FAQPage — if FAQ items exist (add all FAQ Q&A pairs)
3. BreadcrumbList — always include for navigation hierarchy
4. Organization — LADtoday organization markup (always include once)

For HowTo: extract numbered steps from article text, parse into stepArray
For Event: extract event date, location from article text
For FAQ: use ALL provided faq_items

━━━ OPENGRAPH TAGS (STEP 4) ━━━
Generate:
- og:title (= meta title from SEO, max 95 chars)
- og:description (= meta description, 140-155 chars)
- og:type ("article" for news, "website" for homepage)
- og:url (canonical URL)
- og:image (use site's OG image template URL)
- og:site_name
- article:published_time, article:modified_time, article:section, article:tag

━━━ TWITTER CARD TAGS (STEP 5) ━━━
Generate:
- twitter:card ("summary_large_image" for articles)
- twitter:site (@handle)
- twitter:title (max 70 chars — different from OG title)
- twitter:description (max 200 chars)
- twitter:image

Return JSON:
{
  "primary_schema_type": "NewsArticle|HowTo|Article|Event|VideoObject",
  "schema_types_applied": ["string"],
  "json_ld_blocks": ["string (complete <script type='application/ld+json'>...</script> for each schema)"],
  "og_tags": "string (all OG meta tags as HTML, one per line)",
  "twitter_card_tags": "string (all Twitter Card meta tags as HTML, one per line)",
  "rich_result_types_targeted": ["string (e.g. 'FAQ Rich Result', 'News Rich Result')"],
  "snippet_eligibility": {
    "faq_rich_result": boolean,
    "howto_rich_result": boolean,
    "news_rich_result": boolean,
    "event_rich_result": boolean
  },
  "schema_validation_notes": ["string (any schema.org spec notes or warnings)"]
}`;

  const schema = {
    type: "object",
    properties: {
      primary_schema_type: { type: "string" },
      schema_types_applied: { type: "array", items: { type: "string" } },
      json_ld_blocks: { type: "array", items: { type: "string" } },
      og_tags: { type: "string" },
      twitter_card_tags: { type: "string" },
      rich_result_types_targeted: { type: "array", items: { type: "string" } },
      snippet_eligibility: { type: "object", properties: {
        faq_rich_result: { type: "boolean" }, howto_rich_result: { type: "boolean" },
        news_rich_result: { type: "boolean" }, event_rich_result: { type: "boolean" },
      }},
      schema_validation_notes: { type: "array", items: { type: "string" } },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.3, maxOutputTokens: 4096 });

  // Build complete <head> injection block
  const completeHeadInjection = [
    "<!-- LADtoday Structured Data — Generated by Schema Markup Agent -->",
    ...(raw.json_ld_blocks || []),
    "<!-- OpenGraph Tags -->",
    raw.og_tags || "",
    "<!-- Twitter Card Tags -->",
    raw.twitter_card_tags || "",
    "<!-- End LADtoday Schema Block -->",
  ].join("\n");

  // Write learning
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: category,
      primary_schema_type: raw.primary_schema_type || "NewsArticle",
      got_rich_result: null, // backfilled by analytics agent from GSC data
      created_at: new Date().toISOString(),
    });
  } catch {/**/ }

  return {
    primary_schema_type: (raw.primary_schema_type || "NewsArticle") as SchemaType,
    schema_types_applied: raw.schema_types_applied || ["NewsArticle"],
    json_ld_blocks: raw.json_ld_blocks || [],
    og_tags: raw.og_tags || "",
    twitter_card_tags: raw.twitter_card_tags || "",
    complete_head_injection: completeHeadInjection,
    rich_result_types_targeted: raw.rich_result_types_targeted || [],
    snippet_eligibility: raw.snippet_eligibility || { faq_rich_result: false, howto_rich_result: false, news_rich_result: true, event_rich_result: false },
    schema_validation_notes: raw.schema_validation_notes || [],
    learning_applied: learning.sampleSize > 0,
    schema_type_historically_best: learning.bestSchemaType,
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

    // Depends on: seo(17), readability(18), internal-linker(19) + rewrite(15) + story-arc(10)
    const [rewriteOut, seoOut, readabilityOut, storyOut] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "seo"),
      readAgentOutput(run_id, "readability").catch(() => null),
      readAgentOutput(run_id, "story-arc").catch(() => null),
    ]);
    if (!rewriteOut) throw new Error("rewrite output not found");
    if (!seoOut) throw new Error("seo output not found");

    const [site, learning] = await Promise.all([loadSiteConfig(), loadSchemaLearning(category)]);
    console.log(`[${AGENT_NAME}] Schema type learning: best="${learning.bestSchemaType}" richRate=${(learning.richResultRate*100).toFixed(0)}% n=${learning.sampleSize}`);

    const result = await generateSchema(topic, rewriteOut, seoOut, readabilityOut, storyOut, site, category, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(result.complete_head_injection.length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      primary_schema: result.primary_schema_type,
      schema_types: result.schema_types_applied.length,
      faq_rich_result: result.snippet_eligibility.faq_rich_result,
      news_rich_result: result.snippet_eligibility.news_rich_result,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `schema=${result.primary_schema_type} types=[${result.schema_types_applied.join(",")}] faq=${result.snippet_eligibility.faq_rich_result} news=${result.snippet_eligibility.news_rich_result} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      primary_schema_type: result.primary_schema_type,
      schema_types_applied: result.schema_types_applied,
      rich_results_targeted: result.rich_result_types_targeted,
      snippet_eligibility: result.snippet_eligibility,
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
    } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
