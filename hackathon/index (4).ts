// supabase/functions/seo-agent/index.ts
// LADtoday SEO Agent — uses Bright Data SERP API for real keyword research

import { corsHeaders } from "../_shared/cors.ts";

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// ─── Bright Data SERP for real keyword data ────────────────────────────────
async function getKeywordData(topic: string) {
  const response = await fetch(
    `https://api.brightdata.com/serp/google/search?q=${encodeURIComponent(topic)}&gl=pk&feature=paa,related_searches`,
    { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
  );
  const data = await response.json();
  return {
    paa: data.people_also_ask ?? [],
    related: data.related_searches ?? [],
    top_results: (data.organic ?? []).slice(0, 3).map((r: any) => ({
      title: r.title,
      snippet: r.snippet
    }))
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { article, topic } = await req.json();

  // Get real keyword data from Bright Data
  const keywordData = await getKeywordData(topic);

  // Extract keywords from article body
  const words = article.body.toLowerCase().split(/\W+/);
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to", "for", "of", "and", "or", "but"]);
  const freq: Record<string, number> = {};
  words.forEach((w: string) => {
    if (w.length > 4 && !stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  const topKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);

  // Generate meta tags with Gemini
  const prompt = `Generate SEO metadata for this article. Return ONLY valid JSON.

Article headline: ${article.headline}
Topic: ${topic}
Top keywords from article: ${topKeywords.join(", ")}
People Also Ask from Google: ${keywordData.paa.slice(0, 3).map((q: any) => q.question).join(" | ")}
Related searches: ${keywordData.related.slice(0, 5).map((r: any) => r.query).join(", ")}

Return this exact JSON:
{
  "meta_title": "SEO title under 60 characters",
  "meta_description": "Compelling description 140-160 chars with primary keyword",
  "focus_keyword": "single primary keyword phrase",
  "secondary_keywords": ["3-5 secondary keyword phrases"],
  "url_slug": "hyphenated-url-slug",
  "schema_type": "Article",
  "estimated_seo_score": 78,
  "suggested_headers": ["H2 suggestion 1", "H2 suggestion 2", "H2 suggestion 3"],
  "internal_link_anchors": ["2-3 anchor text suggestions"]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
      })
    }
  );

  const data = await response.json();
  const raw = data.candidates[0].content.parts[0].text
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let seoData: any = {};
  try {
    seoData = JSON.parse(raw);
  } catch {
    seoData = {
      meta_title: article.headline?.slice(0, 60) ?? topic,
      meta_description: topic,
      focus_keyword: topic,
      secondary_keywords: topKeywords.slice(0, 4),
      url_slug: topic.toLowerCase().replace(/\s+/g, "-"),
      estimated_seo_score: 65
    };
  }

  return new Response(JSON.stringify({
    ...seoData,
    seo_score: seoData.estimated_seo_score ?? 65,
    keyword_data: keywordData,
    extracted_keywords: topKeywords
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
