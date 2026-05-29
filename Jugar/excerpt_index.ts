// ============================================================
// Agent 21 — Excerpt Agent (NEW)
// Phase: CREATE | Model: gemini-2.5-flash
// Depends on: rewrite(15), seo(17), schema-markup(20)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. Generate ALL 8 excerpt variants:
//    - meta_description: 140-155 chars, keyword-rich, benefit-led
//    - og_description: 195-200 chars, descriptive
//    - twitter_summary: 220-240 chars, punchy, emoji OK
//    - email_preview: 85-95 chars (inbox preview before open)
//    - whatsapp_preview: 55-65 chars (link preview text)
//    - cms_excerpt: 280-320 chars (WordPress excerpt field)
//    - google_snippet: 290-310 chars (Featured Snippet optimized)
//    - intro_teaser: 60 chars (push notification copy)
// 2. Generate 3 social share copy variants per platform (FB/Twitter/LinkedIn)
// 3. Generate email subject line + pre-header text (for Newsletter Agent)
// 4. Return complete excerpt_kit{} with all variants labeled
//
// LEARNING: Tracks which excerpt variants drove highest CTR per platform.
// Adapts copy strategy to proven performers.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "excerpt";
const AGENT_NAME = "Excerpt";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialCopySet {
  variant_a: string;   // emotional/curiosity hook angle
  variant_b: string;   // data/authority angle
  variant_c: string;   // question/engagement angle
}

interface ExcerptKit {
  // Core text variants
  meta_description: string;        // 140-155 chars
  og_description: string;          // 195-200 chars
  twitter_summary: string;         // 220-240 chars
  email_preview: string;           // 85-95 chars (inbox preview)
  whatsapp_preview: string;        // 55-65 chars (link card)
  cms_excerpt: string;             // 280-320 chars (WordPress)
  google_snippet: string;          // 290-310 chars (Featured Snippet)
  intro_teaser: string;            // 55-65 chars (push notification)
  // Social share copy (3 variants × 3 platforms)
  facebook_copy: SocialCopySet;
  twitter_copy: SocialCopySet;
  linkedin_copy: SocialCopySet;
  whatsapp_copy: SocialCopySet;
  // Email (for Newsletter Agent)
  email_subject_line: string;      // 40-50 chars
  email_subject_variants: string[]; // 3 A/B variants
  email_preheader: string;         // 80-100 chars (appears after subject in inbox)
  // Platform preview data (for dashboard simulator)
  platform_previews: {
    facebook: { title: string; description: string; domain: string };
    twitter: { title: string; description: string; handle: string };
    linkedin: { title: string; description: string };
    whatsapp: { title: string; preview: string };
  };
  // Quality metrics
  keyword_in_meta: boolean;
  char_lengths: Record<string, number>;
  learning_applied: boolean;
  best_fb_angle_historically: string;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadExcerptLearning(category: string): Promise<{
  bestFbAngle: string;      // "emotional" | "data" | "question"
  bestTwitterStyle: string;
  emojiUsage: boolean;      // did emoji drive higher engagement?
  sampleSize: number;
}> {
  try {
    const { data } = await supabase.from("agent_memory").select("*")
      .eq("agent_key", AGENT_KEY).in("topic_category", [category, "general"])
      .not("actual_fb_ctr", "is", null)
      .order("actual_fb_ctr", { ascending: false }).limit(15);
    if (!data?.length) return { bestFbAngle: "emotional", bestTwitterStyle: "data", emojiUsage: false, sampleSize: 0 };
    const angleCounts: Record<string, number> = {};
    let emojiCount = 0;
    for (const m of data) {
      if (m.fb_angle) angleCounts[m.fb_angle] = (angleCounts[m.fb_angle] || 0) + 1;
      if (m.used_emoji) emojiCount++;
    }
    return {
      bestFbAngle: Object.entries(angleCounts).sort(([,a],[,b])=>b-a)[0]?.[0] || "emotional",
      bestTwitterStyle: "data",
      emojiUsage: emojiCount > data.length * 0.5,
      sampleSize: data.length,
    };
  } catch { return { bestFbAngle: "emotional", bestTwitterStyle: "data", emojiUsage: false, sampleSize: 0 }; }
}

function inferCategory(t: string) {
  t = t.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech"; if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports"; if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy"; return "general";
}

// ─── Core Excerpt Generation ──────────────────────────────────────────────────

async function generateExcerptKit(
  topic: string,
  rewriteOut: any,
  seoOut: any,
  headlineOut: any,
  brandVoice: string,
  language: string,
  category: string,
  learning: Awaited<ReturnType<typeof loadExcerptLearning>>
): Promise<ExcerptKit> {

  const articleText = (rewriteOut?.article_text || "").slice(0, 1000);
  const headline = rewriteOut?.headline_used || topic;
  const metaDesc = seoOut?.meta_description || rewriteOut?.meta_description || "";
  const focusKw = seoOut?.focus_keyword || topic;
  const topHeadline = headlineOut?.top_headline?.headline || headline;
  const socialHeadline = headlineOut?.social_headline?.headline || headline;
  const twitterHeadline = headlineOut?.platform_best?.twitter?.headline || headline;
  const linkedinHeadline = headlineOut?.platform_best?.linkedin?.headline || headline;
  const allowEmoji = brandVoice !== "formal" && language === "english";

  const learningNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} past articles): Best FB angle: "${learning.bestFbAngle}". Use emoji: ${learning.emojiUsage ? "YES — emoji drove higher engagement" : "NO — plain text performed better"}. Twitter style: "${learning.bestTwitterStyle}".`
    : "";

  const prompt = `You are the Excerpt Agent for LADtoday — Pakistan's AI content platform.
Generate the COMPLETE distribution text kit — 12 different sized variants + social copy + email.
Every platform shows your content differently. Each variant must be perfect for its context.

TOPIC: "${topic}" | CATEGORY: ${category} | BRAND VOICE: ${brandVoice}
HEADLINE: "${headline}"
FOCUS KEYWORD: "${focusKw}"
META DESCRIPTION: "${metaDesc}"
EMOJI ALLOWED: ${allowEmoji}
${learningNote}

ARTICLE EXCERPT:
${articleText.slice(0, 800)}

HEADLINE VARIANTS:
- Primary: "${topHeadline}"
- Social: "${socialHeadline}"
- Twitter: "${twitterHeadline}"
- LinkedIn: "${linkedinHeadline}"

━━━ EXACT EXCERPT SPECIFICATIONS ━━━

Each variant has a STRICT character count. Count carefully.

1. meta_description: 140-155 chars
   - Start with focus keyword or topic
   - Include clear benefit: "Here's what you need to know" or "Understand why this matters"
   - Do NOT use "Click here" — Google penalizes

2. og_description: 195-200 chars (for Facebook/LinkedIn link previews)
   - More descriptive than meta_description
   - Can have slightly more emotional language

3. twitter_summary: 220-240 chars (Twitter card description)
   - ${allowEmoji && learning.emojiUsage ? "Start with 1-2 relevant emoji" : "Plain text only"}
   - Punchy, direct, creates urgency or curiosity
   - NOT the headline — this appears BELOW the headline

4. email_preview: 85-95 chars (appears in inbox preview before email is opened)
   - This is the ONLY thing that gets someone to open the email
   - Must create curiosity or urgency

5. whatsapp_preview: 55-65 chars (shows in link card when URL shared on WhatsApp)
   - Very short, conversational
   - Think "what would a friend say about this article"

6. cms_excerpt: 280-320 chars (WordPress excerpt field — shows on archive/blog pages)
   - Complete sentence(s), informative
   - Can end mid-thought with "..." if needed

7. google_snippet: 290-310 chars (optimized for Featured Snippet position 0)
   - Start with a direct answer to what the article covers
   - Structured: "X is Y. In Pakistan, Z. The key factor is..."

8. intro_teaser: 55-65 chars (push notification text — mobile notification bar)
   - 4-8 words maximum
   - Urgency or curiosity hook

━━━ SOCIAL SHARE COPY (3 variants × 4 platforms) ━━━

Facebook copy (each variant 120-180 chars + optional link):
- variant_a: ${learning.bestFbAngle === "emotional" ? "EMOTIONAL HOOK — connect to audience pain point or aspiration" : learning.bestFbAngle === "data" ? "DATA-LED — lead with the key statistic" : "QUESTION HOOK — open with the key question the article answers"}
- variant_b: different angle from A
- variant_c: different angle from B

Twitter/X copy (each ≤280 chars including URL):
- variant_a: bold claim or data stat + link
- variant_b: question that creates debate + link
- variant_c: insight framing "Thread: 5 things about X..."

LinkedIn copy (each 150-200 chars, professional tone):
- variant_a: professional insight + what this means for industry
- variant_b: data + professional implication
- variant_c: thought leadership framing

WhatsApp copy (each 60-80 chars — forwarding-friendly):
- variant_a: "Must read 👇" style
- variant_b: urgent/timely angle
- variant_c: "Share this" appeal

━━━ EMAIL (for Newsletter Agent) ━━━
subject_line: 40-50 chars, creates urgency/curiosity, personalized to Pakistan context
subject_variants: 3 A/B variants of the subject line
preheader: 80-100 chars (appears after subject in gmail inbox)

Return JSON:
{
  "meta_description": "string (140-155 chars EXACTLY)",
  "og_description": "string (195-200 chars EXACTLY)",
  "twitter_summary": "string (220-240 chars EXACTLY)",
  "email_preview": "string (85-95 chars EXACTLY)",
  "whatsapp_preview": "string (55-65 chars EXACTLY)",
  "cms_excerpt": "string (280-320 chars EXACTLY)",
  "google_snippet": "string (290-310 chars EXACTLY)",
  "intro_teaser": "string (55-65 chars EXACTLY)",
  "facebook_copy": {"variant_a": "string", "variant_b": "string", "variant_c": "string"},
  "twitter_copy": {"variant_a": "string", "variant_b": "string", "variant_c": "string"},
  "linkedin_copy": {"variant_a": "string", "variant_b": "string", "variant_c": "string"},
  "whatsapp_copy": {"variant_a": "string", "variant_b": "string", "variant_c": "string"},
  "email_subject_line": "string (40-50 chars)",
  "email_subject_variants": ["string", "string", "string"],
  "email_preheader": "string (80-100 chars)"
}`;

  const schema = {
    type: "object",
    properties: {
      meta_description: { type: "string" }, og_description: { type: "string" },
      twitter_summary: { type: "string" }, email_preview: { type: "string" },
      whatsapp_preview: { type: "string" }, cms_excerpt: { type: "string" },
      google_snippet: { type: "string" }, intro_teaser: { type: "string" },
      facebook_copy: { type: "object", properties: { variant_a: { type: "string" }, variant_b: { type: "string" }, variant_c: { type: "string" } } },
      twitter_copy: { type: "object", properties: { variant_a: { type: "string" }, variant_b: { type: "string" }, variant_c: { type: "string" } } },
      linkedin_copy: { type: "object", properties: { variant_a: { type: "string" }, variant_b: { type: "string" }, variant_c: { type: "string" } } },
      whatsapp_copy: { type: "object", properties: { variant_a: { type: "string" }, variant_b: { type: "string" }, variant_c: { type: "string" } } },
      email_subject_line: { type: "string" }, email_subject_variants: { type: "array", items: { type: "string" } },
      email_preheader: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.65, maxOutputTokens: 3500 });

  // Build char lengths report
  const charLengths: Record<string, number> = {
    meta_description: (raw.meta_description || "").length,
    og_description: (raw.og_description || "").length,
    twitter_summary: (raw.twitter_summary || "").length,
    email_preview: (raw.email_preview || "").length,
    whatsapp_preview: (raw.whatsapp_preview || "").length,
    cms_excerpt: (raw.cms_excerpt || "").length,
    google_snippet: (raw.google_snippet || "").length,
    intro_teaser: (raw.intro_teaser || "").length,
    email_subject_line: (raw.email_subject_line || "").length,
  };

  // Platform preview objects (for dashboard simulator)
  const siteUrl = "ladtoday.com";
  const platformPreviews = {
    facebook: { title: topHeadline, description: raw.og_description || "", domain: siteUrl },
    twitter: { title: twitterHeadline, description: raw.twitter_summary || "", handle: "@LADtoday" },
    linkedin: { title: linkedinHeadline, description: raw.og_description || "" },
    whatsapp: { title: topHeadline, preview: raw.whatsapp_preview || "" },
  };

  // Write learning
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: category,
      fb_angle: learning.bestFbAngle, used_emoji: allowEmoji && learning.emojiUsage,
      actual_fb_ctr: null, created_at: new Date().toISOString(),
    });
  } catch {/**/ }

  return {
    meta_description: raw.meta_description || metaDesc,
    og_description: raw.og_description || "",
    twitter_summary: raw.twitter_summary || "",
    email_preview: raw.email_preview || "",
    whatsapp_preview: raw.whatsapp_preview || "",
    cms_excerpt: raw.cms_excerpt || "",
    google_snippet: raw.google_snippet || "",
    intro_teaser: raw.intro_teaser || "",
    facebook_copy: raw.facebook_copy || { variant_a: "", variant_b: "", variant_c: "" },
    twitter_copy: raw.twitter_copy || { variant_a: "", variant_b: "", variant_c: "" },
    linkedin_copy: raw.linkedin_copy || { variant_a: "", variant_b: "", variant_c: "" },
    whatsapp_copy: raw.whatsapp_copy || { variant_a: "", variant_b: "", variant_c: "" },
    email_subject_line: raw.email_subject_line || topic.slice(0, 50),
    email_subject_variants: raw.email_subject_variants || [],
    email_preheader: raw.email_preheader || "",
    platform_previews: platformPreviews,
    keyword_in_meta: (raw.meta_description || "").toLowerCase().includes(focusKw.toLowerCase()),
    char_lengths: charLengths,
    learning_applied: learning.sampleSize > 0,
    best_fb_angle_historically: learning.bestFbAngle,
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
    const brandVoice = run.brand_voice || "professional";
    const language = run.language || "english";
    const category = inferCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [rewriteOut, seoOut, headlineOut] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "seo").catch(() => null),
      readAgentOutput(run_id, "headline-optimizer").catch(() => null),
    ]);
    if (!rewriteOut) throw new Error("rewrite output not found");

    const learning = await loadExcerptLearning(category);
    console.log(`[${AGENT_NAME}] Generating 12-variant excerpt kit | fb_angle="${learning.bestFbAngle}" emoji=${learning.emojiUsage} n=${learning.sampleSize}`);

    const result = await generateExcerptKit(topic, rewriteOut, seoOut, headlineOut, brandVoice, language, category, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      keyword_in_meta: result.keyword_in_meta,
      meta_len: result.char_lengths.meta_description,
      subject_line: result.email_subject_line,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `12 variants generated | meta=${result.char_lengths.meta_description}chars | kw_in_meta=${result.keyword_in_meta} | subject="${result.email_subject_line}" | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      variants_generated: 8, social_copy_sets: 4,
      keyword_in_meta: result.keyword_in_meta,
      email_subject_line: result.email_subject_line,
      char_lengths: result.char_lengths,
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
