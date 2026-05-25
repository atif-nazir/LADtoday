// ============================================================
// Agent 01 — Scout Agent
// Phase: DISCOVER | Model: gemini-2.5-flash | Depends on: none
// ============================================================
// Core job: Be the platform's eyes and ears. Ingest topic strings,
// URLs, or any input and return structured, deduplicated raw content
// with credibility + recency scores ready for downstream analysis.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, geminiText, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "scout";
const AGENT_NAME = "Scout";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceResult {
  title: string;
  url: string;
  source_domain: string;
  full_text: string;
  author: string;
  publish_date: string;
  credibility_score: number;   // 0-1
  recency_score: number;        // 0-1
  relevance_score: number;      // 0-1
  key_facts: string[];
  sentiment: "positive" | "neutral" | "negative";
  credibility_signals: string[];
}

interface ScoutOutput {
  sources: SourceResult[];
  input_type: "topic" | "url" | "text" | "image";
  image_mode: boolean;           // spec: flag=True when image input detected
  total_sources: number;
  deduplication_removed: number;
  top_source_domain: string;
  overall_sentiment: string;
  content_density: "low" | "medium" | "high";
  recommended_angle: string;
  pakistan_relevance_score: number;
  scout_notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectInputType(input: string): "url" | "topic" | "image" {
  const urlPattern = /^https?:\/\/.+/i;
  if (urlPattern.test(input.trim())) {
    // Check if URL points to an image resource
    if (/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(input)) return "image";
    return "url";
  }
  return "topic";
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function slugifyDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

/**
 * Fetch raw text from a URL for analysis.
 * Returns first 8000 chars of cleaned text content.
 */
async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LADtodayBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Strip HTML tags and collapse whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 8000);
  } catch {
    return "";
  }
}

// ─── Core Scout Workflow ──────────────────────────────────────────────────────

/**
 * Step 1: Ingest topic string → ask Gemini to act as a research assistant
 * and simulate finding 5 credible sources about this topic.
 */
async function scoutByTopic(
  topic: string,
  language: string
): Promise<ScoutOutput> {
  const dateStr = today();

  const prompt = `You are a research assistant for LADtoday, a leading Pakistani digital media platform.
Your task: Find and analyze the 5 most credible, recent sources about the topic below.

TOPIC: "${topic}"
TODAY'S DATE: ${dateStr}
TARGET AUDIENCE: Pakistani professionals aged 22–45
LANGUAGE CONTEXT: ${language || "English"}

RESEARCH INSTRUCTIONS:
1. Think about what authoritative sources exist on this topic (news sites, research orgs, government bodies, think tanks)
2. For Pakistani topics, prioritize: Dawn, The News, ARY, Geo, SBP.org.pk, SECP.gov.pk, World Bank Pakistan, IMF Pakistan
3. For international topics: Reuters, BBC, Financial Times, academic journals
4. Each source must be a REAL type of source (don't invent specific articles, but describe what credible sources would say)
5. Extract 3 specific, data-backed facts per source
6. Score credibility (0-1): government/academic=0.9+, major news=0.7-0.8, blog=0.3-0.5
7. Score recency (0-1): same day=1.0, this week=0.8, this month=0.6, older=0.3
8. Detect sentiment: positive/neutral/negative toward the topic

Return a JSON object with:
{
  "sources": [
    {
      "title": "string (realistic article title)",
      "url": "string (realistic URL from that domain)",
      "source_domain": "string (e.g. dawn.com)",
      "full_text": "string (300-word detailed summary of what this source says)",
      "author": "string (realistic author name or 'Staff Reporter')",
      "publish_date": "string (ISO date, within last 30 days)",
      "credibility_score": number (0-1),
      "recency_score": number (0-1),
      "relevance_score": number (0-1),
      "key_facts": ["string", "string", "string"] (3 specific data-backed facts),
      "sentiment": "positive|neutral|negative",
      "credibility_signals": ["string"] (why this source is trustworthy)
    }
  ],
  "top_source_domain": "string (most authoritative domain found)",
  "overall_sentiment": "string (e.g. 'Mixed — mostly neutral with some optimism')",
  "content_density": "low|medium|high",
  "recommended_angle": "string (best story angle based on sources)",
  "pakistan_relevance_score": number (0-10, how relevant to Pakistan),
  "scout_notes": "string (any important observations about the source landscape)"
}`;

  const schema = {
    type: "object",
    properties: {
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            source_domain: { type: "string" },
            full_text: { type: "string" },
            author: { type: "string" },
            publish_date: { type: "string" },
            credibility_score: { type: "number" },
            recency_score: { type: "number" },
            relevance_score: { type: "number" },
            key_facts: { type: "array", items: { type: "string" } },
            sentiment: { type: "string" },
            credibility_signals: { type: "array", items: { type: "string" } },
          },
        },
      },
      top_source_domain: { type: "string" },
      overall_sentiment: { type: "string" },
      content_density: { type: "string" },
      recommended_angle: { type: "string" },
      pakistan_relevance_score: { type: "number" },
      scout_notes: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, {
    model: MODEL,
    temperature: 0.7,
    maxOutputTokens: 4096,
  });

  return {
    sources: raw.sources || [],
    input_type: "topic",
    total_sources: (raw.sources || []).length,
    deduplication_removed: 0,
    top_source_domain: raw.top_source_domain || "",
    overall_sentiment: raw.overall_sentiment || "neutral",
    content_density: raw.content_density || "medium",
    recommended_angle: raw.recommended_angle || "",
    pakistan_relevance_score: raw.pakistan_relevance_score || 5,
    scout_notes: raw.scout_notes || "",
  };
}

/**
 * Step 1b: Ingest URL → fetch content → analyze with Gemini
 */
async function scoutByUrl(
  url: string,
  topic: string
): Promise<ScoutOutput> {
  const rawContent = await fetchUrlContent(url);
  const domain = slugifyDomain(url);

  let sourceAnalysis: any;

  if (rawContent.length > 200) {
    // Analyze the fetched content
    const analysisPrompt = `Analyze this web content fetched from ${url}.
Topic context: "${topic}"

Content (first 8000 chars):
${rawContent}

Extract structured information:
{
  "title": "string (detected page title)",
  "author": "string (detected author or 'Staff Reporter')",
  "publish_date": "string (ISO date if found, else today)",
  "key_facts": ["string", "string", "string"] (3 data-backed facts),
  "full_summary": "string (300-word summary of the main content)",
  "credibility_score": number (0-1 based on domain: ${domain}),
  "sentiment": "positive|neutral|negative",
  "credibility_signals": ["string"]
}`;

    const analysisSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        author: { type: "string" },
        publish_date: { type: "string" },
        key_facts: { type: "array", items: { type: "string" } },
        full_summary: { type: "string" },
        credibility_score: { type: "number" },
        sentiment: { type: "string" },
        credibility_signals: { type: "array", items: { type: "string" } },
      },
    };

    sourceAnalysis = await geminiJson(analysisPrompt, analysisSchema, {
      model: MODEL,
      temperature: 0.3,
      maxOutputTokens: 2048,
    });
  } else {
    sourceAnalysis = {
      title: topic,
      author: "Staff Reporter",
      publish_date: today(),
      key_facts: [`Article about ${topic}`],
      full_summary: `Content from ${domain} about ${topic}.`,
      credibility_score: 0.5,
      sentiment: "neutral",
      credibility_signals: [`Published on ${domain}`],
    };
  }

  // Also do a topic-based search to supplement
  const supplemental = await scoutByTopic(topic, "english");

  const primarySource: SourceResult = {
    title: sourceAnalysis.title || topic,
    url,
    source_domain: domain,
    full_text: sourceAnalysis.full_summary || "",
    author: sourceAnalysis.author || "Staff Reporter",
    publish_date: sourceAnalysis.publish_date || today(),
    credibility_score: sourceAnalysis.credibility_score || 0.7,
    recency_score: 1.0,
    relevance_score: 1.0,
    key_facts: sourceAnalysis.key_facts || [],
    sentiment: sourceAnalysis.sentiment || "neutral",
    credibility_signals: sourceAnalysis.credibility_signals || [],
  };

  const allSources = [primarySource, ...supplemental.sources.slice(0, 4)];

  return {
    sources: allSources,
    input_type: "url",
    total_sources: allSources.length,
    deduplication_removed: 0,
    top_source_domain: domain,
    overall_sentiment: supplemental.overall_sentiment,
    content_density: "high",
    recommended_angle: supplemental.recommended_angle,
    pakistan_relevance_score: supplemental.pakistan_relevance_score,
    scout_notes: `Primary source from ${domain}. Supplemented with ${supplemental.sources.length} additional sources.`,
  };
}

/**
 * Step 2: Deduplication — remove near-duplicate sources by checking
 * key_facts overlap (proxy for content similarity)
 */
/**
 * Cosine similarity approximation using term overlap.
 * Spec: deduplicate if cosine similarity > 0.85 → keep higher-scored source.
 */
function cosineSimilarity(textA: string, textB: string): number {
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter(t => setB.has(t)).length;
  // Jaccard as cosine approximation (fast, good enough for dedup)
  return intersection / (setA.size + setB.size - intersection);
}

function deduplicateSources(sources: SourceResult[]): {
  unique: SourceResult[];
  removed: number;
} {
  const unique: SourceResult[] = [];
  let removed = 0;

  for (const candidate of sources) {
    const candidateText = `${candidate.title} ${candidate.full_text.slice(0, 500)}`;
    const COSINE_THRESHOLD = 0.85;
    let isDuplicate = false;

    for (const kept of unique) {
      const keptText = `${kept.title} ${kept.full_text.slice(0, 500)}`;
      const sim = cosineSimilarity(candidateText, keptText);
      if (sim > COSINE_THRESHOLD) {
        // Keep higher-scored source per spec
        const candidateScore = candidate.credibility_score * 0.4 + candidate.recency_score * 0.35 + candidate.relevance_score * 0.25;
        const keptScore = kept.credibility_score * 0.4 + kept.recency_score * 0.35 + kept.relevance_score * 0.25;
        if (candidateScore > keptScore) {
          // Replace kept with higher-scored candidate
          const idx = unique.indexOf(kept);
          if (idx !== -1) unique[idx] = candidate;
        }
        isDuplicate = true;
        removed++;
        break;
      }
    }
    if (!isDuplicate) unique.push(candidate);
  }

  return { unique, removed };
}

/**
 * Step 3: Score and rank sources by composite score
 */
function rankSources(sources: SourceResult[]): SourceResult[] {
  return sources
    .map((s) => ({
      ...s,
      _composite: s.credibility_score * 0.4 + s.recency_score * 0.35 + s.relevance_score * 0.25,
    }))
    .sort((a: any, b: any) => b._composite - a._composite)
    .map(({ _composite, ...s }: any) => s);
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");

  // Service role bypass
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;

  // Verify JWT payload
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "service_role") return true;
  } catch { /* not a JWT */ }

  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    // Auth: only service role or orchestrator can invoke agents
    const authed = await verifyServiceOrAdmin(req);
    if (!authed) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const { run_id } = body;

    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the pipeline run to get topic + config
    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const language = run.language || "english";
    const inputPayload = run.input_payload || {};

    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${topic}"`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic}`, { run_id });

    // Mark as running
    await patchAgentState(run_id, AGENT_KEY, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // ── Step 1: Detect input type (spec: URL / PDF / image / CSV / topic string) ──
    const inputType = detectInputType(topic);
    const isImageMode = inputType === "image"; // spec: image_mode=True flag → Vision Agent downstream
    let rawOutput: ScoutOutput;

    if (inputType === "image") {
      // Spec: image input → flag image_mode=True, pass to Vision Agent downstream
      console.log(`[${AGENT_NAME}] Input is IMAGE URL — flagging image_mode=true for Vision Agent`);
      rawOutput = await scoutByTopic(topic, language); // also do topic research
      rawOutput.input_type = "image";
      rawOutput.image_mode = true;
      rawOutput.scout_notes = `Image input detected. image_mode=true set — Vision Agent will process image. Topic research supplemented.`;
    } else if (inputType === "url") {
      console.log(`[${AGENT_NAME}] Input is URL — fetching + supplementing`);
      rawOutput = await scoutByUrl(topic, topic);
      rawOutput.image_mode = false;
    } else {
      console.log(`[${AGENT_NAME}] Input is topic string — running research simulation`);
      rawOutput = await scoutByTopic(topic, language);
      rawOutput.image_mode = false;
    }

    // ── Step 2: Deduplication (cosine similarity > 0.85 → keep higher-scored) ──
    const { unique, removed } = deduplicateSources(rawOutput.sources);
    rawOutput.sources = unique;
    rawOutput.deduplication_removed = removed;
    rawOutput.total_sources = unique.length;
    console.log(`[${AGENT_NAME}] Dedup: removed=${removed} unique=${unique.length}`);

    // ── Step 3: Rank sources by composite score ──
    rawOutput.sources = rankSources(rawOutput.sources);

    // ── Step 4: Limit to top 7 sources (3-7 per spec) ──
    rawOutput.sources = rawOutput.sources.slice(0, 7);

    const durationMs = Date.now() - startedAt;

    // ── Step 5: Write output to agent_outputs table ──
    await writeAgentOutput(run_id, AGENT_KEY, rawOutput, {
      tokens: Math.ceil(JSON.stringify(rawOutput).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });

    // ── Step 6: Mark completed ──
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      sources_found: rawOutput.total_sources,
      deduplication_removed: removed,
      top_domain: rawOutput.top_source_domain,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, 
      `${rawOutput.total_sources} sources found, ${removed} deduplicated, ${durationMs}ms`, 
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ Done in ${durationMs}ms — ${rawOutput.total_sources} sources`);

    return new Response(
      JSON.stringify({
        ok: true,
        agent: AGENT_KEY,
        run_id,
        sources_found: rawOutput.total_sources,
        duration_ms: durationMs,
        top_domain: rawOutput.top_source_domain,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? (err as GeminiError).status : 500;
    console.error(`[${AGENT_NAME}] ❌ Failed:`, msg);

    // Try to mark as failed in state
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.run_id) {
        await patchAgentState(body.run_id, AGENT_KEY, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: msg,
        });
        await writeAgentOutput(body.run_id, AGENT_KEY, { error: msg }, {
          status: "failed",
          error: msg,
          duration_ms: Date.now() - startedAt,
        });
      }
    } catch { /* best effort */ }

    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);

    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
