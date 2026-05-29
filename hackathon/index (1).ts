// supabase/functions/scout-agent/index.ts
// LADtoday Scout Agent — the Bright Data powered web spider
// Uses: SERP API + Web Unlocker + Scraping Browser + Web Scraper API

import { corsHeaders } from "../_shared/cors.ts";

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN")!;
const BRIGHTDATA_USERNAME = Deno.env.get("BRIGHTDATA_USERNAME")!;
const BRIGHTDATA_PASSWORD = Deno.env.get("BRIGHTDATA_PASSWORD")!;
const BRIGHTDATA_CUSTOMER_ID = Deno.env.get("BRIGHTDATA_CUSTOMER_ID")!;

// ─── BRIGHT DATA: SERP API ────────────────────────────────────────────────────
// Discovers the top 10 most relevant live URLs for any topic
// Without this, Scout has no way to find current sources
async function serpDiscover(query: string, geo = "pk", numResults = 10) {
  const params = new URLSearchParams({
    q: query,
    gl: geo,
    hl: "en",
    num: String(numResults)
  });

  const response = await fetch(
    `https://api.brightdata.com/serp/google/search?${params}`,
    {
      headers: {
        "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  if (!response.ok) {
    console.error("SERP API error:", await response.text());
    return [];
  }

  const data = await response.json();

  return (data.organic ?? []).map((r: any) => ({
    url: r.link,
    title: r.title,
    snippet: r.snippet,
    position: r.position
  }));
}

// Also fetch "People Also Ask" for SEO Agent downstream
async function serpPAA(query: string) {
  const params = new URLSearchParams({ q: query, gl: "pk", feature: "paa" });
  const response = await fetch(
    `https://api.brightdata.com/serp/google/search?${params}`,
    { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
  );
  const data = await response.json();
  return data.people_also_ask ?? [];
}

// ─── BRIGHT DATA: WEB UNLOCKER ────────────────────────────────────────────────
// Bypasses bot detection, CAPTCHAs, Cloudflare, geo-blocks on ANY URL
// This is why we can scrape Reuters, Bloomberg, FT, LinkedIn etc.
async function scrapeWithUnlocker(url: string): Promise<{ content: string; status: number }> {
  const proxyUrl = `https://brd.superproxy.io:22225`;
  const auth = btoa(`${BRIGHTDATA_USERNAME}:${BRIGHTDATA_PASSWORD}`);

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Basic ${auth}`,
        "X-Brd-Product": "unlocker",
        "X-Brd-Customer": BRIGHTDATA_CUSTOMER_ID,
        "X-Brd-Zone": "unlocker",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    const content = await response.text();
    return { content, status: response.status };
  } catch (err) {
    console.error(`Web Unlocker failed for ${url}:`, err);
    return { content: "", status: 0 };
  }
}

// ─── BRIGHT DATA: WEB SCRAPER API ────────────────────────────────────────────
// Pre-built scrapers for 660+ major sites — returns clean structured JSON
// Used for: LinkedIn job postings (hiring signals), news site structured data
async function scrapeStructured(datasetId: string, queries: any[]) {
  const response = await fetch("https://api.brightdata.com/datasets/v3/trigger", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      dataset_id: datasetId,
      include_errors: true,
      data: queries
    })
  });

  if (!response.ok) return null;
  const { snapshot_id } = await response.json();

  // Poll for completion (max 30s)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://api.brightdata.com/datasets/v3/snapshots/${snapshot_id}`,
      { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
    );
    const statusData = await statusRes.json();
    if (statusData.status === "ready") {
      const dataRes = await fetch(
        `https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}`,
        { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
      );
      return dataRes.json();
    }
  }
  return null;
}

// ─── CONTENT EXTRACTION ───────────────────────────────────────────────────────
// Parse raw HTML → clean article text
function extractText(html: string, url: string): string {
  // Remove script, style, nav, footer tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")          // strip all remaining HTML tags
    .replace(/\s+/g, " ")              // collapse whitespace
    .trim();

  // Limit to 3000 chars per source to manage token count
  return text.slice(0, 3000);
}

// Estimate source credibility from domain
function getSourceCredibility(url: string): number {
  const highCredibility = ["reuters.com", "bloomberg.com", "ft.com", "wsj.com", "bbc.com", "theguardian.com", "dawn.com", "thenews.com.pk"];
  const mediumCredibility = ["techcrunch.com", "venturebeat.com", "techjuice.pk", "propakistani.pk", "geo.tv"];

  const domain = new URL(url).hostname.replace("www.", "");
  if (highCredibility.some(d => domain.includes(d))) return 0.9;
  if (mediumCredibility.some(d => domain.includes(d))) return 0.7;
  return 0.5;
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { topic, urls = [], geo = "pk", depth = 2, mode = "serp" } = await req.json();
  const startTime = Date.now();

  const sources: any[] = [];
  let blockedCount = 0; // Track how many would have been blocked without Bright Data
  let brightDataCalls = 0;

  // ── STEP 1: SERP Discovery ──────────────────────────────────────────────────
  console.log(`[Scout] SERP API: discovering URLs for "${topic}"`);
  const serpResults = await serpDiscover(topic, geo);
  const paaResults = await serpPAA(topic);
  brightDataCalls++;

  const targetUrls = [
    ...urls,
    ...serpResults.map((r: any) => r.url)
  ].slice(0, 8); // max 8 sources per pipeline run

  console.log(`[Scout] Found ${targetUrls.length} URLs to scrape`);

  // ── STEP 2: Web Unlocker — scrape each URL ──────────────────────────────────
  for (const url of targetUrls) {
    console.log(`[Scout] Web Unlocker → ${url}`);

    // Without Bright Data these would mostly return 403/blocked
    const isPremium = ["reuters.com", "bloomberg.com", "ft.com", "linkedin.com", "wsj.com"]
      .some(d => url.includes(d));
    if (isPremium) blockedCount++;

    const { content, status } = await scrapeWithUnlocker(url);
    brightDataCalls++;

    if (content && content.length > 200) {
      const extracted = extractText(content, url);
      const credibility = getSourceCredibility(url);

      // Extract published date from meta tags if present
      const dateMatch = content.match(/(?:publishedTime|datePublished)['":\s]+([0-9T:Z\-]+)/);
      const publishedAt = dateMatch ? dateMatch[1] : new Date().toISOString();

      sources.push({
        url,
        title: serpResults.find((r: any) => r.url === url)?.title ?? url,
        content: extracted,
        publishedAt,
        sourceCredibility: credibility,
        tool_used: "web_unlocker",
        word_count: extracted.split(" ").length
      });
    }
  }

  // ── STEP 3: LinkedIn hiring signals (Finance/GTM tracks) ───────────────────
  if (topic.toLowerCase().includes("company") || topic.toLowerCase().includes("hiring")) {
    console.log(`[Scout] Web Scraper API → LinkedIn jobs for topic context`);
    const linkedinData = await scrapeStructured(
      "gd_l1viktl72bvl7bjuj0", // LinkedIn Jobs dataset ID
      [{ keyword: topic, location: "Pakistan" }]
    );
    brightDataCalls++;

    if (linkedinData) {
      sources.push({
        url: "https://linkedin.com/jobs",
        title: `LinkedIn Hiring Signals: ${topic}`,
        content: JSON.stringify(linkedinData).slice(0, 2000),
        publishedAt: new Date().toISOString(),
        sourceCredibility: 0.8,
        tool_used: "scraper_api"
      });
    }
  }

  const duration = Date.now() - startTime;

  return new Response(JSON.stringify({
    sources,
    paa_questions: paaResults,
    metadata: {
      total_sources: sources.length,
      blocked_count: blockedCount,
      scrape_duration_ms: duration,
      bright_data_calls: brightDataCalls,
      topic,
      message: `${blockedCount} premium sources would have been blocked without Bright Data`
    }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
