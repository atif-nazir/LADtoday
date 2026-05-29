// ============================================================
// Agent 11 — Quote Extractor Agent
// Phase: ANALYZE | Model: gemini-2.5-flash | Depends on: scout, intelligence
// ============================================================
// Core job: Pull the best pull-quotes, expert statements, and direct
// quotes from source material. Ranks by impact, attribution quality,
// and shareability. Provides ready-to-embed quotes for Rewrite Agent.
//
// LEARNING: Tracks which quote types (expert vs official vs data)
// get screenshot-shared on social. Adapts selection to proven performers.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "quote-extractor";
const AGENT_NAME = "Quote Extractor";
const MODEL = "gemini-2.5-flash"; // Flash: quote selection is pattern matching, not deep reasoning

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedQuote {
  quote_text: string;
  attribution: string;              // "Name, Title, Organization"
  source_domain: string;
  quote_type: "official" | "expert" | "data_statement" | "human_interest" | "controversial";
  // Spec required scoring fields
  authority_score: number;          // 1-10: who said it? (regulator > executive > analyst > blogger)
  freshness_score: number;          // 1-10: how recent?
  shareability_score: number;       // 1-10: punchy, surprising, or actionable?
  pullquote_potential: boolean;     // does it work as standalone visual quote?
  use_as: "pullquote" | "inline" | "opening" | "closing" | "social_share";
  context: string;                  // when/why this was said
  embed_format: string;             // ready-to-use HTML blockquote
  social_caption: string;           // Twitter/Instagram caption (≤280 chars)
  pullquote_text: string;           // ≤120 chars — for social media image overlays
}

interface QuoteExtractorOutput {
  quotes: ExtractedQuote[];
  // Spec required output keys (consumed by Rewrite Agent + Carousel Agent)
  selected_quotes: ExtractedQuote[];   // top 3-5 quotes passed to Rewrite Agent
  pullquote_texts: string[];           // ≤120 chars each — for social media overlays
  // Grouped views
  top_pullquote: ExtractedQuote | null;
  social_quote: ExtractedQuote | null;
  opening_quote: ExtractedQuote | null;
  official_quotes: ExtractedQuote[];
  expert_quotes: ExtractedQuote[];
  total_quotes: number;
  quote_diversity: "excellent" | "good" | "limited";
  missing_quote_types: string[];
  suggested_outreach: string[];
  // Learning metadata
  learning_applied: boolean;
  top_quote_type_historically: string;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────

async function loadQuoteLearning(topicCategory: string): Promise<{
  topQuoteTypes: string[];
  avgShareabilityHighPerformers: number;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("created_at", { ascending: false })
      .limit(15);

    if (!data?.length) return { topQuoteTypes: [], avgShareabilityHighPerformers: 7, sampleSize: 0 };

    const typeCounts: Record<string, number> = {};
    let totalShare = 0;
    for (const m of data) {
      if (m.top_quote_type) typeCounts[m.top_quote_type] = (typeCounts[m.top_quote_type] || 0) + 1;
      totalShare += m.shareability_score || 0;
    }
    const topQuoteTypes = Object.entries(typeCounts).sort(([, a], [, b]) => b - a).slice(0, 2).map(([t]) => t);
    return { topQuoteTypes, avgShareabilityHighPerformers: data.length > 0 ? totalShare / data.length : 7, sampleSize: data.length };
  } catch {
    return { topQuoteTypes: [], avgShareabilityHighPerformers: 7, sampleSize: 0 };
  }
}

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp/.test(t)) return "fintech";
  if (/startup|tech|ai/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy";
  return "general";
}

async function extractQuotes(
  topic: string,
  scoutSources: any[],
  intelEntities: any[],
  topicCategory: string,
  learning: Awaited<ReturnType<typeof loadQuoteLearning>>
): Promise<QuoteExtractorOutput> {

  const sourceTexts = scoutSources.slice(0, 5).map((s: any, i: number) =>
    `[SOURCE ${i + 1}: ${s.source_domain}]\n${s.full_text || s.full_summary || ""}`
  ).join("\n\n");

  const entities = intelEntities.slice(0, 5).map((e: any) =>
    `${e.name} (${e.type}) — ${e.context}`
  ).join(", ");

  const learningSection = learning.sampleSize > 0
    ? `\nLEARNING: Quote types that drive social sharing for this category: ${learning.topQuoteTypes.join(", ")}. Avg shareability of past top quotes: ${learning.avgShareabilityHighPerformers.toFixed(1)}/10. Prioritize ${learning.topQuoteTypes[0] || "official"} quotes.`
    : "";

  const prompt = `You are a quote editor for LADtoday — Pakistan's AI content platform.

TOPIC: "${topic}" | CATEGORY: ${topicCategory}
KEY ENTITIES: ${entities || "N/A"}
${learningSection}

SOURCE MATERIAL:
${sourceTexts.slice(0, 8000) || "No source text available — generate representative quotes based on topic context"}

━━━ QUOTE EXTRACTION MISSION ━━━

Find/generate 5-8 high-quality quotes for this article:

QUOTE TYPES (ranked by editorial value):
1. OFFICIAL: Government minister, SBP governor, SECP chairman — authority_score 9-10
2. EXPERT: Academic, analyst, think tank researcher — authority_score 7-8
3. DATA_STATEMENT: Quote with specific number from authority — authority_score 6-8
4. HUMAN_INTEREST: Real person affected by this issue — authority_score 4-6
5. CONTROVERSIAL: Opposing/surprising viewpoint — authority_score 5-7

SCORING (all 1-10):
- authority_score: regulator=10, minister=9, executive=8, analyst=7, reporter=5, blogger=3
- freshness_score: same day=10, this week=7, this month=5, older=3
- shareability_score: screenshot-worthy=10, strong pullquote=7, inline useful=5, filler=2
- pullquote_potential: true if quote works standalone as visual (≤120 chars, punchy)

PULLQUOTE TEXT: For pullquote_potential=true, also produce a ≤120 char version for image overlays.

FOR EACH QUOTE:
- extract from source text OR construct plausible representative ([CONSTRUCTED] if so)
- attribution: specific "Name, Title, Organization"
- social_caption: Twitter/WhatsApp-ready (≤280 chars with attribution)
- embed_format: HTML <blockquote><p>"..."</p><cite>— Attribution</cite></blockquote>
- pullquote_text: ≤120 chars — trimmed for social image overlay

MISSING QUOTES: What types absent? Suggest outreach targets.

Return JSON:
{
  "quotes": [
    {
      "quote_text": "string",
      "attribution": "string (Name, Title, Organization)",
      "source_domain": "string",
      "quote_type": "official|expert|data_statement|human_interest|controversial",
      "authority_score": number (1-10),
      "freshness_score": number (1-10),
      "shareability_score": number (1-10),
      "pullquote_potential": boolean,
      "use_as": "pullquote|inline|opening|closing|social_share",
      "context": "string",
      "embed_format": "string (HTML blockquote)",
      "social_caption": "string (≤280 chars)",
      "pullquote_text": "string (≤120 chars for image overlay)"
    }
  ],
  "missing_quote_types": ["string"],
  "suggested_outreach": ["string (Name/Title + why to contact + what to ask)"]
}`;

  const schema = {
    type: "object",
    properties: {
      quotes: { type: "array", items: { type: "object", properties: {
        quote_text: { type: "string" }, attribution: { type: "string" }, source_domain: { type: "string" },
        quote_type: { type: "string" },
        authority_score: { type: "number" }, freshness_score: { type: "number" },
        shareability_score: { type: "number" }, pullquote_potential: { type: "boolean" },
        use_as: { type: "string" }, context: { type: "string" },
        embed_format: { type: "string" }, social_caption: { type: "string" },
        pullquote_text: { type: "string" },
      } } },
      missing_quote_types: { type: "array", items: { type: "string" } },
      suggested_outreach: { type: "array", items: { type: "string" } },
    },
  };

  const quotes: ExtractedQuote[] = (raw.quotes || []).map((q: any) => ({
    ...q,
    authority_score: q.authority_score ?? 5,
    freshness_score: q.freshness_score ?? 5,
    pullquote_potential: q.pullquote_potential ?? (q.shareability_score >= 8),
    pullquote_text: q.pullquote_text || q.quote_text?.slice(0, 120) || "",
  })).sort((a: any, b: any) => b.shareability_score - a.shareability_score);

  // selected_quotes: top 3-5 sorted by composite score (spec: passed to Rewrite + Carousel Agent)
  const selectedQuotes = [...quotes]
    .sort((a, b) => (b.authority_score * 0.4 + b.shareability_score * 0.4 + b.freshness_score * 0.2) -
                    (a.authority_score * 0.4 + a.shareability_score * 0.4 + a.freshness_score * 0.2))
    .slice(0, 5);

  // pullquote_texts: ≤120 chars each — spec: for social media overlays
  const pullquoteTexts = quotes
    .filter(q => q.pullquote_potential)
    .map(q => q.pullquote_text || q.quote_text.slice(0, 120))
    .slice(0, 5);

  const topQuoteType = quotes[0]?.quote_type || "expert";
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY, topic_category: topicCategory,
      top_quote_type: topQuoteType,
      shareability_score: quotes[0]?.shareability_score || 5,
      created_at: new Date().toISOString(),
    });
  } catch { /**/ }

  return {
    quotes,
    selected_quotes: selectedQuotes,
    pullquote_texts: pullquoteTexts,
    top_pullquote: quotes.find(q => q.use_as === "pullquote") || quotes[0] || null,
    social_quote: quotes.find(q => q.use_as === "social_share") || selectedQuotes[0] || null,
    opening_quote: quotes.find(q => q.use_as === "opening") || null,
    official_quotes: quotes.filter(q => q.quote_type === "official"),
    expert_quotes: quotes.filter(q => q.quote_type === "expert"),
    total_quotes: quotes.length,
    quote_diversity: quotes.length >= 4 ? "excellent" : quotes.length >= 2 ? "good" : "limited",
    missing_quote_types: raw.missing_quote_types || [],
    suggested_outreach: raw.suggested_outreach || [],
    learning_applied: learning.sampleSize > 0,
    top_quote_type_historically: learning.topQuoteTypes[0] || "expert",
  };
}

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch { /**/ }
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
    const topicCategory = inferTopicCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [scoutOut, intelOut] = await Promise.all([
      readAgentOutput(run_id, "scout"),
      readAgentOutput(run_id, "intelligence").catch(() => null),
    ]);
    if (!scoutOut) throw new Error("scout output not found");

    const learning = await loadQuoteLearning(topicCategory);
    const result = await extractQuotes(topic, scoutOut.sources || [], intelOut?.entities || [], topicCategory, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length / 4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      total_quotes: result.total_quotes, quote_diversity: result.quote_diversity,
      official_quotes: result.official_quotes.length, expert_quotes: result.expert_quotes.length,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${result.total_quotes} quotes | diversity=${result.quote_diversity} | official=${result.official_quotes.length} expert=${result.expert_quotes.length} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      total_quotes: result.total_quotes, quote_diversity: result.quote_diversity,
      official_quotes: result.official_quotes.length, learning_applied: result.learning_applied, duration_ms: durationMs,
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
    } catch { /**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
