// ============================================================
// Agent 01 — Scout Agent (real source discovery, 3 backends)
// Phase: DISCOVER | Depends on: none
// ============================================================
// Discovery methods (selectable via run.input_payload.discovery_method
// or auto-fallback):
//   - "firecrawl"        → Firecrawl /v2/search (best quality, needs FIRECRAWL_API_KEY)
//   - "gemini_grounding" → Gemini google_search tool (default, uses GEMINI_API_KEY)
//   - "duckduckgo"       → DuckDuckGo HTML (no key, always works)
//   - "auto"             → try firecrawl → grounding → duckduckgo until ≥5 sources
//
// Always tries to return ≥5 sources. Every spec field is populated by Gemini,
// no skeletal silent fallback.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "scout";
const AGENT_NAME = "Scout";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DiscoveryMethod = "firecrawl" | "gemini_grounding" | "duckduckgo" | "url_fetch" | "pdf_extract";

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
  search_queries_used: string[];
  discovery_method: DiscoveryMethod;
  discovery_methods_tried: DiscoveryMethod[];
}

const today = () => new Date().toISOString().split("T")[0];
const slugifyDomain = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
};

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LADtodayBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
      .replace(/\s+/g, " ").trim()
      .slice(0, 8000);
  } catch { return ""; }
}

// ─── Query expansion ─────────────────────────────────────────────────────────

async function expandQueries(topic: string, language: string, model: string): Promise<string[]> {
  const schema = {
    type: "object",
    properties: { queries: { type: "array", items: { type: "string" } } },
    required: ["queries"],
  };
  const prompt = `You are a research assistant. The user asked (in plain language):
"""${topic}"""

Convert this into 3 focused web search queries that a journalist would type into Google to find authoritative, recent sources. Prefer Pakistani context where relevant. Language: ${language}.

Return JSON: { "queries": ["...","...","..."] }`;
  try {
    const out = await geminiJson<{ queries: string[] }>(prompt, schema, {
      model, temperature: 0.4, maxOutputTokens: 512,
    });
    const qs = (out.queries || []).map(q => q.trim()).filter(Boolean);
    return qs.length ? qs.slice(0, 3) : [topic];
  } catch {
    return [topic];
  }
}

// ─── Discovery: Firecrawl ────────────────────────────────────────────────────

async function firecrawlSearch(query: string, limit = 8): Promise<RawSource[]> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query, limit,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[Scout] Firecrawl ${res.status}: ${txt.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    const arr = data?.data?.web || data?.data || data?.web?.results || [];
    return arr.map((r: any) => ({
      url: r.url, title: r.title || r.metadata?.title || "",
      snippet: r.description || r.snippet || "", markdown: r.markdown || "",
    })).filter((r: any) => r.url);
  } catch (e) {
    console.error("[Scout] Firecrawl error:", e);
    return [];
  }
}

interface RawSource { url: string; title: string; snippet: string; markdown?: string; }

// ─── Discovery: Gemini Grounding (single broader call) ───────────────────────

async function geminiGroundedSearch(topic: string, model: string): Promise<RawSource[]> {
  if (!GEMINI_API_KEY) return [];
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text:
`Find the 8 most authoritative recent sources about: "${topic}"

Prefer Pakistani publications (Dawn, Tribune, Geo, ARY, Business Recorder, SBP, SECP, official .gov.pk domains) where relevant. Then global authoritative sources.

Reply with a JSON code block ONLY containing:
\`\`\`json
{ "sources": [ { "url": "https://...", "title": "...", "snippet": "1-2 sentence summary" } ] }
\`\`\`
Use real URLs you find via search. Do not invent URLs.` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.error(`[Scout] Gemini grounding ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text: string = (candidate?.content?.parts || []).map((p: any) => p.text || "").join("");
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];

    // 1) Parse JSON block from text
    const parsed: RawSource[] = [];
    const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"sources"[\s\S]*\}/);
    if (m) {
      try {
        const obj = JSON.parse(m[1] || m[0]);
        if (Array.isArray(obj?.sources)) {
          for (const s of obj.sources) {
            if (s?.url) parsed.push({ url: s.url, title: s.title || s.url, snippet: s.snippet || "" });
          }
        }
      } catch { /* ignore */ }
    }

    // 2) Merge with groundingChunks
    for (const c of chunks) {
      const w = c?.web;
      if (w?.uri && !parsed.find(p => p.url === w.uri)) {
        parsed.push({ url: w.uri, title: w.title || w.uri, snippet: "" });
      }
    }

    return parsed.slice(0, 10);
  } catch (e) {
    console.error("[Scout] Gemini grounding error:", e);
    return [];
  }
}

// ─── Discovery: DuckDuckGo HTML (no key) ─────────────────────────────────────

async function duckDuckGoSearch(query: string, limit = 8): Promise<RawSource[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: RawSource[] = [];
    // Match each result block
    const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = blockRe.exec(html)) && results.length < limit) {
      let rawUrl = mm[1];
      // DuckDuckGo wraps in /l/?uddg=
      try {
        if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
        const u = new URL(rawUrl);
        const uddg = u.searchParams.get("uddg");
        if (uddg) rawUrl = decodeURIComponent(uddg);
      } catch { /* keep raw */ }
      const title = mm[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const snippet = mm[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (rawUrl.startsWith("http")) results.push({ url: rawUrl, title, snippet });
    }
    return results;
  } catch (e) {
    console.error("[Scout] DuckDuckGo error:", e);
    return [];
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

async function runDiscovery(method: DiscoveryMethod, queries: string[], topic: string, model: string): Promise<RawSource[]> {
  if (method === "firecrawl") {
    const buckets = await Promise.all(queries.slice(0, 2).map(q => firecrawlSearch(q, 6)));
    return buckets.flat();
  }
  if (method === "gemini_grounding") {
    // Single broad call (saves quota)
    return await geminiGroundedSearch(topic, model);
  }
  if (method === "duckduckgo") {
    const buckets = await Promise.all(queries.slice(0, 2).map(q => duckDuckGoSearch(q, 6)));
    return buckets.flat();
  }
  return [];
}

async function discoverSources(
  topic: string, language: string, model: string,
  preferred: DiscoveryMethod | "auto"
): Promise<{ rawSources: RawSource[]; queries: string[]; method: DiscoveryMethod; tried: DiscoveryMethod[] }> {
  const queries = await expandQueries(topic, language, model);

  // Order to try
  let order: DiscoveryMethod[];
  if (preferred === "auto") {
    order = [];
    if (FIRECRAWL_API_KEY) order.push("firecrawl");
    if (GEMINI_API_KEY) order.push("gemini_grounding");
    order.push("duckduckgo");
  } else {
    // Explicit preferred + cascade fallbacks (still try the rest if it returns nothing)
    const all: DiscoveryMethod[] = ["firecrawl", "gemini_grounding", "duckduckgo"];
    order = [preferred, ...all.filter(m => m !== preferred)];
  }

  const tried: DiscoveryMethod[] = [];
  let chosen: DiscoveryMethod = order[0];
  let raws: RawSource[] = [];

  for (const m of order) {
    if (m === "firecrawl" && !FIRECRAWL_API_KEY) continue;
    tried.push(m);
    const r = await runDiscovery(m, queries, topic, model);
    if (r.length >= 1) {
      chosen = m;
      raws = r;
      if (r.length >= 5) break;
    }
  }

  // Dedupe by URL
  const seen = new Set<string>();
  const unique: RawSource[] = [];
  for (const r of raws) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
  }

  return { rawSources: unique.slice(0, 10), queries, method: chosen, tried };
}

// ─── Scoring (Gemini, no silent skeleton fallback) ───────────────────────────

async function scoreSources(
  topic: string, raws: RawSource[], model: string,
): Promise<{ sources: SourceResult[]; meta: any }> {
  if (raws.length === 0) {
    throw new Error("Scout discovered 0 sources — all backends returned empty. Check FIRECRAWL_API_KEY, GEMINI_API_KEY quota, or network.");
  }

  // Ensure body text for each source
  const enriched = await Promise.all(raws.map(async r => {
    let body = r.markdown || "";
    if (!body || body.length < 200) body = await fetchUrlContent(r.url);
    if (!body || body.length < 100) body = r.snippet || r.title || "";
    return { ...r, body: body.slice(0, 1800) };
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
            full_text: { type: "string" }, author: { type: "string" },
            publish_date: { type: "string" },
            credibility_score: { type: "number" },
            recency_score: { type: "number" },
            relevance_score: { type: "number" },
            key_facts: { type: "array", items: { type: "string" } },
            sentiment: { type: "string" },
            credibility_signals: { type: "array", items: { type: "string" } },
          },
          required: ["index","full_text","author","publish_date","credibility_score","recency_score","relevance_score","key_facts","sentiment","credibility_signals"],
        },
      },
      top_source_domain: { type: "string" },
      overall_sentiment: { type: "string" },
      content_density: { type: "string" },
      recommended_angle: { type: "string" },
      pakistan_relevance_score: { type: "number" },
      scout_notes: { type: "string" },
    },
    required: ["sources","top_source_domain","overall_sentiment","content_density","recommended_angle","pakistan_relevance_score","scout_notes"],
  };

  const sourcesBlock = enriched.map((s, i) =>
    `[SOURCE ${i}] ${s.title}\nURL: ${s.url}\nBODY:\n${s.body}\n`).join("\n---\n");

  const prompt = `You are LADtoday's research analyst. Topic: "${topic}".

You MUST populate every required field. No empty strings, no empty arrays, no nulls. Every property is required.

For EACH source produce:
- full_text: 200-word factual summary grounded in BODY (no invention).
- author: detected byline, otherwise "Staff Reporter".
- publish_date: ISO date if mentioned in body, else "${today()}".
- credibility_score 0-1 (gov/academic .9+, major news .7-.85, blog .3-.5).
- recency_score 0-1 (today=1, week=.8, month=.6, older=.3).
- relevance_score 0-1 to the topic.
- key_facts: 3 specific facts from this body (each ≥10 words).
- sentiment: positive|neutral|negative.
- credibility_signals: 2-4 short reasons this source is credible.

Then overall:
- top_source_domain (e.g. dawn.com)
- overall_sentiment
- content_density: low|medium|high
- recommended_angle: 1-2 sentence editorial angle for a Pakistani audience
- pakistan_relevance_score 0-10
- scout_notes: 1-2 sentence summary for the editor

Sources:
${sourcesBlock}`;

  let scored: any;
  try {
    scored = await geminiJson(prompt, schema, { model, temperature: 0.3, maxOutputTokens: 8192 });
  } catch (err) {
    console.error(`[${AGENT_NAME}] scoreSources first attempt failed:`, err);
    // Single retry at lower temperature
    scored = await geminiJson(prompt, schema, { model, temperature: 0.1, maxOutputTokens: 8192 });
  }

  const scoredArr: any[] = scored.sources || [];
  if (scoredArr.length === 0) throw new Error("Gemini scoring returned 0 sources");

  const sources: SourceResult[] = enriched.map((s, i) => {
    const sc = scoredArr.find((x: any) => x.index === i) || scoredArr[i];
    if (!sc) throw new Error(`Missing scored entry for source index ${i}`);
    return {
      title: s.title, url: s.url, source_domain: slugifyDomain(s.url),
      full_text: sc.full_text, author: sc.author, publish_date: sc.publish_date,
      credibility_score: Number(sc.credibility_score),
      recency_score: Number(sc.recency_score),
      relevance_score: Number(sc.relevance_score),
      key_facts: sc.key_facts, sentiment: sc.sentiment,
      credibility_signals: sc.credibility_signals,
    };
  });

  return {
    sources,
    meta: {
      top_source_domain: scored.top_source_domain,
      overall_sentiment: scored.overall_sentiment,
      content_density: scored.content_density,
      recommended_angle: scored.recommended_angle,
      pakistan_relevance_score: scored.pakistan_relevance_score,
      scout_notes: scored.scout_notes,
    },
  };
}

// ─── Workflows ───────────────────────────────────────────────────────────────

async function scoutByTopic(topic: string, language: string, model: string, preferred: DiscoveryMethod | "auto"): Promise<ScoutOutput> {
  const { rawSources, queries, method, tried } = await discoverSources(topic, language, model, preferred);
  const { sources, meta } = await scoreSources(topic, rawSources, model);
  return {
    sources, input_type: "topic", image_mode: false,
    total_sources: sources.length, deduplication_removed: 0,
    top_source_domain: meta.top_source_domain,
    overall_sentiment: meta.overall_sentiment,
    content_density: meta.content_density,
    recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score,
    scout_notes: meta.scout_notes,
    search_queries_used: queries, discovery_method: method, discovery_methods_tried: tried,
  };
}

async function scoutByUrl(urlInput: string, topic: string, language: string, model: string, preferred: DiscoveryMethod | "auto"): Promise<ScoutOutput> {
  const body = await fetchUrlContent(urlInput);
  const primary: RawSource = { url: urlInput, title: topic || slugifyDomain(urlInput), snippet: "", markdown: body };
  const topicForSearch = topic && topic !== urlInput ? topic : `articles related to ${slugifyDomain(urlInput)}`;
  const { rawSources: supplemental, queries, method, tried } = await discoverSources(topicForSearch, language, model, preferred);
  const combined = [primary, ...supplemental.filter(s => s.url !== urlInput)].slice(0, 8);
  const { sources, meta } = await scoreSources(topicForSearch, combined, model);
  return {
    sources, input_type: "url", image_mode: false,
    total_sources: sources.length, deduplication_removed: 0,
    top_source_domain: slugifyDomain(urlInput),
    overall_sentiment: meta.overall_sentiment,
    content_density: "high",
    recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score,
    scout_notes: meta.scout_notes,
    search_queries_used: queries,
    discovery_method: "url_fetch", discovery_methods_tried: [...tried, "url_fetch"],
  };
}

async function extractPdfText(pdfUrl: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return "";
    const buf = new Uint8Array(await res.arrayBuffer());
    const doc = await getDocumentProxy(buf);
    const { text } = await extractText(doc, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).slice(0, 10000);
  } catch (e) { console.error("[Scout] PDF extract failed:", e); return ""; }
}

async function scoutByPdf(pdfUrl: string, topic: string, language: string, model: string, preferred: DiscoveryMethod | "auto"): Promise<ScoutOutput> {
  const text = await extractPdfText(pdfUrl);
  const primary: RawSource = { url: pdfUrl, title: topic || "Uploaded PDF", snippet: text.slice(0, 300), markdown: text };
  const inferredTopic = topic || text.slice(0, 200);
  const { rawSources: supplemental, queries, method, tried } = await discoverSources(inferredTopic, language, model, preferred);
  const combined = [primary, ...supplemental].slice(0, 8);
  const { sources, meta } = await scoreSources(inferredTopic, combined, model);
  return {
    sources, input_type: "pdf", image_mode: false,
    total_sources: sources.length, deduplication_removed: 0,
    top_source_domain: "uploaded-pdf",
    overall_sentiment: meta.overall_sentiment,
    content_density: text.length > 2000 ? "high" : "medium",
    recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score,
    scout_notes: meta.scout_notes,
    search_queries_used: queries,
    discovery_method: "pdf_extract", discovery_methods_tried: [...tried, "pdf_extract"],
  };
}

async function scoutByImage(imageUrl: string, topic: string, language: string, model: string, preferred: DiscoveryMethod | "auto"): Promise<ScoutOutput> {
  const topicForSearch = topic || "image analysis";
  const { rawSources, queries, method, tried } = await discoverSources(topicForSearch, language, model, preferred);
  const { sources, meta } = await scoreSources(topicForSearch, rawSources, model);
  return {
    sources, input_type: "image", image_mode: true,
    total_sources: sources.length, deduplication_removed: 0,
    top_source_domain: meta.top_source_domain,
    overall_sentiment: meta.overall_sentiment,
    content_density: "medium",
    recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score,
    scout_notes: `Image input — image_mode=true for Vision-16. ${meta.scout_notes}. Supporting sources via ${method}.`,
    search_queries_used: queries, discovery_method: method, discovery_methods_tried: tried,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────────

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
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);
    const preferred: DiscoveryMethod | "auto" = payload.discovery_method || "auto";

    console.log(`[${AGENT_NAME}] run=${run_id} topic="${topic}" model=${selectedModel} method=${preferred} payload=${Object.keys(payload).join(",")}`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)} | model: ${selectedModel} | method: ${preferred}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    let output: ScoutOutput;
    if (payload.image_url)    output = await scoutByImage(payload.image_url, topic, language, selectedModel, preferred);
    else if (payload.pdf_url) output = await scoutByPdf(payload.pdf_url, topic, language, selectedModel, preferred);
    else if (payload.url)     output = await scoutByUrl(payload.url, topic, language, selectedModel, preferred);
    else                       output = await scoutByTopic(topic, language, selectedModel, preferred);

    output.sources = output.sources.slice(0, 7);
    output.total_sources = output.sources.length;

    const durationMs = Date.now() - startedAt;
    await writeAgentOutput(run_id, AGENT_KEY, output, {
      tokens: Math.ceil(JSON.stringify(output).length / 4),
      duration_ms: durationMs, status: "completed",
    });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      sources_found: output.total_sources, top_domain: output.top_source_domain,
      discovery_method: output.discovery_method,
      discovery_methods_tried: output.discovery_methods_tried,
    });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `${output.total_sources} sources via ${output.discovery_method} (tried ${output.discovery_methods_tried.join("→")}), ${durationMs}ms`,
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ ${durationMs}ms — ${output.total_sources} sources (${output.discovery_method})`);
    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      sources_found: output.total_sources, duration_ms: durationMs,
      discovery_method: output.discovery_method, top_domain: output.top_source_domain,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? (err as GeminiError).status : 500;
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, {
          status: "failed", finished_at: new Date().toISOString(), error: msg,
        });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, {
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
