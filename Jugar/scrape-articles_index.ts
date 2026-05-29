import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.49/deno-dom-wasm.ts";
import { insertLog } from "../_shared/logger.ts";
import { geminiJson, hasGeminiKey } from "../_shared/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

async function articleExistsByOldId(oldId: string): Promise<boolean> {
  const { data } = await supabase
    .from("articles")
    .select("id")
    .eq("old_article_id", oldId)
    .maybeSingle();
  return !!data;
}

async function articleExistsBySlug(slug: string): Promise<boolean> {
  const { data } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return !!data;
}

async function notifySlack(title: string, sourceName: string): Promise<void> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  const channel = Deno.env.get("SLACK_CHANNEL_ID");
  if (!token || !channel) return;

  const now = new Date().toLocaleString("en-US", { timeZone: "UTC" });
  const text = `📰 New article scraped: *"${title}"* from *${sourceName}* at *${now} UTC*.`;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Slack error:", data.error);
  } catch (err) {
    console.error("Slack failed:", err);
  }
}

interface ArticleInsert {
  title: string;
  slug: string;
  category_id: string;
  source_id: string;
  date: string;
  read_time: string;
  image: string;
  author_name: string;
  author_avatar: string;
  author_bio: string;
  introduction: string | null;
  sections: { heading: string; content: string; image: string | null }[];
  tags: string[];
  subtitle: string | null;
  old_article_id: string | null;
  published: boolean;
  ai_rewrite_status: string;
  ai_rewrite_count: number;
  fb_status: string;
}

async function saveArticle(article: ArticleInsert): Promise<boolean> {
  // Ensure unique slug
  if (await articleExistsBySlug(article.slug)) {
    article.slug = `${article.slug}-${Date.now().toString(36)}`;
  }

  const { error } = await supabase.from("articles").insert(article);
  if (error) {
    console.error(`Failed to insert "${article.title}":`, error.message);
    return false;
  }
  console.log(`✅ Saved: "${article.title}"`);
  return true;
}

// ─── Legacy: The Conversation ────────────────────────────────────────────────

interface LegacyListItem {
  id: string | number;
  url: string;
  [key: string]: unknown;
}

async function scrapeLegacyTheConversation(
  source: { id: string; url: string; category_id: string; name: string }
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  // Step 1: Get article list from __NEXT_DATA__
  const res = await fetch(source.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LucidVistaBot/1.0)" },
  });
  const html = await res.text();

  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) {
    console.error("Could not find __NEXT_DATA__");
    return { saved: 0, skipped: 0 };
  }

  const json = JSON.parse(match[1]);
  const blocks: LegacyListItem[] = json.props.pageProps.blocks
    .slice(0, 3)
    .flatMap((item: { blocks: LegacyListItem[] }) => item.blocks ?? []);

  const articleList = blocks.filter((b) => b?.url && b?.id);

  for (const item of articleList) {
    const oldId = String(item.id);

    if (await articleExistsByOldId(oldId)) {
      skipped++;
      continue;
    }

    // Scrape article detail
    const detail = await scrapeConversationArticle(item.url as string);
    if (!detail || !detail.title || !detail.image) {
      skipped++;
      continue;
    }

    const ok = await saveArticle({
      title: detail.title,
      subtitle: detail.caption,
      slug: slugify(detail.title),
      category_id: source.category_id,
      source_id: source.id,
      date: today(),
      read_time: "5 min",
      image: detail.image,
      author_name: "Atif Nazir",
      author_avatar:
        "https://img.freepik.com/free-photo/young-handsome-man-wearing-casual-tshirt-blue-background-happy-face-smiling-with-crossed-arms-looking-camera-positive-person_839833-12963.jpg",
      author_bio: "Atif bio",
      introduction: detail.sections[0]?.content?.trim() ?? null,
      sections: detail.sections.slice(1).map((s) => ({
        heading: s.heading ?? "",
        content: s.content.trim(),
        image: s.image ?? null,
      })),
      tags: detail.topics,
      old_article_id: oldId,
      published: false,
      ai_rewrite_status: "pending",
      ai_rewrite_count: 0,
      fb_status: "queued",
    });

    if (ok) {
      saved++;
      await notifySlack(detail.title, source.name);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return { saved, skipped };
}

interface ArticleSection {
  heading: string | null;
  content: string;
  image: string | null;
}

interface ConversationDetail {
  title: string;
  image: string | null;
  caption: string | null;
  topics: string[];
  sections: ArticleSection[];
}

async function scrapeConversationArticle(
  url: string
): Promise<ConversationDetail | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LucidVistaBot/1.0)",
      },
    });
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    if (!doc) return null;

    const title =
      doc
        .querySelector("h1[itemprop='headline'] strong")
        ?.textContent?.trim() ??
      doc.querySelector("h1[itemprop='headline']")?.textContent?.trim() ??
      "";
    if (!title) return null;

    const imgEl = doc.querySelector("figure.magazine img");
    let image: string | null = null;
    if (imgEl) {
      const srcset = imgEl.getAttribute("srcset");
      if (srcset) image = srcset.split(",")[0].trim().split(" ")[0];
      else image = imgEl.getAttribute("src") ?? null;
    }

    const caption =
      doc.querySelector("figure.magazine figcaption")?.textContent?.trim() ??
      null;

    const topics = Array.from(
      doc.querySelectorAll("ul[aria-label='Topics'] a")
    ).map((a) => a.textContent?.trim() ?? "");

    const body = doc.querySelector(".entry-content");
    const sections: ArticleSection[] = [];
    let currentSection: ArticleSection = {
      heading: null,
      content: "",
      image: null,
    };

    if (body) {
      for (const node of Array.from(body.childNodes)) {
        const el = node as any;
        const tag = el.tagName?.toUpperCase();

        if (tag === "H2") {
          if (currentSection.content || currentSection.image) {
            sections.push({ ...currentSection });
          }
          currentSection = {
            heading: el.textContent?.trim() ?? null,
            content: "",
            image: null,
          };
        } else if (tag === "P") {
          currentSection.content +=
            (el.textContent?.trim() ?? "") + "\n\n";
        } else if (tag === "FIGURE") {
          const figImg = el.querySelector("img");
          const imgSrc =
            figImg?.getAttribute("src") ??
            figImg?.getAttribute("data-src") ??
            null;
          if (imgSrc) currentSection.image = imgSrc;
        }
      }
      if (currentSection.content || currentSection.image) {
        sections.push({ ...currentSection });
      }
    }

    return { title, image, caption, topics, sections };
  } catch (err) {
    console.error(`Failed to scrape ${url}:`, err);
    return null;
  }
}

// ─── CSS Selector Scraping ───────────────────────────────────────────────────

async function scrapeCSSSource(
  source: {
    id: string;
    url: string;
    category_id: string;
    name: string;
    selectors: { link?: string; title?: string; content?: string; image?: string };
  }
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  const { selectors } = source;
  if (!selectors.link) {
    console.warn(`⚠️ No link selector for "${source.name}", skipping.`);
    return { saved: 0, skipped: 0 };
  }

  // Fetch listing page
  const res = await fetch(source.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LucidVistaBot/1.0)" },
  });
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  if (!doc) return { saved: 0, skipped: 0 };

  // Get article links
  const linkEls = Array.from(doc.querySelectorAll(selectors.link));
  const links: string[] = [];
  for (const el of linkEls.slice(0, 20)) {
    const href =
      el.getAttribute("href") ??
      el.querySelector("a")?.getAttribute("href");
    if (href) {
      const fullUrl = href.startsWith("http")
        ? href
        : new URL(href, source.url).toString();
      links.push(fullUrl);
    }
  }

  for (const link of links) {
    const linkSlug = slugify(link.split("/").pop() || `article-${Date.now()}`);
    if (await articleExistsBySlug(linkSlug)) {
      skipped++;
      continue;
    }

    try {
      const articleRes = await fetch(link, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LucidVistaBot/1.0)",
        },
      });
      const articleHtml = await articleRes.text();
      const articleDoc = parser.parseFromString(articleHtml, "text/html");
      if (!articleDoc) { skipped++; continue; }

      const title =
        (selectors.title
          ? articleDoc.querySelector(selectors.title)?.textContent?.trim()
          : null) ??
        articleDoc.querySelector("h1")?.textContent?.trim() ??
        "";
      if (!title) { skipped++; continue; }

      const imageEl = selectors.image
        ? articleDoc.querySelector(selectors.image)
        : articleDoc.querySelector("article img, .post-content img, figure img");
      const image =
        imageEl?.getAttribute("src") ??
        imageEl?.getAttribute("data-src") ??
        "";

      const contentEls = selectors.content
        ? Array.from(articleDoc.querySelectorAll(selectors.content))
        : Array.from(articleDoc.querySelectorAll("article p, .post-content p"));
      const content = contentEls
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n");

      if (!content) { skipped++; continue; }

      const ok = await saveArticle({
        title,
        subtitle: null,
        slug: slugify(title),
        category_id: source.category_id,
        source_id: source.id,
        date: today(),
        read_time: `${Math.max(1, Math.ceil(content.split(/\s+/).length / 230))} min`,
        image: image || "",
        author_name: "Staff Writer",
        author_avatar: "",
        author_bio: "",
        introduction: content.slice(0, 500),
        sections: [{ heading: "Article Content", content, image: null }],
        tags: [],
        old_article_id: null,
        published: false,
        ai_rewrite_status: "pending",
        ai_rewrite_count: 0,
        fb_status: "queued",
      });

      if (ok) {
        saved++;
        await notifySlack(title, source.name);
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`CSS scrape error for ${link}:`, err);
      skipped++;
    }
  }

  return { saved, skipped };
}

// ─── Smart AI Scraping ───────────────────────────────────────────────────────

async function scrapeSmartAI(
  source: { id: string; url: string; category_id: string; name: string }
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  if (!hasGeminiKey()) {
    console.warn("⚠️ GEMINI_API_KEY not set, AI scraping unavailable.");
    await insertLog("warning", "scraper", `AI scraping skipped for "${source.name}" — no GEMINI_API_KEY`);
    return { saved: 0, skipped: 0 };
  }

  // Fetch the page HTML
  const res = await fetch(source.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LucidVistaBot/1.0)" },
  });
  const html = await res.text();
  const truncatedHtml = html.slice(0, 30000);

  // Ask Gemini to extract article links
  let extractedLinks: { url: string; title: string }[] = [];
  try {
    const result = await geminiJson<{ articles: { url: string; title: string }[] }>(
      `Extract article links from this webpage HTML. Return ONLY actual article/news links, not navigation or footer links. Use absolute URLs. Base URL: ${source.url}\n\nHTML:\n${truncatedHtml}`,
      {
        type: "object",
        properties: {
          articles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
              },
              required: ["url", "title"],
            },
          },
        },
        required: ["articles"],
      },
      { temperature: 0.2, maxOutputTokens: 4096 }
    );
    extractedLinks = result.articles || [];
  } catch (err) {
    console.error("AI extraction failed:", err);
    await insertLog("error", "scraper", `AI link extraction failed for "${source.name}"`, String(err));
    return { saved: 0, skipped: 0 };
  }

  console.log(`🤖 AI found ${extractedLinks.length} article links from "${source.name}"`);

  // Process each article (limit to 15)
  for (const link of (extractedLinks as { url: string; title: string }[]).slice(0, 15)) {
    const slug = slugify(link.title || link.url.split("/").pop() || "article");
    if (await articleExistsBySlug(slug)) {
      skipped++;
      continue;
    }

    try {
      // Fetch article page
      const artRes = await fetch(link.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LucidVistaBot/1.0)" },
      });
      const artHtml = await artRes.text();
      const artTruncated = artHtml.slice(0, 40000);

      // Ask Gemini to extract structured article content
      let extracted: any;
      try {
        extracted = await geminiJson<any>(
          `Extract the main article content from this HTML page. Return structured data.\n\nHTML:\n${artTruncated}`,
          {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              image: { type: "string" },
              introduction: { type: "string" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["heading", "content"],
                },
              },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title", "introduction", "sections"],
          },
          { temperature: 0.2, maxOutputTokens: 8192 }
        );
      } catch (err) {
        console.error(`AI content extraction failed for ${link.url}:`, err);
        skipped++;
        continue;
      }

      const allText = [extracted.introduction, ...(extracted.sections || []).map((s: any) => s.content)].join(" ");

      const ok = await saveArticle({
        title: extracted.title || link.title,
        subtitle: extracted.subtitle || null,
        slug: slugify(extracted.title || link.title),
        category_id: source.category_id,
        source_id: source.id,
        date: today(),
        read_time: `${Math.max(1, Math.ceil(allText.split(/\s+/).length / 230))} min`,
        image: extracted.image || "",
        author_name: "Staff Writer",
        author_avatar: "",
        author_bio: "",
        introduction: extracted.introduction || null,
        sections: (extracted.sections || []).map((s: any) => ({
          heading: s.heading || "",
          content: s.content || "",
          image: null,
        })),
        tags: extracted.tags || [],
        old_article_id: null,
        published: false,
        ai_rewrite_status: "pending",
        ai_rewrite_count: 0,
        fb_status: "queued",
      });

      if (ok) {
        saved++;
        await notifySlack(extracted.title || link.title, source.name);
      }
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`AI scrape error for ${link.url}:`, err);
      skipped++;
    }
  }

  return { saved, skipped };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check: allow service_role (cron) or verify admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    // Decode JWT payload to check role claim (service_role bypasses admin check)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.role !== "service_role") {
        const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data: roleCheck } = await supabase.from("user_roles").select("id").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
        if (!roleCheck) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("🔄 Starting scrape job...");
    await insertLog("info", "scraper", "Scraper job started");

    // Check if a specific sourceId was passed
    let sourceId: string | null = null;
    try {
      const body = await req.json();
      sourceId = body?.sourceId || null;
    } catch {
      // No body — run all auto-scrape sources
    }

    // Fetch sources
    let query = supabase.from("scraper_sources").select("*");
    if (sourceId) {
      query = query.eq("id", sourceId);
    } else {
      query = query.eq("is_active", true).eq("auto_scrape", true);
    }

    const { data: sources, error: srcError } = await query;
    if (srcError || !sources) {
      console.error("Failed to fetch sources:", srcError?.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch scraper sources" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📋 Found ${sources.length} source(s) to process`);

    let totalSaved = 0;
    let totalSkipped = 0;

    for (const source of sources) {
      console.log(`\n🔍 Processing: "${source.name}" (${source.scraping_method})`);

      let result = { saved: 0, skipped: 0 };

      if (!source.category_id) {
        console.warn(`⚠️ No category_id for "${source.name}", skipping.`);
        continue;
      }

      try {
        switch (source.scraping_method) {
          case "legacy_theconversation":
            result = await scrapeLegacyTheConversation({
              id: source.id,
              url: source.url,
              category_id: source.category_id,
              name: source.name,
            });
            break;

          case "css":
            result = await scrapeCSSSource({
              id: source.id,
              url: source.url,
              category_id: source.category_id,
              name: source.name,
              selectors: source.selectors || {},
            });
            break;

          case "smart_ai":
            result = await scrapeSmartAI({
              id: source.id,
              url: source.url,
              category_id: source.category_id,
              name: source.name,
            });
            break;

          default:
            console.warn(`⚠️ Unknown scraping_method: ${source.scraping_method}`);
        }
      } catch (err) {
        console.error(`❌ Source "${source.name}" failed:`, err);
        await insertLog("error", "scraper", `Source "${source.name}" failed`, String(err));
      }

      // Update last_scraped_at
      await supabase
        .from("scraper_sources")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", source.id);

      totalSaved += result.saved;
      totalSkipped += result.skipped;
    }

    const response = {
      success: true,
      sources_processed: sources.length,
      saved: totalSaved,
      skipped: totalSkipped,
      timestamp: new Date().toISOString(),
    };

    console.log("✅ Done:", response);
    await insertLog(
      "info",
      "scraper",
      `Scraped ${totalSaved} new articles from ${sources.length} source(s), ${totalSkipped} skipped`
    );

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Scrape job failed:", err);
    await insertLog("error", "scraper", "Scraper job failed", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
