// ============================================================
// Agent 15 — Rewrite Agent (ENHANCED)
// Phase: CREATE | Model: gemini-2.5-pro
// Depends on: fact-checker(08), bias-detector(09), story-arc(10),
//             quote-extractor(11), tone-calibrator(12),
//             localization(13), headline-optimizer(14)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. Follow story_blueprint section-by-section
// 2. Apply style_guide for sentence patterns, transitions, opening/closing
// 3. Embed verified quotes naturally at narrative high-points
// 4. Apply localization_brief replacements as writing proceeds
// 5. Follow balance_directive for counterpoints
// 6. Target word_count from story_arc
// 7. Generate: article_html, meta_desc, social_caption, email_version
// 8. Self-review pass: balance_directive followed? all quotes attributed?
//
// LEARNING: Tracks which combination of inputs produced highest-quality
// articles (word count, time-on-page correlation). Adapts prompt strategy.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "rewrite";
const AGENT_NAME = "Rewrite";
const MODEL = "gemini-2.5-pro"; // Pro: primary creative output agent

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface RewriteOutput {
  article_html: string;        // full article as semantic HTML
  article_text: string;        // plain text version
  word_count: number;
  section_count: number;
  headline_used: string;       // the winning headline from optimizer
  meta_description: string;    // 155 chars
  social_caption: string;      // Facebook/WhatsApp caption (250 chars)
  email_version: string;       // plain text email version (500 chars)
  quotes_embedded: number;
  balance_directive_followed: boolean;
  localization_applied: boolean;
  approved_facts_used: number;
  self_review_notes: string;   // issues found during self-review pass
  quality_score: number;       // 1-10 self-assessed quality
  learning_applied: boolean;
}

async function loadRewriteLearning(topicCategory: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("*")
      .eq("agent_key", AGENT_KEY).in("topic_category", [topicCategory, "general"])
      .not("actual_time_on_page", "is", null)
      .order("actual_time_on_page", { ascending: false }).limit(15);
    if (!data?.length) return { bestWordCountRange: "1000-1500", bestSectionCount: 5, sampleSize: 0 };
    const wordCounts = data.map(m => m.word_count || 1200);
    const avgWords = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
    const sectionCounts = data.map(m => m.section_count || 5);
    const avgSections = Math.round(sectionCounts.reduce((a, b) => a + b, 0) / sectionCounts.length);
    return { bestWordCountRange: `${Math.max(800, avgWords - 200)}-${avgWords + 200}`, bestSectionCount: avgSections, sampleSize: data.length };
  } catch {
    return { bestWordCountRange: "1000-1500", bestSectionCount: 5, sampleSize: 0 };
  }
}

function inferCategory(topic: string) {
  const t = topic.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech";
  if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation|rupee/.test(t)) return "economy";
  return "general";
}

async function writeArticle(
  topic: string, run: any,
  factCheck: any, biasData: any, storyArc: any,
  quotes: any, toneData: any, locData: any, headlineData: any,
  learning: any
): Promise<RewriteOutput> {

  // ── Assemble all inputs ──
  const approvedFacts = (factCheck?.approved_facts || []).slice(0, 12)
    .map((f: any) => `[FACT] ${f.verified_version || f.original_claim}${f.framing_note ? ` (${f.framing_note})` : ""}`)
    .join("\n");

  const flaggedFacts = (factCheck?.flagged_facts || []).slice(0, 5)
    .map((f: any) => `[ATTRIBUTED: "${f.framing_note || "reportedly"}"] ${f.verified_version || f.original_claim}`)
    .join("\n");

  // Spec: use balance_directive (singular) from bias-detector
  const balanceDirective = biasData?.balance_directive || (biasData?.balance_directives || []).join("\n");
  const phrasesToAvoid = (biasData?.phrases_to_avoid || []).join(", ");
  const phrasesReplace = Object.entries(biasData?.phrases_to_replace || {})
    .map(([k, v]) => `Replace "${k}" → "${v}"`).join("\n");

  // Spec: story_blueprint from story-arc (not raw sections)
  const blueprint = storyArc?.story_blueprint || storyArc;
  const sections = (blueprint?.sections || storyArc?.sections || []).map((s: any, i: number) =>
    `SECTION ${i + 1}: "${s.heading}" (${s.target_words} words)\nPurpose: ${s.purpose}\nContent points: ${(s.content_points || []).join("; ")}\nMust include: ${(s.must_include_facts || []).join("; ")}\nTone: ${s.tone_for_section}\nTransition: ${s.transition_from_previous}\nHook within: ${s.engagement_hook}`
  ).join("\n\n");

  // Spec: use selected_quotes (spec key from quote-extractor, top 3-5 composite-scored)
  const quotesSource = quotes?.selected_quotes || quotes?.quotes || [];
  const selectedQuotes = quotesSource.slice(0, 5)
    .map((q: any) => `[QUOTE] "${q.quote_text}" — ${q.attribution} | Authority: ${q.authority_score ?? "?"}/10 | Use as: ${q.use_as} | Hint: ${q.use_as === "opening" ? "intro" : q.use_as === "closing" ? "conclusion" : "narrative high-point"}`)
    .join("\n");

  // Spec: use style_guide object (spec key from tone-calibrator)
  const sg = toneData?.style_guide;
  const styleGuide = sg
    ? `Sentence length: ${sg.sentence_length_target}\nTransitions to use: ${(sg.preferred_transitions || []).join(", ")}\nAvoid phrases: ${(sg.avoid_phrases || []).join(", ")}\nOpening pattern: ${sg.opening_pattern}\nClosing pattern: ${sg.closing_pattern}\nFormality: ${sg.formality_score}/10`
    : toneData?.style_fingerprint || toneData?.full_style_brief || "";
  const languageMode = locData?.language_mode || "english";
  const replacements = (locData?.replacements || []).slice(0, 8)
    .map((r: any) => `"${r.global_term}" → "${r.local_equivalent}"`)
    .join(", ");
  const regulatoryCtx = locData?.regulatory_context || "";
  const pakistanStats = (locData?.pakistan_statistics || []).slice(0, 3).join(" | ");

  const winningHeadline = headlineData?.top_headline?.headline || headlineData?.seo_headline?.headline || topic;
  const seoHeadline = headlineData?.seo_headline?.headline || winningHeadline;
  const hookText = storyArc?.hook_text || "";
  const wordTarget = storyArc?.word_count_target || 1200;
  const closingStrategy = storyArc?.closing_strategy || "End with a forward-looking statement and reader action.";

  const writingCautions = (factCheck?.writing_cautions || []).join("\n");
  const culturalSensitivities = (locData?.cultural_sensitivities || []).slice(0, 4).join("\n");

  const learningNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} past articles): Target ${learning.bestWordCountRange} words and ${learning.bestSectionCount} sections — historically produces highest time-on-page for this category.`
    : "";

  const prompt = `You are the Rewrite Agent for LADtoday — Pakistan's AI content platform.
You are receiving rich context from 7 upstream agents. Use ALL of it.
Write a complete, publication-ready article in HTML.

TOPIC: "${topic}"
WINNING HEADLINE: "${winningHeadline}"
SEO HEADLINE: "${seoHeadline}"
WORD TARGET: ${wordTarget} words
LANGUAGE: ${languageMode}
${learningNote}

━━━ STEP 1: STORY BLUEPRINT (follow section-by-section) ━━━
HOOK (use verbatim or improve): "${hookText}"
STRUCTURE: ${storyArc?.structure_type || "analysis"}
HOOK TYPE: ${storyArc?.hook_type || "stat"}

${sections || "Write a structured article with Introduction, 3-4 body sections, and Conclusion."}

CLOSING STRATEGY: ${closingStrategy}

━━━ STEP 2: STYLE GUIDE (follow precisely) ━━━
${styleGuide || `Tone: ${toneData?.tone_guide?.primary_tone || "analytical"}. Formality: ${toneData?.tone_guide?.formality_level || 3}/5. Vocabulary: ${toneData?.tone_guide?.vocabulary_level || "intermediate"}. Sentence: ${toneData?.tone_guide?.sentence_structure || "medium length, active voice"}.`}
Pakistan voice notes: ${toneData?.pakistan_voice_notes || "Reference Pakistani context naturally. Use 'crore/lakh' for large numbers."}
Cultural sensitivities to observe:
${culturalSensitivities || "Avoid making assumptions about religious practices. Respect family-centric decision making."}

━━━ STEP 3: VERIFIED FACTS (use only these — do NOT invent statistics) ━━━
APPROVED (use as facts):
${approvedFacts || "No pre-verified facts — use general knowledge carefully."}

ATTRIBUTED (use with 'reportedly' or attribution):
${flaggedFacts || "None flagged."}

Fact writing cautions:
${writingCautions || "Attribute all statistics. Use 'according to' for uncertain claims."}

━━━ STEP 4: QUOTES (embed naturally at narrative high-points) ━━━
${selectedQuotes || "No pre-selected quotes — use inline attribution for any quotes."}

━━━ STEP 5: BALANCE DIRECTIVE (follow to avoid bias) ━━━
${balanceDirective || "Represent multiple perspectives. Include government and critic viewpoints."}
PHRASES TO AVOID: ${phrasesToAvoid || "none"}
REPLACEMENTS TO MAKE:
${phrasesReplace || "none"}

━━━ STEP 6: LOCALIZATION (apply as you write) ━━━
LANGUAGE MODE: ${languageMode}
REPLACEMENTS: ${replacements || "none needed"}
REGULATORY CONTEXT: ${regulatoryCtx || "Add SBP/SECP/PTA where relevant."}
PAKISTAN STATISTICS TO USE: ${pakistanStats || "add Pakistan-specific context from general knowledge"}
CURRENCY: Use PKR/Rs. format. Large numbers: crore/lakh notation.

━━━ HTML FORMATTING RULES ━━━
- Wrap article in <article> tag
- Use <h1> for the headline (exactly one)
- Use <h2> for each section heading (from blueprint)
- Use <p> for paragraphs (3-4 sentences each, not longer)
- Blockquotes: <blockquote><p>"Quote text"</p><cite>— Name, Title, Organization</cite></blockquote>
- Bold key stats/terms: <strong>
- Lists where appropriate: <ul><li>
- NO inline styles. NO <style> tags. Just semantic HTML.

━━━ STEP 7: SELF-REVIEW PASS ━━━
After writing the article, check:
1. Did I follow the balance_directive? (not just one-sided)
2. Are all quotes attributed with Name, Title, Organization?
3. Did I apply localization replacements?
4. Is the word count close to ${wordTarget}?
5. Does the opening use the hook_text or improve on it?
Rate your own quality 1-10 in quality_score.

━━━ OUTPUTS REQUIRED ━━━
Return JSON:
{
  "article_html": "string (full semantic HTML, minimum ${Math.max(800, wordTarget - 200)} words)",
  "meta_description": "string (140-155 chars, includes primary keyword, benefit-led)",
  "social_caption": "string (240-260 chars for Facebook/WhatsApp, engaging opener + article summary)",
  "email_version": "string (450-550 word plain text version, email-friendly)",
  "quotes_embedded": number (count of embedded quotes),
  "balance_directive_followed": boolean,
  "localization_applied": boolean,
  "self_review_notes": "string (issues found or 'All checks passed')",
  "quality_score": number (1-10 self-assessment)
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
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: MODEL, temperature: 0.7, maxOutputTokens: 8192,
  });

  // Count words from HTML
  const plainText = (raw.article_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText.split(" ").filter(Boolean).length;
  const sectionCount = (raw.article_html || "").split("<h2").length - 1;

  // Write learning memory
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: inferCategory(topic),
      word_count: wordCount, section_count: sectionCount,
      quality_score: raw.quality_score || 7,
      actual_time_on_page: null, // backfilled by analytics
      created_at: new Date().toISOString(),
    });
  } catch {/**/ }

  return {
    article_html: raw.article_html || `<article><h1>${winningHeadline}</h1><p>Article generation failed.</p></article>`,
    article_text: plainText,
    word_count: wordCount,
    section_count: sectionCount,
    headline_used: winningHeadline,
    meta_description: raw.meta_description || topic.slice(0, 155),
    social_caption: raw.social_caption || "",
    email_version: raw.email_version || plainText.slice(0, 550),
    quotes_embedded: raw.quotes_embedded || 0,
    balance_directive_followed: raw.balance_directive_followed ?? true,
    localization_applied: raw.localization_applied ?? (replacements.length > 0),
    approved_facts_used: (factCheck?.approved_facts || []).length,
    self_review_notes: raw.self_review_notes || "No self-review data",
    quality_score: raw.quality_score || 7,
    learning_applied: learning.sampleSize > 0,
  };
}

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

    // Load all 7 upstream agents (spec deps: 08,09,10,11,12,13,14)
    const [factOut, biasOut, storyOut, quotesOut, toneOut, locOut, headlineOut] = await Promise.all([
      readAgentOutput(run_id, "fact-checker"),
      readAgentOutput(run_id, "bias-detector"),
      readAgentOutput(run_id, "story-arc"),
      readAgentOutput(run_id, "quote-extractor").catch(() => null),
      readAgentOutput(run_id, "tone-calibrator"),
      readAgentOutput(run_id, "localization"),
      readAgentOutput(run_id, "headline-optimizer"),
    ]);

    if (!factOut) throw new Error("fact-checker output not found");
    if (!storyOut) throw new Error("story-arc output not found");
    if (!toneOut) throw new Error("tone-calibrator output not found");
    if (!locOut) throw new Error("localization output not found");
    if (!headlineOut) throw new Error("headline-optimizer output not found");

    if (!factOut.safe_to_proceed) {
      await insertLog("warning", AGENT_KEY, `⚠️ Proceeding despite fact-check failure`, `${factOut.removed_facts?.length || 0} facts removed`, { run_id });
    }

    const learning = await loadRewriteLearning(category);
    console.log(`[${AGENT_NAME}] Writing article | word_target=${storyOut.word_count_target} | sections=${storyOut.sections?.length} | approved_facts=${factOut.approved_facts?.length} | quotes=${quotesOut?.quotes?.length || 0}`);

    const result = await writeArticle(topic, run, factOut, biasOut, storyOut, quotesOut, toneOut, locOut, headlineOut, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(result.article_html.length / 3), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      word_count: result.word_count, section_count: result.section_count,
      quality_score: result.quality_score, quotes_embedded: result.quotes_embedded,
      balance_directive_followed: result.balance_directive_followed,
      headline_used: result.headline_used?.slice(0, 100),
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `words=${result.word_count} sections=${result.section_count} quality=${result.quality_score}/10 quotes=${result.quotes_embedded} balanced=${result.balance_directive_followed} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      word_count: result.word_count, section_count: result.section_count,
      quality_score: result.quality_score, headline_used: result.headline_used,
      quotes_embedded: result.quotes_embedded, learning_applied: result.learning_applied,
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
