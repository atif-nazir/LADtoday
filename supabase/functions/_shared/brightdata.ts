// ============================================================
// Bright Data Integration Helper
// SERP API + Web Unlocker + Scraping Browser + Web Scraper API
// ============================================================

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN") || "";
const BRIGHTDATA_USERNAME = Deno.env.get("BRIGHTDATA_USERNAME") || "";
const BRIGHTDATA_PASSWORD = Deno.env.get("BRIGHTDATA_PASSWORD") || "";
const BRIGHTDATA_CUSTOMER_ID = Deno.env.get("BRIGHTDATA_CUSTOMER_ID") || "";

export function hasBrightDataCredentials(): boolean {
  const hasToken = !!BRIGHTDATA_API_TOKEN;
  const hasUserPass = !!(BRIGHTDATA_USERNAME && BRIGHTDATA_PASSWORD);
  console.log(`[BrightData] Credential check: API_TOKEN=${hasToken} (${BRIGHTDATA_API_TOKEN ? BRIGHTDATA_API_TOKEN.slice(0, 8) + "..." : "EMPTY"}), USER/PASS=${hasUserPass}`);
  return !!(hasToken || hasUserPass);
}

export interface BrightDataSource {
  url: string;
  title: string;
  snippet: string;
  markdown?: string;
  tool_used: "serp_api" | "web_unlocker" | "scraping_browser" | "scraper_api";
}

// ─── SERP API: Topic Discovery ───────────────────────────────────────────────
export async function brightDataSERP(
  query: string,
  options?: { geo?: string; num?: number }
): Promise<BrightDataSource[]> {
  if (!BRIGHTDATA_API_TOKEN) {
    console.error("[BrightData SERP] BRIGHTDATA_API_TOKEN is empty/undefined — skipping");
    throw new Error("BRIGHTDATA_API_TOKEN not configured");
  }

  const geo = options?.geo || "pk";
  const num = options?.num || 10;

  console.log(`[BrightData SERP] 🔍 Query: "${query}" | geo=${geo} | num=${num} | token=${BRIGHTDATA_API_TOKEN.slice(0, 8)}...`);

  try {
    const params = new URLSearchParams({
      q: query,
      gl: geo,
      num: num.toString(),
    });

    const url = `https://api.brightdata.com/serp/google/search?${params}`;
    console.log(`[BrightData SERP] → Fetching: ${url}`);

    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();
    console.log(`[BrightData SERP] ← Status: ${response.status} | Body length: ${responseText.length} | First 500 chars: ${responseText.slice(0, 500)}`);

    if (!response.ok) {
      console.error(`[BrightData SERP] ❌ HTTP ${response.status}: ${responseText.slice(0, 300)}`);
      return [];
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`[BrightData SERP] ❌ Failed to parse JSON response: ${parseErr}`);
      return [];
    }

    // Log all top-level keys to understand the response structure
    console.log(`[BrightData SERP] Response keys: ${Object.keys(data).join(", ")}`);
    
    const results = data.organic || [];
    console.log(`[BrightData SERP] ✅ Found ${results.length} organic results`);

    if (results.length === 0) {
      console.warn(`[BrightData SERP] ⚠️ 0 organic results. Full response structure: ${JSON.stringify(data).slice(0, 800)}`);
    }

    return results.map((r: any) => ({
      url: r.link || r.url,
      title: r.title || "",
      snippet: r.snippet || r.description || "",
      tool_used: "serp_api" as const,
    })).filter((r: any) => r.url);
  } catch (err) {
    console.error(`[BrightData SERP] ❌ Exception: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`[BrightData SERP] Stack: ${err instanceof Error ? err.stack : "N/A"}`);
    return [];
  }
}

// ─── Web Unlocker: Bypass Bot Detection ──────────────────────────────────────
export async function brightDataWebUnlocker(url: string): Promise<string> {
  if (!BRIGHTDATA_USERNAME || !BRIGHTDATA_PASSWORD) {
    throw new Error("BRIGHTDATA_USERNAME and BRIGHTDATA_PASSWORD not configured");
  }

  try {
    const proxyUrl = `http://brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-unlocker:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:22225`;
    
    // For Deno, we need to use fetch with proxy headers
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.error(`[BrightData Unlocker] ${response.status} for ${url}`);
      return "";
    }

    return await response.text();
  } catch (err) {
    console.error("[BrightData Unlocker] Error:", err);
    return "";
  }
}

// ─── Scraping Browser: JavaScript-Rendered Sites ─────────────────────────────
export async function brightDataScrapingBrowser(url: string): Promise<string> {
  // Note: Scraping Browser requires WebSocket connection via Puppeteer/Playwright
  // For now, fallback to Web Unlocker
  console.warn("[BrightData] Scraping Browser not yet implemented, using Web Unlocker");
  return await brightDataWebUnlocker(url);
}

// ─── Web Scraper API: Structured Data (LinkedIn, Amazon, etc.) ───────────────
export async function brightDataWebScraperAPI(
  dataset: string,
  params: Record<string, any>
): Promise<any[]> {
  if (!BRIGHTDATA_API_TOKEN) {
    throw new Error("BRIGHTDATA_API_TOKEN not configured");
  }

  try {
    const response = await fetch("https://api.brightdata.com/datasets/v3/trigger", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataset_id: dataset,
        data: [params],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[BrightData Scraper API] ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error("[BrightData Scraper API] Error:", err);
    return [];
  }
}

// ─── Helper: Extract clean text from HTML ────────────────────────────────────
export function extractTextFromHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Helper: Fetch and extract content ───────────────────────────────────────
export async function fetchWithBrightData(
  url: string,
  method: "unlocker" | "browser" = "unlocker"
): Promise<{ html: string; text: string; markdown?: string }> {
  const html = method === "browser"
    ? await brightDataScrapingBrowser(url)
    : await brightDataWebUnlocker(url);

  const text = extractTextFromHTML(html);

  return {
    html,
    text: text.slice(0, 8000), // Limit to 8000 chars
    markdown: text.slice(0, 8000), // Could convert to markdown here
  };
}
