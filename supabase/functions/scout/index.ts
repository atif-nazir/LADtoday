// supabase/functions/scout/index.ts
// Scout — Bright Data SERP + Web Unlocker discovery, with Firecrawl + DuckDuckGo fallbacks
// so the pipeline never returns zero sources even before BD keys are added.

import { corsHeaders } from "../_shared/cors.ts";

const BD_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN") || "";
const BD_USER = Deno.env.get("BRIGHTDATA_USERNAME") || "";
const BD_PASS = Deno.env.get("BRIGHTDATA_PASSWORD") || "";
const BD_CUST = Deno.env.get("BRIGHTDATA_CUSTOMER_ID") || "";
const FIRECRAWL = Deno.env.get("FIRECRAWL_API_KEY") || "";

interface DiscoveredUrl { url: string; title: string; snippet: string; }

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

function credibility(url: string): number {
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    const hi = ["reuters.com","bloomberg.com","ft.com","wsj.com","bbc.com","theguardian.com","dawn.com","thenews.com.pk","sbp.org.pk","secp.gov.pk"];
    const mid = ["techcrunch.com","venturebeat.com","techjuice.pk","propakistani.pk","geo.tv","tribune.com.pk","arynews.tv"];
    if (hi.some(d => domain.includes(d))) return 0.9;
    if (mid.some(d => domain.includes(d))) return 0.7;
    return 0.5;
  } catch { return 0.5; }
}

// ── Discovery backends ───────────────────────────────────────────────
async function bdSerp(q: string, geo = "pk"): Promise<DiscoveredUrl[]> {
  if (!BD_TOKEN) return [];
  try {
    const url = `https://api.brightdata.com/serp/google/search?q=${encodeURIComponent(q)}&gl=${geo}&num=10`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${BD_TOKEN}` } });
    if (!res.ok) { console.error("BD SERP error", res.status); return []; }
    const data = await res.json();
    return (data.organic ?? []).map((r: any) => ({ url: r.link, title: r.title, snippet: r.snippet || "" }));
  } catch (e) { console.error("BD SERP exception", e); return []; }
}

async function firecrawlSearch(q: string): Promise<DiscoveredUrl[]> {
  if (!FIRECRAWL) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: 8, country: "pk" }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.data || data?.web || [];
    return items.map((r: any) => ({ url: r.url || r.link, title: r.title || r.url, snippet: r.description || r.snippet || "" }));
  } catch (e) { console.error("Firecrawl search error", e); return []; }
}

async function duckduckgoSearch(q: string): Promise<DiscoveredUrl[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();
    const results: DiscoveredUrl[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null && results.length < 8) {
      let url = m[1];
      const dec = url.match(/uddg=([^&]+)/);
      if (dec) url = decodeURIComponent(dec[1]);
      results.push({ url, title: m[2].replace(/<[^>]+>/g, "").trim(), snippet: "" });
    }
    return results;
  } catch (e) { console.error("DDG error", e); return []; }
}

// ── Scrapers ─────────────────────────────────────────────────────────
async function bdUnlock(url: string): Promise<{ content: string; status: number }> {
  if (!BD_USER || !BD_PASS) return { content: "", status: 0 };
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${btoa(`${BD_USER}:${BD_PASS}`)}`,
        "X-Brd-Product": "unlocker",
        "X-Brd-Customer": BD_CUST,
        "X-Brd-Zone": "unlocker",
        "User-Agent": "Mozilla/5.0",
      },
    });
    return { content: await res.text(), status: res.status };
  } catch { return { content: "", status: 0 }; }
}

async function firecrawlScrape(url: string): Promise<string> {
  if (!FIRECRAWL) return "";
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) return "";
    const d = await res.json();
    return (d.markdown || d.data?.markdown || "").slice(0, 3000);
  } catch { return ""; }
}

async function plainFetch(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return "";
    return stripHtml(await res.text());
  } catch { return ""; }
}

// ── Main ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { topic, urls = [], geo = "pk" } = await req.json();
  const t0 = Date.now();
  let bdCalls = 0;
  const usedTools = new Set<string>();

  // 1. Discover URLs — try BD SERP, then Firecrawl, then DDG
  let discovered: DiscoveredUrl[] = [];
  if (BD_TOKEN) {
    discovered = await bdSerp(topic, geo);
    if (discovered.length) { bdCalls++; usedTools.add("bd_serp"); }
  }
  if (discovered.length < 5 && FIRECRAWL) {
    const fc = await firecrawlSearch(topic);
    discovered = [...discovered, ...fc];
    if (fc.length) usedTools.add("firecrawl_search");
  }
  if (discovered.length < 5) {
    const dd = await duckduckgoSearch(topic);
    discovered = [...discovered, ...dd];
    if (dd.length) usedTools.add("duckduckgo");
  }

  // Merge with explicit URLs, dedupe, cap at 8
  const seen = new Set<string>();
  const targets = [...urls.map((u: string) => ({ url: u, title: u, snippet: "" })), ...discovered]
    .filter(d => { try { const h = new URL(d.url).hostname; if (seen.has(h)) return false; seen.add(h); return true; } catch { return false; } })
    .slice(0, 8);

  // 2. Scrape each — BD unlocker → Firecrawl → plain fetch
  const sources: any[] = [];
  let blockedCount = 0;
  const premium = ["reuters.com","bloomberg.com","ft.com","wsj.com","linkedin.com"];

  for (const t of targets) {
    const isPremium = premium.some(d => t.url.includes(d));
    let content = ""; let tool = "";

    if (BD_USER && BD_PASS) {
      const r = await bdUnlock(t.url);
      bdCalls++;
      if (r.content && r.content.length > 500) { content = stripHtml(r.content); tool = "web_unlocker"; if (isPremium) blockedCount++; }
    }
    if (!content && FIRECRAWL) {
      content = await firecrawlScrape(t.url);
      if (content) tool = "firecrawl";
    }
    if (!content) {
      content = await plainFetch(t.url);
      if (content) tool = "fetch";
    }
    if (content && content.length > 200) {
      sources.push({
        url: t.url,
        title: t.title,
        snippet: t.snippet,
        content,
        publishedAt: new Date().toISOString(),
        sourceCredibility: credibility(t.url),
        tool_used: tool,
        word_count: content.split(/\s+/).length,
      });
    }
  }

  // Fallback: if nothing scraped, return discovery snippets as minimal sources
  if (sources.length === 0 && discovered.length) {
    for (const d of discovered.slice(0, 5)) {
      sources.push({
        url: d.url, title: d.title, snippet: d.snippet, content: d.snippet || d.title,
        publishedAt: new Date().toISOString(), sourceCredibility: credibility(d.url),
        tool_used: "snippet_only", word_count: (d.snippet || "").split(/\s+/).length,
      });
    }
  }

  return new Response(JSON.stringify({
    sources,
    metadata: {
      total_sources: sources.length,
      blocked_count: blockedCount,
      scrape_duration_ms: Date.now() - t0,
      bright_data_calls: bdCalls,
      discovery_tools: Array.from(usedTools),
      topic,
      message: BD_TOKEN
        ? `${blockedCount} premium sources unlocked via Bright Data`
        : "Running without Bright Data — using Firecrawl/DuckDuckGo fallback",
    },
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
