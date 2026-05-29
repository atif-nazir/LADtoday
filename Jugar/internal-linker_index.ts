// ============================================================
// Agent 19 — Internal Linker Agent (NEW)
// Phase: CREATE | Model: gemini-2.5-flash
// Depends on: rewrite(15) + Supabase articles table
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. Load article index from Supabase (title, slug, focus_keyword, published_at)
// 2. For each paragraph: extract entities → semantic similarity match
// 3. If relevance > 0.7: propose internal link
// 4. Select top 3-5 links SPREAD across article (not clustered)
// 5. Generate link_insertions[]: {paragraph_index, anchor_text, target_url, relevance_score}
// 6. Apply insertions to article HTML: wrap anchor text in <a href>
// 7. Generate 2 "You might also like" footer recommendations
//
// LEARNING: Tracks which internal links drove highest click-through.
// Adapts relevance threshold and anchor text selection strategy.
// VALUE: Compounds — richer with every new article published.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "internal-linker";
const AGENT_NAME = "Internal Linker";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleIndex {
  id: string;
  title: string;
  slug: string;
  focus_keyword: string;
  excerpt: string;
  category: string;
  published_at: string;
  url: string;
}

interface LinkInsertion {
  paragraph_index: number;
  anchor_text: string;
  target_url: string;
  target_title: string;
  relevance_score: number;       // 0-1
  link_type: "contextual" | "keyword" | "entity";
  insertion_rationale: string;
}

interface RelatedArticle {
  title: string;
  url: string;
  relevance: string;             // why it's related
  thumbnail_hint: string;
}

interface InternalLinkerOutput {
  linked_article_html: string;   // article HTML with <a href> tags injected
  link_insertions: LinkInsertion[];
  links_inserted: number;
  you_might_also_like: RelatedArticle[]; // 2 footer recommendations
  articles_in_index: number;     // size of content graph
  relevance_threshold_used: number; // 0.5-0.9
  no_links_reason?: string;      // if 0 links inserted, why
  learning_applied: boolean;
  calibrated_threshold: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Tracks: did the internal links we inserted get clicked?
// Calibrates relevance_threshold upward if low-CTR links are being inserted.

async function loadLinkerLearning(category: string): Promise<{
  calibratedThreshold: number;    // 0.5-0.9, starts at 0.7
  bestAnchorStrategy: string;
  avgLinksHighCTR: number;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase.from("agent_memory").select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [category, "general"])
      .order("created_at", { ascending: false }).limit(20);

    if (!data?.length) return { calibratedThreshold: 0.7, bestAnchorStrategy: "keyword", avgLinksHighCTR: 4, sampleSize: 0 };

    // If avg CTR on internal links is low → raise threshold (be more selective)
    const runsWithCTR = data.filter(m => m.avg_link_ctr !== null);
    let threshold = 0.7;
    if (runsWithCTR.length >= 5) {
      const avgCTR = runsWithCTR.reduce((sum, m) => sum + (m.avg_link_ctr || 0), 0) / runsWithCTR.length;
      // Low CTR (<2%) → raise threshold; High CTR (>5%) → lower slightly
      if (avgCTR < 0.02) threshold = Math.min(0.85, threshold + 0.1);
      else if (avgCTR > 0.05) threshold = Math.max(0.55, threshold - 0.05);
    }

    const anchorCounts: Record<string, number> = {};
    for (const m of data) if (m.anchor_strategy) anchorCounts[m.anchor_strategy] = (anchorCounts[m.anchor_strategy] || 0) + 1;
    const bestAnchorStrategy = Object.entries(anchorCounts).sort(([,a],[,b])=>b-a)[0]?.[0] || "keyword";

    const avgLinksHighCTR = data.filter(m => (m.avg_link_ctr || 0) > 0.03).map(m => m.links_inserted || 4).reduce((a,b,_,arr) => a + b/arr.length, 0) || 4;

    return { calibratedThreshold: threshold, bestAnchorStrategy, avgLinksHighCTR: Math.round(avgLinksHighCTR), sampleSize: data.length };
  } catch {
    return { calibratedThreshold: 0.7, bestAnchorStrategy: "keyword", avgLinksHighCTR: 4, sampleSize: 0 };
  }
}

function inferCategory(t: string) {
  t = t.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech"; if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports"; if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy"; return "general";
}

// ─── Load Article Index from Supabase ─────────────────────────────────────────

async function loadArticleIndex(): Promise<ArticleIndex[]> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, slug, focus_keyword, excerpt, category, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(100); // last 100 articles for matching

    if (error || !data?.length) return [];

    return data.map((a: any) => ({
      id: a.id,
      title: a.title || "",
      slug: a.slug || "",
      focus_keyword: a.focus_keyword || "",
      excerpt: (a.excerpt || "").slice(0, 200),
      category: a.category || "general",
      published_at: a.published_at || "",
      url: `/${a.slug}`,
    }));
  } catch {
    return [];
  }
}

// ─── Core Internal Linking ────────────────────────────────────────────────────

async function findAndInsertLinks(
  topic: string,
  articleHtml: string,
  articleText: string,
  seoKeyword: string,
  articleIndex: ArticleIndex[],
  category: string,
  learning: Awaited<ReturnType<typeof loadLinkerLearning>>
): Promise<InternalLinkerOutput> {

  const threshold = learning.calibratedThreshold;

  // If no published articles yet, skip linking
  if (!articleIndex.length) {
    return {
      linked_article_html: articleHtml,
      link_insertions: [],
      links_inserted: 0,
      you_might_also_like: [],
      articles_in_index: 0,
      relevance_threshold_used: threshold,
      no_links_reason: "No published articles in index yet. Links will compound as more articles are published.",
      learning_applied: learning.sampleSize > 0,
      calibrated_threshold: threshold,
    };
  }

  // Build index context for Gemini
  const indexContext = articleIndex.slice(0, 50).map((a, i) =>
    `[${i}] "${a.title}" | keyword: "${a.focus_keyword}" | category: ${a.category} | url: ${a.url} | excerpt: "${a.excerpt.slice(0, 100)}"`
  ).join("\n");

  // Extract paragraphs from HTML
  const paragraphMatches = articleHtml.match(/<p[^>]*>(.*?)<\/p>/gs) || [];
  const paragraphs = paragraphMatches.map(p => p.replace(/<[^>]+>/g, "").trim()).filter(p => p.length > 50);

  const learningNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} past runs): Calibrated relevance threshold = ${threshold} (${threshold > 0.7 ? "raised — past links had low CTR, be MORE selective" : threshold < 0.7 ? "lowered — past links had high CTR, be more permissive" : "at default"}). Best anchor strategy: "${learning.bestAnchorStrategy}". Target ${learning.avgLinksHighCTR} links.`
    : "";

  const prompt = `You are the Internal Linker for LADtoday — Pakistan's AI content platform.
Find the best existing articles to link to from this new article. Internal links compound SEO value.

NEW ARTICLE TOPIC: "${topic}" | CATEGORY: ${category}
SEO FOCUS KEYWORD: "${seoKeyword}"
${learningNote}
RELEVANCE THRESHOLD: ${threshold} (only propose links scoring ≥ ${threshold})

NEW ARTICLE PARAGRAPHS (${paragraphs.length} total):
${paragraphs.map((p, i) => `[P${i}] ${p.slice(0, 200)}`).join("\n")}

PUBLISHED ARTICLE INDEX (${articleIndex.length} articles):
${indexContext}

━━━ INTERNAL LINKING PROTOCOL ━━━

STEP 1 — For each paragraph [P0, P1, P2...]:
  a. Extract 2-3 key entities/topics (companies, policies, concepts, people)
  b. Semantically match against article index
  c. Score relevance: 0.0 (unrelated) → 1.0 (highly relevant)
  d. Only propose if relevance ≥ ${threshold}

STEP 2 — SELECT TOP 3-5 LINKS:
  Rules for selection:
  - SPREAD: max 1 link per paragraph, no two consecutive paragraphs
  - NO duplicate target URLs
  - Priority: higher relevance score wins
  - Skip first paragraph (intro) and last paragraph (conclusion)
  - ${learning.bestAnchorStrategy === "keyword" ? "ANCHOR STRATEGY: use exact keyword match from target article's focus_keyword" : "ANCHOR STRATEGY: use natural entity mention as anchor text"}

STEP 3 — ANCHOR TEXT SELECTION:
  - Use exact words already in the paragraph (don't change the text)
  - 2-5 words maximum for anchor text
  - Must be a natural noun phrase or keyword (not "click here" or "read more")
  - Find where the anchor_text appears in the paragraph HTML

STEP 4 — "YOU MIGHT ALSO LIKE" FOOTER (2 recommendations):
  - Must be different from the contextual links chosen above
  - Select based on category match and recency
  - These go in the article footer as a recommendations block

Return JSON:
{
  "link_insertions": [
    {
      "paragraph_index": number (0-based index of paragraph),
      "anchor_text": "string (2-5 words from the paragraph to use as link text)",
      "target_url": "string (url from article index, e.g. '/pakistan-fintech-growth-2024')",
      "target_title": "string (title of the target article)",
      "relevance_score": number (0.0-1.0),
      "link_type": "contextual|keyword|entity",
      "insertion_rationale": "string (why this link belongs here)"
    }
  ],
  "you_might_also_like": [
    {
      "title": "string",
      "url": "string",
      "relevance": "string (1 sentence why it's related)",
      "thumbnail_hint": "string (suggested image description for thumbnail)"
    }
  ]
}`;

  const schema = {
    type: "object",
    properties: {
      link_insertions: { type: "array", items: { type: "object", properties: {
        paragraph_index: { type: "integer" }, anchor_text: { type: "string" }, target_url: { type: "string" },
        target_title: { type: "string" }, relevance_score: { type: "number" },
        link_type: { type: "string" }, insertion_rationale: { type: "string" },
      }}},
      you_might_also_like: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, url: { type: "string" }, relevance: { type: "string" }, thumbnail_hint: { type: "string" },
      }}},
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.4, maxOutputTokens: 2000 });

  const insertions: LinkInsertion[] = (raw.link_insertions || [])
    .filter((l: any) => l.relevance_score >= threshold)
    .slice(0, 5); // max 5 links per spec

  // Apply link insertions to HTML
  let linkedHtml = articleHtml;
  const usedParagraphs = new Set<number>();
  let prevLinkedPara = -2;

  for (const insertion of insertions) {
    // Skip if this paragraph already has a link or adjacent paragraph was linked
    if (usedParagraphs.has(insertion.paragraph_index) || Math.abs(insertion.paragraph_index - prevLinkedPara) <= 1) continue;

    // Find and wrap anchor_text in <a> tag
    const anchorRegex = new RegExp(`(${insertion.anchor_text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i");
    if (anchorRegex.test(linkedHtml)) {
      linkedHtml = linkedHtml.replace(anchorRegex,
        `<a href="${insertion.target_url}" title="${insertion.target_title}" class="internal-link">$1</a>`
      );
      usedParagraphs.add(insertion.paragraph_index);
      prevLinkedPara = insertion.paragraph_index;
    }
  }

  // Append "You might also like" footer
  const related = raw.you_might_also_like || [];
  if (related.length > 0) {
    const footerHtml = `\n<div class="you-might-also-like" style="margin-top:2rem;padding:1rem;border-top:2px solid #eee;">
<h3>You Might Also Like</h3>
<ul>${related.map((r: any) => `<li><a href="${r.url}">${r.title}</a> — ${r.relevance}</li>`).join("")}</ul>
</div>`;
    linkedHtml = linkedHtml.replace(/<\/article>/, footerHtml + "</article>") || linkedHtml + footerHtml;
  }

  // Write learning memory
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: category,
      links_inserted: insertions.length,
      relevance_threshold: threshold,
      anchor_strategy: learning.bestAnchorStrategy,
      avg_link_ctr: null, // backfilled by analytics agent
      created_at: new Date().toISOString(),
    });
  } catch {/**/ }

  return {
    linked_article_html: linkedHtml,
    link_insertions: insertions,
    links_inserted: insertions.length,
    you_might_also_like: related.slice(0, 2),
    articles_in_index: articleIndex.length,
    relevance_threshold_used: threshold,
    learning_applied: learning.sampleSize > 0,
    calibrated_threshold: threshold,
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

    // Depends on: rewrite(15) primary + seo(17) for keyword
    const [rewriteOut, seoOut] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "seo").catch(() => null),
    ]);
    if (!rewriteOut) throw new Error("rewrite output not found");

    const articleHtml = rewriteOut.article_html || "";
    const articleText = rewriteOut.article_text || "";
    const seoKeyword = seoOut?.focus_keyword || topic;

    // STEP 1: Load article index from Supabase
    console.log(`[${AGENT_NAME}] Loading article index from Supabase...`);
    const articleIndex = await loadArticleIndex();
    console.log(`[${AGENT_NAME}] Found ${articleIndex.length} published articles in index`);

    const learning = await loadLinkerLearning(category);
    console.log(`[${AGENT_NAME}] Calibrated threshold=${learning.calibratedThreshold} | anchor=${learning.bestAnchorStrategy} | n=${learning.sampleSize}`);

    const result = await findAndInsertLinks(topic, articleHtml, articleText, seoKeyword, articleIndex, category, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(result.linked_article_html.length / 3), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      links_inserted: result.links_inserted, articles_in_index: result.articles_in_index,
      threshold_used: result.relevance_threshold_used, learning_applied: result.learning_applied,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${result.links_inserted} links inserted | index_size=${result.articles_in_index} | threshold=${result.relevance_threshold_used} | ${result.no_links_reason || "links applied"} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      links_inserted: result.links_inserted, articles_in_index: result.articles_in_index,
      relevance_threshold: result.relevance_threshold_used,
      learning_applied: result.learning_applied, duration_ms: durationMs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
        // Fallback: pass through original article HTML unchanged
        const rOut = await readAgentOutput(b.run_id, "rewrite").catch(() => null);
        if (rOut?.article_html) {
          await writeAgentOutput(b.run_id, AGENT_KEY, { linked_article_html: rOut.article_html, links_inserted: 0, error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt });
        }
      }
    } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
