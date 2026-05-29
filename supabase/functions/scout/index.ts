// ============================================================
// Agent 01 — Scout Agent
// Phase: DISCOVER | Depends on: none
// ============================================================
// Reads run_id from request body, loads run from DB,
// discovers real sources via Firecrawl → Gemini grounding → DuckDuckGo,
// scores them with Gemini, writes output to agent_outputs.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";
import { 
  hasBrightDataCredentials, 
  brightDataSERP, 
  fetchWithBrightData,
  type BrightDataSource 
} from "../_shared/brightdata.ts";

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

type DiscoveryMethod = "firecrawl" | "gemini_grounding" | "duckduckgo" | "url_fetch" | "pdf_extract" | "brightdata_serp" | "brightdata_unlocker" | "auto";

interface RawSource { url: string; title: string; snippet: string; markdown?: string; }

interface SourceResult {
  title: string; url: string; source_domain: string;
  full_text: string; author: string; publish_date: string;
  credibility_score: number; recency_score: number; relevance_score: number;
  key_facts: string[]; sentiment: "positive" | "neutral" | "negative";
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
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LADtodayBot/1.0)", "Accept": "text/html" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
      .replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch { return ""; }
}

// ─── Query expansion ─────────────────────────────────────────────────────────
async function expandQueries(topic: string, language: string, model: string): Promise<string[]> {
  const schema = {
    type: "object",
    properties: { queries: { type: "array", items: { type: "string" } } },
    required: ["queries"],
  };
  const prompt = `You are a research assistant. The user asked: """${topic}"""
Convert this into 3 focused web search queries a journalist would use to find authoritative recent sources.
Prefer Pakistani context where relevant. Language: ${language}.
Return JSON: { "queries": ["...","...","..."] }`;
  try {
    const out = await geminiJson<{ queries: string[] }>(prompt, schema, { model, temperature: 0.4, maxOutputTokens: 512 });
    const qs = (out.queries || []).map(q => q.trim()).filter(Boolean);
    return qs.length ? qs.slice(0, 3) : [topic];
  } catch { return [topic]; }
}

// ─── Firecrawl search ─────────────────────────────────────────────────────────
async function firecrawlSearch(query: string, limit = 8): Promise<RawSource[]> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) { console.error(`[Scout] Firecrawl ${res.status}`); return []; }
    const data = await res.json();
    const arr = data?.data?.web || data?.data || data?.web?.results || [];
    return arr.map((r: any) => ({
      url: r.url, title: r.title || r.metadata?.title || "",
      snippet: r.description || r.snippet || "", markdown: r.markdown || "",
    })).filter((r: any) => r.url);
  } catch (e) { console.error("[Scout] Firecrawl error:", e); return []; }
}

// ─── Gemini grounding search ──────────────────────────────────────────────────
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
Prefer Pakistani publications (Dawn, Tribune, Geo, ARY, Business Recorder, SBP, SECP, .gov.pk) where relevant.
Reply with a JSON code block ONLY:
\`\`\`json
{ "sources": [ { "url": "https://...", "title": "...", "snippet": "1-2 sentence summary" } ] }
\`\`\`
Use real URLs from search. Do not invent URLs.` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { console.error(`[Scout] Gemini grounding ${res.status}`); return []; }
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text: string = (candidate?.content?.parts || []).map((p: any) => p.text || "").join("");
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
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
    for (const c of chunks) {
      const w = c?.web;
      if (w?.uri && !parsed.find(p => p.url === w.uri)) {
        parsed.push({ url: w.uri, title: w.title || w.uri, snippet: "" });
      }
    }
    return parsed.slice(0, 10);
  } catch (e) { console.error("[Scout] Gemini grounding error:", e); return []; }
}

// ─── DuckDuckGo fallback ──────────────────────────────────────────────────────
async function duckDuckGoSearch(query: string, limit = 8): Promise<RawSource[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Accept": "text/html" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: RawSource[] = [];
    const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = blockRe.exec(html)) && results.length < limit) {
      let rawUrl = mm[1];
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
  } catch (e) { console.error("[Scout] DuckDuckGo error:", e); return []; }
}

// ─── Discovery dispatcher ─────────────────────────────────────────────────────
async function discoverSources(
  topic: string, language: string, model: string, preferred: DiscoveryMethod | "auto"
): Promise<{ rawSources: RawSource[]; queries: string[]; method: DiscoveryMethod; tried: DiscoveryMethod[] }> {
  const queries = await expandQueries(topic, language, model);

  let order: DiscoveryMethod[];
  if (preferred === "auto") {
    order = [];
    // Prefer Bright Data if available
    if (hasBrightDataCredentials()) order.push("brightdata_serp");
    if (FIRECRAWL_API_KEY) order.push("firecrawl");
    if (GEMINI_API_KEY) order.push("gemini_grounding");
    order.push("duckduckgo");
  } else if (preferred === "brightdata_serp" || preferred === "brightdata_unlocker") {
    // Bright Data methods
    const all: DiscoveryMethod[] = ["brightdata_serp", "firecrawl", "gemini_grounding", "duckduckgo"];
    order = [preferred, ...all.filter(m => m !== preferred)];
  } else {
    const all: DiscoveryMethod[] = ["firecrawl", "gemini_grounding", "duckduckgo"];
    order = [preferred, ...all.filter(m => m !== preferred)];
  }

  const tried: DiscoveryMethod[] = [];
  let chosen: DiscoveryMethod = order[0] || "duckduckgo";
  let raws: RawSource[] = [];

  for (const m of order) {
    // Skip if credentials not available
    if ((m === "brightdata_serp" || m === "brightdata_unlocker") && !hasBrightDataCredentials()) continue;
    if (m === "firecrawl" && !FIRECRAWL_API_KEY) continue;
    
    tried.push(m);
    let r: RawSource[] = [];
    
    if (m === "brightdata_serp") {
      // Use Bright Data SERP API
      const buckets = await Promise.all(queries.slice(0, 2).map(q => 
        brightDataSERP(q, { geo: "pk", num: 6 })
          .then(results => results.map(bd => ({
            url: bd.url,
            title: bd.title,
            snippet: bd.snippet,
            markdown: bd.markdown,
          })))
          .catch(err => {
            console.error(`[Scout] Bright Data SERP failed:`, err);
            return [];
          })
      ));
      r = buckets.flat();
    } else if (m === "brightdata_unlocker") {
      // Use Bright Data Web Unlocker for direct URL fetching
      // This is used when we have specific URLs to scrape
      console.log(`[Scout] Bright Data Unlocker mode - requires specific URLs`);
      r = [];
    } else if (m === "firecrawl") {
      const buckets = await Promise.all(queries.slice(0, 2).map(q => firecrawlSearch(q, 6)));
      r = buckets.flat();
    } else if (m === "gemini_grounding") {
      r = await geminiGroundedSearch(topic, model);
    } else if (m === "duckduckgo") {
      const buckets = await Promise.all(queries.slice(0, 2).map(q => duckDuckGoSearch(q, 6)));
      r = buckets.flat();
    }
    
    if (r.length >= 1) { chosen = m; raws = r; if (r.length >= 5) break; }
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

// ─── Score sources with Gemini ────────────────────────────────────────────────
async function scoreSources(topic: string, raws: RawSource[], model: string): Promise<{ sources: SourceResult[]; meta: any }> {
  if (raws.length === 0) throw new Error("Scout discovered 0 sources — all backends returned empty.");

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
            credibility_score: { type: "number" }, recency_score: { type: "number" },
            relevance_score: { type: "number" },
            key_facts: { type: "array", items: { type: "string" } },
            sentiment: { type: "string" },
            credibility_signals: { type: "array", items: { type: "string" } },
          },
          required: ["index","full_text","author","publish_date","credibility_score","recency_score","relevance_score","key_facts","sentiment","credibility_signals"],
        },
      },
      top_source_domain: { type: "string" }, overall_sentiment: { type: "string" },
      content_density: { type: "string" }, recommended_angle: { type: "string" },
      pakistan_relevance_score: { type: "number" }, scout_notes: { type: "string" },
    },
    required: ["sources","top_source_domain","overall_sentiment","content_density","recommended_angle","pakistan_relevance_score","scout_notes"],
  };

  const sourcesBlock = enriched.map((s, i) => `[SOURCE ${i}] ${s.title}\nURL: ${s.url}\nBODY:\n${s.body}\n`).join("\n---\n");

  const prompt = `You are LADtoday's research analyst. Topic: "${topic}".
Populate every required field. No empty strings, no empty arrays, no nulls.

For EACH source:
- full_text: 200-word factual summary from BODY (no invention)
- author: detected byline or "Staff Reporter"
- publish_date: ISO date from body or "${today()}"
- credibility_score 0-1 (gov/academic .9+, major news .7-.85, blog .3-.5)
- recency_score 0-1 (today=1, week=.8, month=.6, older=.3)
- relevance_score 0-1 to the topic
- key_facts: 3 specific facts from body (each ≥10 words)
- sentiment: positive|neutral|negative
- credibility_signals: 2-4 short reasons this source is credible

Overall: top_source_domain, overall_sentiment, content_density (low|medium|high),
recommended_angle (1-2 sentence editorial angle for Pakistani audience),
pakistan_relevance_score 0-10, scout_notes (1-2 sentence editor summary)

Sources:\n${sourcesBlock}`;

  let scored: any;
  try {
    scored = await geminiJson(prompt, schema, { model, temperature: 0.3, maxOutputTokens: 8192 });
  } catch (err) {
    console.error(`[${AGENT_NAME}] scoreSources retry:`, err);
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
      credibility_score: Number(sc.credibility_score), recency_score: Number(sc.recency_score),
      relevance_score: Number(sc.relevance_score),
      key_facts: sc.key_facts, sentiment: sc.sentiment, credibility_signals: sc.credibility_signals,
    };
  });

  return {
    sources,
    meta: {
      top_source_domain: scored.top_source_domain, overall_sentiment: scored.overall_sentiment,
      content_density: scored.content_density, recommended_angle: scored.recommended_angle,
      pakistan_relevance_score: scored.pakistan_relevance_score, scout_notes: scored.scout_notes,
    },
  };
}

// ─── Workflow helpers ─────────────────────────────────────────────────────────
async function scoutByTopic(topic: string, language: string, model: string, preferred: DiscoveryMethod | "auto"): Promise<ScoutOutput> {
  const { rawSources, queries, method, tried } = await discoverSources(topic, language, model, preferred);
  const { sources, meta } = await scoreSources(topic, rawSources, model);
  return {
    sources, input_type: "topic", image_mode: false,
    total_sources: sources.length, deduplication_removed: 0,
    top_source_domain: meta.top_source_domain, overall_sentiment: meta.overall_sentiment,
    content_density: meta.content_density, recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score, scout_notes: meta.scout_notes,
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
    top_source_domain: slugifyDomain(urlInput), overall_sentiment: meta.overall_sentiment,
    content_density: "high", recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score, scout_notes: meta.scout_notes,
    search_queries_used: queries, discovery_method: "url_fetch", discovery_methods_tried: [...tried, "url_fetch"],
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
    top_source_domain: "uploaded-pdf", overall_sentiment: meta.overall_sentiment,
    content_density: text.length > 2000 ? "high" : "medium",
    recommended_angle: meta.recommended_angle, pakistan_relevance_score: meta.pakistan_relevance_score,
    scout_notes: meta.scout_notes, search_queries_used: queries,
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
    top_source_domain: meta.top_source_domain, overall_sentiment: meta.overall_sentiment,
    content_density: "medium", recommended_angle: meta.recommended_angle,
    pakistan_relevance_score: meta.pakistan_relevance_score,
    scout_notes: `Image input — image_mode=true for Vision agent. ${meta.scout_notes}`,
    search_queries_used: queries, discovery_method: method, discovery_methods_tried: tried,
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

// ─── Main handler ─────────────────────────────────────────────────────────────
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

    console.log(`[${AGENT_NAME}] run=${run_id} topic="${topic}" model=${selectedModel} method=${preferred}`);
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
    
    console.log(`[${AGENT_NAME}] Writing output with ${output.total_sources} sources...`);
    try {
      await writeAgentOutput(run_id, AGENT_KEY, output, {
        tokens: Math.ceil(JSON.stringify(output).length / 4),
        duration_ms: durationMs, status: "completed",
      });
      console.log(`[${AGENT_NAME}] ✅ Output written successfully`);
    } catch (writeErr) {
      console.error(`[${AGENT_NAME}] ❌ Failed to write output:`, writeErr);
      throw new Error(`Failed to write agent output: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
    }
    
    try {
      await patchAgentState(run_id, AGENT_KEY, {
        status: "completed", finished_at: new Date().toISOString(),
        sources_found: output.total_sources, top_domain: output.top_source_domain,
        discovery_method: output.discovery_method,
        discovery_methods_tried: output.discovery_methods_tried,
      });
      console.log(`[${AGENT_NAME}] ✅ Agent state patched`);
    } catch (stateErr) {
      console.error(`[${AGENT_NAME}] ⚠️ Failed to patch state:`, stateErr);
      // Non-fatal, continue
    }
    
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
        await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt });
      }
    } catch { /* best effort */ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
