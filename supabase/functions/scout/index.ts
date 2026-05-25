// ============================================================
// Agent 01 — Scout Agent (REAL source discovery)
// Phase: DISCOVER | Model: gemini-2.5-flash | Depends on: none
// ============================================================
// Behaves like a research assistant:
//   - topic string  → expand to queries → web search (Gemini Search
//     grounding, Firecrawl optional) → fetch pages → score
//   - URL           → fetch + analyze + supplement with topic search
//   - PDF (url)     → extract text (unpdf) → analyze + supplement
//   - image (url)   → flag image_mode=true for Vision-16 + topic search
//
// Output shape (ScoutOutput) is unchanged so all downstream agents
// continue to work without modification.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "scout";
const AGENT_NAME = "Scout";
const MODEL = "gemini-2.5-flash";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";

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
  credibility_score: number;
  recency_score: number;
  relevance_score: number;
  key_facts: string[];
  sentiment: "positive" | "neutral" | "negative";
  credibility_signals: string[];
}

interface ScoutOutput {
  sources: SourceResult[];
  input_type: "topic" | "url" | "pdf" | "image";
  image_mode: boolean;
  total_sources: number;
  deduplication_removed: number;
  top_source_domain: string;
  overall_sentiment: string;
  content_density: "low" | "medium" | "high";
  recommended_angle: string;
  pakistan_relevance_score: number;
  scout_notes: string;
  search_queries_used?: string[];
  discovery_method?: "firecrawl" | "gemini_grounding" | "url_fetch" | "pdf_extract";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function slugifyDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LADtodayBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch { return ""; }
}

// ─── Step 1: Expand a human prompt into focused search queries ───────────────

async function expandQueries(topic: string, language: string, modelName: string): Promise<string[]> {
  const schema = {
    type: "object",
    properties: {
      queries: { type: "array", items: { type: "string" } },
    },
    required: ["queries"]
  };
  const prompt = `You are a research assistant. The user asked (in plain language):
"""${topic}"""

Convert this into 3-5 focused web search queries that a journalist would type into Google to find authoritative, recent sources. Prefer Pakistani context where relevant. Language: ${language}.

Return JSON: { "queries": ["...","..."] }`;
  try {
    const out = await geminiJson<{ queries: string[] }>(prompt, schema, {
      model: modelName, temperature: 0.4, maxOutputTokens: 512,
    });
    const qs = (out.queries || []).map(q => q.trim()).filter(Boolean);
    return qs.length ? qs.slice(0, 5) : [topic];
  } catch {
    return [topic];
  }
}

// ─── Step 2a: Web search via Firecrawl (preferred if key set) ────────────────

async function firecrawlSearch(query: string): Promise<{ url: string; title: string; snippet: string; markdown?: string }[]> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query, limit: 5,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const arr = data?.data || data?.web?.results || [];
    return arr.map((r: any) => ({
      url: r.url, title: r.title || "", snippet: r.description || "",
      markdown: r.markdown || "",
    })).filter((r: any) => r.url);
  } catch { return []; }
}

// ─── Step 2b: Web search via Gemini Google Search grounding ──────────────────

async function geminiGroundedSearch(query: string, modelName: string): Promise<{ url: string; title: string; snippet: string }[]> {
  if (!GEMINI_API_KEY) return [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Find the most authoritative, recent sources for: ${query}. Pakistani context preferred. List 5 sources with their URLs.` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const grounding = data?.candidates?.[0]?.groundingMetadata;
    const chunks = grounding?.groundingChunks || [];
    const results = chunks
      .map((c: any) => c.web)
      .filter((w: any) => w?.uri)
      .map((w: any) => ({ url: w.uri, title: w.title || w.uri, snippet: "" }));
    return results.slice(0, 5);
  } catch { return []; }
}

// ─── Step 3: Discover + fetch real sources for a topic ───────────────────────

async function discoverSources(topic: string, language: string, modelName: string): Promise<{
  rawSources: { url: string; title: string; snippet: string; markdown?: string }[];
  queries: string[];
  method: "firecrawl" | "gemini_grounding";
}> {
  const queries = await expandQueries(topic, language, modelName);
  const useFirecrawl = !!FIRECRAWL_API_KEY;
  const method: "firecrawl" | "gemini_grounding" = useFirecrawl ? "firecrawl" : "gemini_grounding";

  const buckets = await Promise.all(queries.map(q =>
    useFirecrawl ? firecrawlSearch(q) : geminiGroundedSearch(q, modelName)
  ));

  const flat = buckets.flat();
  // Dedupe by URL
  const seen = new Set<string>();
  const unique: typeof flat = [];
  for (const r of flat) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
  }
  return { rawSources: unique.slice(0, 8), queries, method };
}

// ─── Step 4: Score + annotate real sources via Gemini ────────────────────────

async function scoreSources(
  topic: string,
  raws: { url: string; title: string; snippet: string; markdown?: string }[],
  modelName: string
): Promise<SourceResult[]> {
  if (raws.length === 0) return [];

  // For each source, ensure we have body text. Use markdown if present, else fetch.
  const enriched = await Promise.all(raws.map(async r => {
    let body = r.markdown || "";
    if (!body || body.length < 200) body = await fetchUrlContent(r.url);
    return { ...r, body: (body || r.snippet || "").slice(0, 1800) };
  }));

  const schema = {
    type: "object",
    properties: {
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
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
          required: [
            "index",
            "full_text",
            "author",
            "publish_date",
            "credibility_score",
            "recency_score",
            "relevance_score",
            "key_facts",
            "sentiment",
            "credibility_signals"
          ]
        },
      },
      top_source_domain: { type: "string" },
      overall_sentiment: { type: "string" },
      content_density: { type: "string" },
      recommended_angle: { type: "string" },
      pakistan_relevance_score: { type: "number" },
      scout_notes: { type: "string" },
    },
    required: [
      "sources",
      "top_source_domain",
      "overall_sentiment",
      "content_density",
      "recommended_angle",
      "pakistan_relevance_score",
      "scout_notes"
    ]
  };

  const sourcesBlock = enriched.map((s, i) =>
    `[SOURCE ${i}] ${s.title}\nURL: ${s.url}\nBODY:\n${s.body}\n`
  ).join("\n---\n");

  const prompt = `You are LADtoday's research analyst. For the topic "${topic}", score and summarize the REAL web sources below.

For each source produce:
- full_text: a 250-word factual summary of what the source actually says (no invention)
- author: detected or "Staff Reporter"
- publish_date: ISO date if mentioned, else "${today()}"
- credibility_score 0-1 (government/academic .9+, major news .7-.85, blog .3-.5)
- recency_score 0-1 (today=1.0, this week=.8, this month=.6, older=.3)
- relevance_score 0-1 to the topic
- key_facts: 3 specific facts grounded in the body
- sentiment: positive|neutral|negative
- credibility_signals: short list

Sources:
${sourcesBlock}

Return JSON with shape:
{
  "sources": [{ "index": int, ...fields above }],
  "top_source_domain": string,
  "overall_sentiment": string,
  "content_density": "low|medium|high",
  "recommended_angle": string,
  "pakistan_relevance_score": number 0-10,
  "scout_notes": string
}`;

  let scored: any;
  try {
    scored = await geminiJson(prompt, schema, { model: modelName, temperature: 0.3, maxOutputTokens: 6144 });
  } catch (err) {
    console.error(`[${AGENT_NAME}] scoreSources Gemini error:`, err);
    // Fallback: build skeletal results
    return enriched.map(s => ({
      title: s.title,
      url: s.url,
      source_domain: slugifyDomain(s.url),
      full_text: s.body.slice(0, 800) || s.snippet || s.title,
      author: "Staff Reporter",
      publish_date: today(),
      credibility_score: 0.6,
      recency_score: 0.7,
      relevance_score: 0.7,
      key_facts: [],
      sentiment: "neutral",
      credibility_signals: [`Published on ${slugifyDomain(s.url)}`],
    }));
  }

  const scoredArr: any[] = scored.sources || [];
  // Merge by index back into enriched
  const out: SourceResult[] = enriched.map((s, i) => {
    const sc = scoredArr.find((x: any) => x.index === i) || scoredArr[i] || {};
    return {
      title: s.title,
      url: s.url,
      source_domain: slugifyDomain(s.url),
      full_text: sc.full_text || s.body.slice(0, 800),
      author: sc.author || "Staff Reporter",
      publish_date: sc.publish_date || today(),
      credibility_score: typeof sc.credibility_score === "number" ? sc.credibility_score : 0.6,
      recency_score: typeof sc.recency_score === "number" ? sc.recency_score : 0.7,
      relevance_score: typeof sc.relevance_score === "number" ? sc.relevance_score : 0.7,
      key_facts: sc.key_facts || [],
      sentiment: (sc.sentiment as any) || "neutral",
      credibility_signals: sc.credibility_signals || [`Published on ${slugifyDomain(s.url)}`],
    };
  });

  // Stash meta for caller
  (out as any)._meta = {
    top_source_domain: scored.top_source_domain,
    overall_sentiment: scored.overall_sentiment,
    content_density: scored.content_density,
    recommended_angle: scored.recommended_angle,
    pakistan_relevance_score: scored.pakistan_relevance_score,
    scout_notes: scored.scout_notes,
  };
  return out;
}

// ─── Workflow: topic ─────────────────────────────────────────────────────────

async function scoutByTopic(topic: string, language: string, modelName: string): Promise<ScoutOutput> {
  const { rawSources, queries, method } = await discoverSources(topic, language, modelName);
  const sources = await scoreSources(topic, rawSources, modelName);
  const meta: any = (sources as any)._meta || {};
  return {
    sources,
    input_type: "topic",
    image_mode: false,
    total_sources: sources.length,
    deduplication_removed: 0,
    top_source_domain: meta.top_source_domain || (sources[0] ? sources[0].source_domain : ""),
    overall_sentiment: meta.overall_sentiment || "neutral",
    content_density: meta.content_density || "medium",
    recommended_angle: meta.recommended_angle || "",
    pakistan_relevance_score: meta.pakistan_relevance_score ?? 5,
    scout_notes: meta.scout_notes || `Discovered ${sources.length} real sources via ${method}.`,
    search_queries_used: queries,
    discovery_method: method,
  };
}

// ─── Workflow: URL ───────────────────────────────────────────────────────────

async function scoutByUrl(url: string, topic: string, language: string, modelName: string): Promise<ScoutOutput> {
  const body = await fetchUrlContent(url);
  const primaryRaw = [{ url, title: topic || slugifyDomain(url), snippet: "", markdown: body }];

  // Supplement with topic search
  const topicForSearch = topic && topic !== url ? topic : `articles related to ${slugifyDomain(url)}`;
  const { rawSources: supplemental, method } = await discoverSources(topicForSearch, language, modelName);
  const combined = [
    ...primaryRaw,
    ...supplemental.filter(s => s.url !== url).slice(0, 4),
  ];
  const sources = await scoreSources(topicForSearch, combined, modelName);
  const meta: any = (sources as any)._meta || {};
  return {
    sources,
    input_type: "url",
    image_mode: false,
    total_sources: sources.length,
    deduplication_removed: 0,
    top_source_domain: slugifyDomain(url),
    overall_sentiment: meta.overall_sentiment || "neutral",
    content_density: "high",
    recommended_angle: meta.recommended_angle || "",
    pakistan_relevance_score: meta.pakistan_relevance_score ?? 5,
    scout_notes: meta.scout_notes || `Primary URL fetched. Supplemented with ${supplemental.length} sources via ${method}.`,
    discovery_method: "url_fetch",
  };
}

// ─── Workflow: PDF ───────────────────────────────────────────────────────────

async function extractPdfText(pdfUrl: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return "";
    const buf = new Uint8Array(await res.arrayBuffer());
    const doc = await getDocumentProxy(buf);
    const { text } = await extractText(doc, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).slice(0, 10000);
  } catch (err) {
    console.error("PDF extract failed:", err);
    return "";
  }
}

async function scoutByPdf(pdfUrl: string, topic: string, language: string, modelName: string): Promise<ScoutOutput> {
  const text = await extractPdfText(pdfUrl);
  const primaryRaw = [{
    url: pdfUrl,
    title: topic || "Uploaded PDF",
    snippet: text.slice(0, 300),
    markdown: text,
  }];
  const inferredTopic = topic || text.slice(0, 200);
  const { rawSources: supplemental, method } = await discoverSources(inferredTopic, language, modelName);
  const combined = [...primaryRaw, ...supplemental.slice(0, 4)];
  const sources = await scoreSources(inferredTopic, combined, modelName);
  const meta: any = (sources as any)._meta || {};
  return {
    sources,
    input_type: "pdf",
    image_mode: false,
    total_sources: sources.length,
    deduplication_removed: 0,
    top_source_domain: "uploaded-pdf",
    overall_sentiment: meta.overall_sentiment || "neutral",
    content_density: text.length > 2000 ? "high" : "medium",
    recommended_angle: meta.recommended_angle || "",
    pakistan_relevance_score: meta.pakistan_relevance_score ?? 5,
    scout_notes: meta.scout_notes || `PDF parsed (${text.length} chars). Supplemented with ${supplemental.length} sources via ${method}.`,
    discovery_method: "pdf_extract",
  };
}

// ─── Workflow: Image ─────────────────────────────────────────────────────────

async function scoutByImage(imageUrl: string, topic: string, language: string, modelName: string): Promise<ScoutOutput> {
  const topicForSearch = topic || "image analysis";
  const { rawSources, queries, method } = await discoverSources(topicForSearch, language, modelName);
  const sources = await scoreSources(topicForSearch, rawSources, modelName);
  const meta: any = (sources as any)._meta || {};
  return {
    sources,
    input_type: "image",
    image_mode: true, // ← Vision-16 will pick this up
    total_sources: sources.length,
    deduplication_removed: 0,
    top_source_domain: meta.top_source_domain || (sources[0]?.source_domain ?? ""),
    overall_sentiment: meta.overall_sentiment || "neutral",
    content_density: "medium",
    recommended_angle: meta.recommended_angle || "",
    pakistan_relevance_score: meta.pakistan_relevance_score ?? 5,
    scout_notes: `Image input detected (${imageUrl}). image_mode=true set for Vision-16. ${sources.length} supporting sources via ${method}.`,
    search_queries_used: queries,
    discovery_method: method,
  };
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "service_role") return true;
  } catch { /* not a JWT */ }
  return false;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    if (!await verifyServiceOrAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { run_id, model_override } = body;
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const language = run.language || "english";
    const payload: any = run.input_payload || {};

    console.log(`[${AGENT_NAME}] run=${run_id} topic="${topic}" payload_keys=${Object.keys(payload).join(",")}`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "running", started_at: new Date().toISOString(),
    });

    // Select resolved model
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);

    // Route based on attached input
    let output: ScoutOutput;
    if (payload.image_url) {
      output = await scoutByImage(payload.image_url, topic, language, selectedModel);
    } else if (payload.pdf_url) {
      output = await scoutByPdf(payload.pdf_url, topic, language, selectedModel);
    } else if (payload.url) {
      output = await scoutByUrl(payload.url, topic, language, selectedModel);
    } else {
      output = await scoutByTopic(topic, language, selectedModel);
    }

    // Cap sources
    output.sources = output.sources.slice(0, 7);
    output.total_sources = output.sources.length;

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, output, {
      tokens: Math.ceil(JSON.stringify(output).length / 4),
      duration_ms: durationMs,
      status: "completed",
    });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      sources_found: output.total_sources,
      top_domain: output.top_source_domain,
      discovery_method: output.discovery_method,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${output.total_sources} real sources via ${output.discovery_method}, ${durationMs}ms`,
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ ${durationMs}ms — ${output.total_sources} sources (${output.discovery_method})`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      sources_found: output.total_sources,
      duration_ms: durationMs,
      discovery_method: output.discovery_method,
      top_domain: output.top_source_domain,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? (err as GeminiError).status : 500;
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.run_id) {
        await patchAgentState(body.run_id, AGENT_KEY, {
          status: "failed", finished_at: new Date().toISOString(), error: msg,
        });
        await writeAgentOutput(body.run_id, AGENT_KEY, { error: msg }, {
          status: "failed", error: msg, duration_ms: Date.now() - startedAt,
        });
      }
    } catch { /* best effort */ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
