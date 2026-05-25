// ============================================================
// Agent 07 — Research Agent
// Phase: DISCOVER | Model: gemini-2.5-pro | Depends on: intelligence
// ============================================================
// Core job: Elevate content from blog-post to authoritative journalism.
// Find primary sources: government data, academic papers, World Bank/IMF
// reports, SBP statistics, PBS (Pakistan Bureau of Statistics) releases.
// Pro model used because citation accuracy is mission-critical.
// Wrong citations damage credibility — Pro's extra reasoning prevents that.
//
// LEARNING: Tracks which citation types led to highest professional shares
// (LinkedIn, Twitter from journalists). Adapts to prioritize source types
// that historically improved article authority scores.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput, readAgentOutput, patchAgentState, loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "research";
const AGENT_NAME = "Research";
const MODEL = "gemini-2.5-pro"; // Pro: citation accuracy is mission-critical

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifiedStatistic {
  fact: string;
  source_org: string;
  source_type: "government" | "academic" | "ngo" | "international_body" | "regulatory" | "media";
  source_url: string;
  publication_year: number;
  citation_format: string;          // APA citation ready to paste
  confidence: "verified" | "high_likelihood" | "estimated";
  notes: string;
}

interface AuthoritySource {
  title: string; organization: string; year: number;
  url: string; source_type: string; relevance: string;
  key_data_points: string[];
}

interface DataGap {
  what_is_needed: string; why_important: string;
  where_to_find: string; urgency: "critical" | "important" | "nice_to_have";
}

interface ScoutFactCheck {
  original_fact: string; source_domain: string;
  confidence_rating: "keep" | "flag" | "remove";
  reason: string; better_version?: string;
}

interface ResearchOutput {
  verified_statistics: VerifiedStatistic[];
  authority_sources: AuthoritySource[];
  recommended_citations: string[];   // APA-style citations ready to use
  citation_count: number;
  data_gaps: DataGap[];
  scout_fact_review: ScoutFactCheck[];
  facts_flagged_for_checker: number;
  background_context: string;        // 200-word context for writer
  pakistan_specific_data: string[];
  comparative_data: string[];
  research_depth: "shallow" | "moderate" | "deep";
  primary_source_found: boolean;
  government_source_found: boolean;
  flags_for_fact_checker: string[];
  // Learning metadata
  dominant_source_type: string;
  learning_applied: boolean;
  past_runs_consulted: number;
}

// ─── Learning Layer ────────────────────────────────────────────────────────────
// Learns: which source types (government vs academic vs international_body)
// led to higher authority scores and professional engagement?

async function loadResearchLearning(topicCategory: string): Promise<{
  topSourceTypes: string[];        // e.g., ["government", "international_body"]
  avgCitationsHighPerformers: number;
  highAuthorityPattern: string;
  sampleSize: number;
}> {
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("*")
      .eq("agent_key", AGENT_KEY)
      .in("topic_category", [topicCategory, "general"])
      .order("created_at", { ascending: false })
      .limit(25);

    if (!data?.length) {
      return { topSourceTypes: [], avgCitationsHighPerformers: 0, highAuthorityPattern: "", sampleSize: 0 };
    }

    // Source types that led to high LinkedIn/professional shares
    const highPerformers = data.filter(m => (m.actual_linkedin_shares || 0) > 10 || (m.authority_score || 0) >= 7);
    const sourceTypeCounts: Record<string, number> = {};
    for (const m of highPerformers) {
      if (m.dominant_source_type) {
        sourceTypeCounts[m.dominant_source_type] = (sourceTypeCounts[m.dominant_source_type] || 0) + 1;
      }
    }
    const topSourceTypes = Object.entries(sourceTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t]) => t);

    const avgCitationsHighPerformers = highPerformers.length > 0
      ? Math.round(highPerformers.reduce((sum, m) => sum + (m.citation_count || 0), 0) / highPerformers.length)
      : 3;

    const highAuthorityPattern = highPerformers[0]?.research_pattern || "";

    return { topSourceTypes, avgCitationsHighPerformers, highAuthorityPattern, sampleSize: data.length };
  } catch {
    return { topSourceTypes: [], avgCitationsHighPerformers: 0, highAuthorityPattern: "", sampleSize: 0 };
  }
}

async function writeResearchMemory(
  topicCategory: string,
  dominantSourceType: string,
  citationCount: number,
  researchDepth: string
): Promise<void> {
  try {
    await supabase.from("agent_memory").insert({
      agent_key: AGENT_KEY,
      topic_category: topicCategory,
      dominant_source_type: dominantSourceType,
      citation_count: citationCount,
      research_pattern: researchDepth,
      actual_linkedin_shares: null, // backfilled by analytics
      authority_score: null,        // backfilled by analytics
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|payment|wallet|loan|secp/.test(t)) return "fintech";
  if (/startup|tech|ai|digital|app|software/.test(t)) return "tech";
  if (/cricket|psl|sport/.test(t)) return "sports";
  if (/election|politics|government|minister/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee|dollar|trade/.test(t)) return "economy";
  if (/health|covid|hospital|medical/.test(t)) return "health";
  if (/education|university|school/.test(t)) return "education";
  return "general";
}

// ─── Authority Source Databases ───────────────────────────────────────────────

const PAKISTAN_AUTHORITY_SOURCES = {
  financial: [
    "State Bank of Pakistan Annual Report (sbp.org.pk)",
    "SECP Annual Review (secp.gov.pk)",
    "Pakistan Stock Exchange Data (psx.com.pk)",
    "Finance Division Economic Survey (finance.gov.pk)",
    "Federal Board of Revenue Statistics (fbr.gov.pk)",
  ],
  statistics: [
    "Pakistan Bureau of Statistics (pbs.gov.pk)",
    "National Database Registration Authority (nadra.gov.pk)",
    "Pakistan Telecommunications Authority Annual Report (pta.gov.pk)",
    "NEPRA State of Industry Report (nepra.org.pk)",
  ],
  international: [
    "World Bank Pakistan Data (data.worldbank.org/country/PK)",
    "IMF Pakistan Article IV Consultation",
    "Asian Development Bank Pakistan Reports",
    "UNDP Human Development Index Pakistan",
    "Freedom House Pakistan Report",
    "Transparency International Pakistan CPI",
  ],
  academic: [
    "Lahore University of Management Sciences Research (lums.edu.pk)",
    "Institute of Business Administration Karachi Research (iba.edu.pk)",
    "Pakistan Institute of Development Economics (pide.org.pk)",
    "Social Policy Development Centre (spdc.org.pk)",
    "Aga Khan University Research",
  ],
};

// ─── Core Research Workflow ───────────────────────────────────────────────────

async function conductResearch(
  topic: string,
  keyFacts: any[],
  scoutSources: any[],
  contentBrief: string,
  topicCategory: string,
  learning: Awaited<ReturnType<typeof loadResearchLearning>>
): Promise<ResearchOutput> {

  const factsToVerify = keyFacts.slice(0, 6).map((f: any, i: number) =>
    `${i + 1}. [${(f.confidence || "UNKNOWN").toUpperCase()}] ${f.fact || f} (source: ${f.source_domain || "unknown"}) [type: ${f.fact_type || "general"}]`
  ).join("\n");

  const scoutContext = scoutSources.slice(0, 3).map((s: any) =>
    `- ${s.source_domain}: "${(s.full_text || s.full_summary || "").slice(0, 300)}"`
  ).join("\n");

  const learningSection = learning.sampleSize > 0
    ? `\n━━━ LEARNING: SOURCE TYPES THAT BUILD AUTHORITY (${learning.sampleSize} past runs) ━━━
TOP-PERFORMING SOURCE TYPES: ${learning.topSourceTypes.join(", ") || "government, international_body"}
AVG CITATIONS IN HIGH-AUTHORITY ARTICLES: ${learning.avgCitationsHighPerformers}
PATTERN FROM TOP PERFORMERS: ${learning.highAuthorityPattern || "Focus on government + international body combination"}
INSTRUCTION: Prioritize "${learning.topSourceTypes[0] || "government"}" sources — historically generates most professional engagement.
Target ${Math.max(4, learning.avgCitationsHighPerformers)} citations minimum.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const contentBriefExcerpt = contentBrief
    ? `\n━━━ INTELLIGENCE BRIEF CONTEXT (use to focus research) ━━━\n${contentBrief.slice(0, 800)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const prompt = `You are a research librarian and fact-verification specialist for LADtoday.
Your job: Find authoritative primary sources that ELEVATE this content from blog post to citeable journalism.

TOPIC: "${topic}"
TOPIC CATEGORY: ${topicCategory}
${learningSection}
${contentBriefExcerpt}

CLAIMS TO VERIFY (from Intelligence Agent):
${factsToVerify || "No specific claims yet — conduct general authority research on this topic"}

EXISTING SOURCE MATERIAL (from Scout):
${scoutContext || "No scout sources yet"}

AUTHORITATIVE SOURCES TO CHECK:
Financial/Regulatory: ${PAKISTAN_AUTHORITY_SOURCES.financial.join(", ")}
Statistics: ${PAKISTAN_AUTHORITY_SOURCES.statistics.join(", ")}
International: ${PAKISTAN_AUTHORITY_SOURCES.international.join(", ")}
Academic: ${PAKISTAN_AUTHORITY_SOURCES.academic.join(", ")}

━━━ RESEARCH MISSION ━━━

1. VERIFY EACH CLAIM (from Intelligence Agent key_facts):
   For each claim:
   a. Find the most authoritative source that confirms/contradicts/nuances it
   b. Rate confidence:
      - VERIFIED = certain the source exists and contains this data
      - HIGH_LIKELIHOOD = this source should contain this data (common knowledge of source)
      - ESTIMATED = using general knowledge to construct plausible data
   c. Generate proper APA citation: "Organization. (Year). Title. Publisher. URL"
   d. Note if claim is significantly off → flag for Fact Checker
   
   ${learning.topSourceTypes.length > 0 ? `PRIORITIZE: ${learning.topSourceTypes[0]} sources — learning data shows these build most authority for this topic category.` : "Prioritize government > international_body > academic > media source hierarchy."}

2. FIND 3-4 NEW DATA POINTS (not in scout sources):
   - Pakistan-specific statistics from official bodies
   - Year-over-year trend data with source
   - Official projections or forecasts
   - Comparative global rankings (where Pakistan stands vs world)
   
3. BACKGROUND CONTEXT (200 words minimum):
   An authoritative background paragraph that gives:
   - Historical context (when this issue emerged in Pakistan)
   - Policy/regulatory context (what rules govern this area)
   - Current state of affairs (where things stand today)
   - Key stakeholders involved
   This will be given directly to the Rewrite Agent.

4. DATA GAPS:
   What critical data would make this article more authoritative but couldn't be found?
   What should the human editor research manually?
   Mark urgency: critical|important|nice_to_have

5. SCOUT FACT REVIEW:
   Review each scout source's key claims. Flag:
   - KEEP: well-sourced, accurate, use confidently
   - FLAG: potentially inaccurate, needs verification before use
   - REMOVE: clearly wrong or low-quality source

Return JSON:
{
  "verified_statistics": [
    {
      "fact": "string (the verified fact, stated precisely with numbers)",
      "source_org": "string (e.g. 'State Bank of Pakistan')",
      "source_type": "government|academic|ngo|international_body|regulatory|media",
      "source_url": "string (realistic URL format, e.g. https://sbp.org.pk/reports/annual/2024)",
      "publication_year": number,
      "citation_format": "string (full APA citation ready to paste)",
      "confidence": "verified|high_likelihood|estimated",
      "notes": "string (caveats, what to watch for)"
    }
  ],
  "authority_sources": [
    {
      "title": "string",
      "organization": "string",
      "year": number,
      "url": "string",
      "source_type": "string",
      "relevance": "string (why this source matters for this article)",
      "key_data_points": ["string (3-5 specific data points this source contains)"]
    }
  ],
  "recommended_citations": ["string (full APA citations, 4-7 citations minimum)"],
  "data_gaps": [
    {
      "what_is_needed": "string",
      "why_important": "string",
      "where_to_find": "string (specific URL or organization to contact)",
      "urgency": "critical|important|nice_to_have"
    }
  ],
  "scout_fact_review": [
    {
      "original_fact": "string",
      "source_domain": "string",
      "confidence_rating": "keep|flag|remove",
      "reason": "string",
      "better_version": "string (improved version of the fact if available)"
    }
  ],
  "background_context": "string (200+ word authoritative background paragraph)",
  "pakistan_specific_data": ["string (5-7 Pakistan-specific data points found)"],
  "comparative_data": ["string (3-5 global comparison data points)"],
  "research_depth": "shallow|moderate|deep",
  "primary_source_found": boolean,
  "government_source_found": boolean,
  "flags_for_fact_checker": ["string (specific flags to pass to Fact Checker agent)"]
}`;

  const schema = {
    type: "object",
    properties: {
      verified_statistics: { type: "array", items: { type: "object", properties: {
        fact: { type: "string" }, source_org: { type: "string" }, source_type: { type: "string" },
        source_url: { type: "string" }, publication_year: { type: "integer" },
        citation_format: { type: "string" }, confidence: { type: "string" }, notes: { type: "string" },
      } } },
      authority_sources: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, organization: { type: "string" }, year: { type: "integer" },
        url: { type: "string" }, source_type: { type: "string" }, relevance: { type: "string" },
        key_data_points: { type: "array", items: { type: "string" } },
      } } },
      recommended_citations: { type: "array", items: { type: "string" } },
      data_gaps: { type: "array", items: { type: "object", properties: {
        what_is_needed: { type: "string" }, why_important: { type: "string" },
        where_to_find: { type: "string" }, urgency: { type: "string" },
      } } },
      scout_fact_review: { type: "array", items: { type: "object", properties: {
        original_fact: { type: "string" }, source_domain: { type: "string" },
        confidence_rating: { type: "string" }, reason: { type: "string" }, better_version: { type: "string" },
      } } },
      background_context: { type: "string" },
      pakistan_specific_data: { type: "array", items: { type: "string" } },
      comparative_data: { type: "array", items: { type: "string" } },
      research_depth: { type: "string" },
      primary_source_found: { type: "boolean" },
      government_source_found: { type: "boolean" },
      flags_for_fact_checker: { type: "array", items: { type: "string" } },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: MODEL,
    temperature: 0.35,  // Very low: accuracy over creativity for citations
    maxOutputTokens: 6144,
  });

  // Find dominant source type
  const sourceTypeCounts: Record<string, number> = {};
  for (const stat of (raw.verified_statistics || [])) {
    if (stat.source_type) sourceTypeCounts[stat.source_type] = (sourceTypeCounts[stat.source_type] || 0) + 1;
  }
  const dominantSourceType = Object.entries(sourceTypeCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || "general";

  return {
    verified_statistics: raw.verified_statistics || [],
    authority_sources: raw.authority_sources || [],
    recommended_citations: raw.recommended_citations || [],
    citation_count: (raw.recommended_citations || []).length,
    data_gaps: raw.data_gaps || [],
    scout_fact_review: raw.scout_fact_review || [],
    facts_flagged_for_checker: (raw.scout_fact_review || []).filter((f: any) => f.confidence_rating !== "keep").length,
    background_context: raw.background_context || "",
    pakistan_specific_data: raw.pakistan_specific_data || [],
    comparative_data: raw.comparative_data || [],
    research_depth: raw.research_depth || "moderate",
    primary_source_found: raw.primary_source_found || false,
    government_source_found: raw.government_source_found || false,
    flags_for_fact_checker: raw.flags_for_fact_checker || [],
    dominant_source_type: dominantSourceType,
    learning_applied: learning.sampleSize > 0,
    past_runs_consulted: learning.sampleSize,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "service_role") return true;
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

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const topicCategory = inferTopicCategory(topic);

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}" category=${topicCategory}`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic}`, { run_id });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
      topic_category: topicCategory,
    });

    // ── Read dependencies: scout (for sources) + intelligence (for key_facts + content_brief) ──
    // NOTE: Uses simplified dep keys "scout" and "intelligence" (not numbered)
    const scoutOutput = await readAgentOutput(run_id, "scout");
    const intelOutput = await readAgentOutput(run_id, "intelligence");

    if (!intelOutput) {
      throw new Error("intelligence output not found. Intelligence agent must complete before Research.");
    }

    const keyFacts = intelOutput?.key_facts || [];
    const scoutSources = scoutOutput?.sources || [];
    const contentBrief = intelOutput?.content_brief || "";

    console.log(`[${AGENT_NAME}] Researching ${keyFacts.length} claims from ${scoutSources.length} sources`);

    // ── Load learning context ──
    console.log(`[${AGENT_NAME}] Loading research learning for category="${topicCategory}"...`);
    const learning = await loadResearchLearning(topicCategory);
    console.log(`[${AGENT_NAME}] Learning: ${learning.sampleSize} runs | top sources: [${learning.topSourceTypes.join(", ")}] | target citations: ${learning.avgCitationsHighPerformers}`);

    // ── Run research (low temperature — citation accuracy critical) ──
    const researchData = await conductResearch(
      topic, keyFacts, scoutSources, contentBrief, topicCategory, learning
    );

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, researchData, {
      tokens: Math.ceil(JSON.stringify(researchData).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      verified_stats: researchData.verified_statistics.length,
      citations: researchData.citation_count,
      flagged: researchData.facts_flagged_for_checker,
      government_source: researchData.government_source_found,
      research_depth: researchData.research_depth,
      dominant_source_type: researchData.dominant_source_type,
      learning_applied: researchData.learning_applied,
    });

    // ── Write learning memory ──
    await writeResearchMemory(
      topicCategory,
      researchData.dominant_source_type,
      researchData.citation_count,
      researchData.research_depth
    );

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${researchData.verified_statistics.length} verified stats | ${researchData.citation_count} citations | ${researchData.facts_flagged_for_checker} flagged | depth=${researchData.research_depth} | gov_source=${researchData.government_source_found} | ${durationMs}ms`,
      { run_id }
    );

    console.log(`[${AGENT_NAME}] ✅ Done in ${durationMs}ms — ${researchData.verified_statistics.length} stats, ${researchData.citation_count} citations`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      verified_statistics: researchData.verified_statistics.length,
      citations: researchData.citation_count,
      government_source_found: researchData.government_source_found,
      research_depth: researchData.research_depth,
      facts_flagged_for_checker: researchData.facts_flagged_for_checker,
      dominant_source_type: researchData.dominant_source_type,
      learning_applied: researchData.learning_applied,
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
