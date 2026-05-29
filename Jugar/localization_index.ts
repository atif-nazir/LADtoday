// ============================================================
// Agent 13 — Localization Agent
// Phase: ANALYZE | Model: gemini-2.5-flash | Depends on: intelligence(02)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. For ENGLISH: replace global examples with Pakistan equivalents
//    ("like Amazon" → "like Daraz", "like Uber" → "like Careem")
//    Convert currency to PKR. Add Pakistani regulatory context.
//    Replace cultural analogies that won't land locally.
//    Find 1-2 Pakistan-specific stats from Research Agent output.
// 2. For URDU/ROMAN URDU: generate translation brief, flag loanwords
//    that stay English (fintech, startup, app). Flag cultural sensitivities.
//    Select: formal Urdu (newspaper) vs conversational Roman Urdu (social).
// 3. Output: localization_brief with replacements[], local_examples[],
//    currency_note, regulatory_context, language_instructions
//
// LEARNING: Tracks which localization patterns drove highest Pakistan engagement.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "localization";
const AGENT_NAME = "Localization";
const MODEL = "gemini-2.5-flash"; // Flash: pattern matching + replacement

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface Replacement {
  global_term: string;
  local_equivalent: string;
  context: string;
  confidence: "certain" | "suggested";
}

interface LocalizationOutput {
  // Core localization deliverables
  replacements: Replacement[];           // global → local substitutions
  local_examples: string[];             // Pakistan-specific examples to inject
  currency_note: string;                // how to present money figures (PKR, conversions)
  regulatory_context: string;           // Pakistani regulatory bodies relevant to topic
  // Language instructions
  language_mode: "english" | "roman_urdu" | "formal_urdu";
  language_instructions: string;        // detailed instructions for Rewrite Agent
  urdu_loanwords_keep_english: string[]; // words that stay in English even in Urdu content
  urdu_loanwords_translate: string[];   // words to translate to Urdu
  cultural_sensitivities: string[];     // things to be careful about
  // SEO localization
  pakistan_seo_terms: string[];         // Pakistan-specific search terms to include
  local_city_references: string[];      // cities relevant to this topic
  local_sector_references: string[];    // industries/sectors to reference
  // Research-sourced local data
  pakistan_statistics: string[];        // Pakistan-specific stats found (from research output)
  // Dashboard display
  localization_map_summary: string;     // "X replacements, Y local examples, language: Z"
  learning_applied: boolean;
  total_replacements: number;
}

// ─── Pakistan Localization Database ───────────────────────────────────────────

const GLOBAL_TO_PAKISTAN: Record<string, string> = {
  "Amazon": "Daraz", "eBay": "OLX Pakistan", "Uber": "Careem",
  "Lyft": "Bykea", "DoorDash": "Foodpanda", "Grubhub": "Cheetay",
  "PayPal": "Easypaisa / JazzCash", "Venmo": "Easypaisa",
  "Stripe": "HBL Pay / Finja", "Square": "Finja",
  "Facebook Marketplace": "OLX Pakistan", "Craigslist": "OLX Pakistan",
  "LinkedIn": "LinkedIn Pakistan", "Fiverr": "Rozee.pk / Folio3",
  "Google Pay": "Easypaisa / JazzCash", "Apple Pay": "Easypaisa",
  "WeWork": "The Hive / Daftarkhwan", "Airbnb": "Zameen Retreats",
  "Netflix": "Netflix Pakistan", "Spotify": "Spotify Pakistan",
  "Wall Street Journal": "Dawn / The News International",
  "New York Times": "Dawn / Tribune", "BBC": "Dawn News / Geo",
  "Federal Reserve": "State Bank of Pakistan (SBP)",
  "SEC": "Securities and Exchange Commission of Pakistan (SECP)",
  "IRS": "Federal Board of Revenue (FBR)",
  "Silicon Valley": "Islamabad Tech Hub / Karachi startup ecosystem",
  "startup ecosystem": "Pakistan's startup ecosystem",
  "the central bank": "State Bank of Pakistan (SBP)",
  "the regulator": "SECP / SBP / PTA (as applicable)",
  "the stock exchange": "Pakistan Stock Exchange (PSX)",
  "the telecom regulator": "Pakistan Telecommunication Authority (PTA)",
};

const PAKISTAN_REGULATORY_MAP: Record<string, string> = {
  "fintech": "State Bank of Pakistan (SBP) — Banking Policy Department + SECP for non-bank fintech",
  "tech": "Pakistan Telecommunication Authority (PTA) + MoITT (Ministry of IT and Telecom)",
  "investment": "Securities and Exchange Commission of Pakistan (SECP)",
  "energy": "National Electric Power Regulatory Authority (NEPRA) + OGRA",
  "taxes": "Federal Board of Revenue (FBR) + Provincial Revenue Authorities",
  "crypto": "Virtual Assets Business Act 2025 under SBP oversight",
  "media": "Pakistan Electronic Media Regulatory Authority (PEMRA)",
  "education": "Higher Education Commission (HEC) Pakistan",
  "health": "Drug Regulatory Authority of Pakistan (DRAP) + Ministry of NHSR&C",
  "general": "Relevant ministry / regulatory body as applicable",
};

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadLocalizationLearning(topicCategory: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("*")
      .eq("agent_key", AGENT_KEY).in("topic_category", [topicCategory, "general"])
      .order("actual_pk_engagement", { ascending: false }).limit(15);
    if (!data?.length) return { highEngagementPatterns: [] as string[], bestLanguageMode: "english", sampleSize: 0 };
    const patterns: string[] = data.filter(m => m.top_replacement_pair).map(m => m.top_replacement_pair).slice(0, 5);
    const langCounts: Record<string, number> = {};
    for (const m of data) { if (m.language_mode) langCounts[m.language_mode] = (langCounts[m.language_mode] || 0) + 1; }
    const bestLanguageMode = Object.entries(langCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "english";
    return { highEngagementPatterns: patterns, bestLanguageMode, sampleSize: data.length };
  } catch { return { highEngagementPatterns: [] as string[], bestLanguageMode: "english", sampleSize: 0 }; }
}

function inferCategory(topic: string) {
  const t = topic.toLowerCase();
  if (/fintech|sbp|payment|banking/.test(t)) return "fintech";
  if (/startup|tech|ai|digital/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation|rupee/.test(t)) return "economy";
  return "general";
}

// ─── Core Localization ────────────────────────────────────────────────────────

async function localize(
  topic: string, contentBrief: string, language: string,
  audienceData: any, researchData: any,
  category: string, learning: any
): Promise<LocalizationOutput> {

  const languageMode = language.toLowerCase().includes("urdu")
    ? language.toLowerCase().includes("roman") ? "roman_urdu" : "formal_urdu"
    : "english";

  const pakistanStats = researchData?.pakistan_specific_data || [];
  const regulatoryContext = PAKISTAN_REGULATORY_MAP[category] || PAKISTAN_REGULATORY_MAP.general;

  const learnNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} runs): Best language mode: "${learning.bestLanguageMode}". High-engagement replacement pairs: ${learning.highEngagementPatterns.slice(0, 3).join(", ")}.`
    : "";

  const prompt = `You are the Localization Agent for LADtoday — Pakistan's AI content platform.
Make this content feel deeply Pakistani — not globally bland.

TOPIC: "${topic}" | CATEGORY: ${category} | LANGUAGE MODE: ${languageMode}
${learnNote}

CONTENT BRIEF TO LOCALIZE:
${contentBrief.slice(0, 700)}

AUDIENCE:
Segment: ${audienceData?.primary_segment?.segment_name || "Pakistani Professional"}
Cities: ${audienceData?.primary_segment?.location || "Karachi, Lahore, Islamabad"}
Platform: ${audienceData?.best_distribution_platform || "facebook"}

PAKISTAN STATISTICS FOUND BY RESEARCH AGENT:
${pakistanStats.slice(0, 4).join("\n") || "None found — generate reasonable Pakistan-specific data points"}

KNOWN GLOBAL → PAKISTAN REPLACEMENTS (extend this list):
${Object.entries(GLOBAL_TO_PAKISTAN).slice(0, 12).map(([g, l]) => `"${g}" → "${l}"`).join("\n")}

REGULATORY CONTEXT FOR ${category.toUpperCase()}: ${regulatoryContext}

━━━ EXACT LOCALIZATION WORKFLOW ━━━

FOR ${languageMode === "english" ? "ENGLISH" : "URDU/ROMAN URDU"} CONTENT:

${languageMode === "english" ? `
A. REPLACE global examples with Pakistan equivalents:
   - Scan brief for any Western/global company references → replace with Pakistani equivalent
   - Scan for generic "central bank" → "State Bank of Pakistan (SBP)"
   - Scan for generic "regulator" → specific Pakistani body
   - Scan for cultural analogies that won't resonate in Pakistan → replace with local equivalent

B. CURRENCY LOCALIZATION:
   - Convert USD amounts to PKR where relevant (1 USD ≈ 278 PKR as of 2024)
   - For large amounts: present both "Rs. X" and "USD $Y" for educated audience
   - Use "crore" / "lakh" for relatable Pakistani numbering (e.g., "Rs. 50 crore" not "Rs. 500 million")

C. INJECT LOCAL CONTEXT:
   - Identify 1-2 Pakistan-specific statistics from research data
   - Find local company/organization as example to make the topic tangible
   - Reference the city/region most affected

D. REGULATORY GROUNDING:
   - Add Pakistani regulatory body reference where relevant
   - Example: "Under SBP's Digital Financial Services Policy 2023..."

E. PAKISTAN SEO TERMS:
   - Generate 5-7 search terms Pakistanis would actually use for this topic
` : `
A. LANGUAGE INSTRUCTIONS:
   - ${languageMode === "roman_urdu" ? "Roman Urdu: Write Urdu words phonetically in English letters. Conversational tone." : "Formal Urdu: Use proper Urdu script guidance. Newspaper-style formal tone."}
   - Loanwords that STAY in English: fintech, startup, app, online, AI, cryptocurrency, investment, GDP
   - Cultural/religious sensitivity: avoid assumptions about prayer times, fasting, etc.
   - Use "crore" (کروڑ) and "lakh" (لاکھ) — NOT millions/billions
   - Address audience as "آپ" (formal you) not "تم" (informal)

B. GENERATE TRANSLATION BRIEF:
   - Key terms that need Urdu equivalents
   - Phrases that should stay in English for clarity
   - Tone guidance: formal (اخبار) vs conversational (سوشل میڈیا)
`}

Return JSON:
{
  "replacements": [
    {"global_term":"string","local_equivalent":"string","context":"string (where/why to use this)","confidence":"certain|suggested"}
  ],
  "local_examples": ["string (Pakistan-specific example, company, or scenario)"],
  "currency_note": "string (how to present money — PKR conversion, crore/lakh guidance)",
  "regulatory_context": "string (specific Pakistani regulatory bodies + relevant policies)",
  "language_mode": "${languageMode}",
  "language_instructions": "string (200-word comprehensive instructions for Rewrite Agent)",
  "urdu_loanwords_keep_english": ["string (words that stay in English even in Urdu content)"],
  "urdu_loanwords_translate": ["string (words that should be translated to Urdu)"],
  "cultural_sensitivities": ["string (things to be careful about for Pakistani audience)"],
  "pakistan_seo_terms": ["string (5-7 Pakistan-specific search terms)"],
  "local_city_references": ["string (cities most relevant to this topic)"],
  "local_sector_references": ["string (Pakistani industries/sectors to reference)"],
  "pakistan_statistics": ["string (Pakistan-specific data points to inject)"]
}`;

  const schema = {
    type: "object",
    properties: {
      replacements: {
        type: "array", items: {
          type: "object", properties: {
            global_term: { type: "string" }, local_equivalent: { type: "string" }, context: { type: "string" }, confidence: { type: "string" },
          }
        }
      },
      local_examples: { type: "array", items: { type: "string" } },
      currency_note: { type: "string" }, regulatory_context: { type: "string" },
      language_mode: { type: "string" }, language_instructions: { type: "string" },
      urdu_loanwords_keep_english: { type: "array", items: { type: "string" } },
      urdu_loanwords_translate: { type: "array", items: { type: "string" } },
      cultural_sensitivities: { type: "array", items: { type: "string" } },
      pakistan_seo_terms: { type: "array", items: { type: "string" } },
      local_city_references: { type: "array", items: { type: "string" } },
      local_sector_references: { type: "array", items: { type: "string" } },
      pakistan_statistics: { type: "array", items: { type: "string" } },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.5, maxOutputTokens: 3000 });

  // Write learning memory
  try {
    const topReplacement = (raw.replacements || [])[0];
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: category, language_mode: languageMode,
      top_replacement_pair: topReplacement ? `"${topReplacement.global_term}" → "${topReplacement.local_equivalent}"` : null,
      actual_pk_engagement: null, created_at: new Date().toISOString(),
    });
  } catch {/**/ }

  const reps: Replacement[] = raw.replacements || [];
  return {
    replacements: reps,
    local_examples: raw.local_examples || [],
    currency_note: raw.currency_note || "Use PKR. Convert USD at 1 USD ≈ 278 PKR. Use crore/lakh notation.",
    regulatory_context: raw.regulatory_context || regulatoryContext,
    language_mode: languageMode,
    language_instructions: raw.language_instructions || "",
    urdu_loanwords_keep_english: raw.urdu_loanwords_keep_english || ["fintech", "startup", "app", "AI", "cryptocurrency", "online"],
    urdu_loanwords_translate: raw.urdu_loanwords_translate || [],
    cultural_sensitivities: raw.cultural_sensitivities || [],
    pakistan_seo_terms: raw.pakistan_seo_terms || [],
    local_city_references: raw.local_city_references || ["Karachi", "Lahore", "Islamabad"],
    local_sector_references: raw.local_sector_references || [],
    pakistan_statistics: [...pakistanStats.slice(0, 3), ...(raw.pakistan_statistics || [])],
    localization_map_summary: `${reps.length} replacements, ${(raw.local_examples || []).length} local examples, language: ${languageMode}`,
    learning_applied: learning.sampleSize > 0,
    total_replacements: reps.length,
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
    const language = run.language || "english";
    const category = inferCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `${topic} | lang=${language}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    // Depends on: intelligence(02) + audience-listener(05) + research(07)
    const [intelOut, audienceOut, researchOut] = await Promise.all([
      readAgentOutput(run_id, "intelligence"),
      readAgentOutput(run_id, "audience-listener").catch(() => null),
      readAgentOutput(run_id, "research").catch(() => null),
    ]);
    if (!intelOut) throw new Error("intelligence output not found");

    const learning = await loadLocalizationLearning(category);
    const result = await localize(topic, intelOut.content_brief || "", language, audienceOut, researchOut, category, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      replacements: result.total_replacements, language_mode: result.language_mode,
      local_examples: result.local_examples.length, learning_applied: result.learning_applied
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${result.localization_map_summary} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      total_replacements: result.total_replacements, language_mode: result.language_mode,
      local_examples: result.local_examples.length, learning_applied: result.learning_applied, duration_ms: durationMs
    }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
