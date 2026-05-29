// SEO — Bright Data SERP keyword + meta (Gemini fallback if no BD key)
import { corsHeaders } from "../_shared/cors.ts";
const BD = Deno.env.get("BRIGHTDATA_API_TOKEN") || "";
const GEMINI = Deno.env.get("GEMINI_API_KEY")!;

async function paa(q: string) {
  if (!BD) return { paa: [], related: [] };
  try {
    const r = await fetch(`https://api.brightdata.com/serp/google/search?q=${encodeURIComponent(q)}&gl=pk&feature=paa,related_searches`, { headers: { Authorization: `Bearer ${BD}` } });
    if (!r.ok) return { paa: [], related: [] };
    const d = await r.json();
    return { paa: d.people_also_ask ?? [], related: d.related_searches ?? [] };
  } catch { return { paa: [], related: [] }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { article = {}, topic } = await req.json();
  const kw = await paa(topic);

  const words = (article.body || "").toLowerCase().split(/\W+/);
  const stop = new Set(["the","a","an","is","are","was","were","in","on","at","to","for","of","and","or","but","that","this","with"]);
  const freq: Record<string, number> = {};
  for (const w of words) if (w.length > 4 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1;
  const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10).map(([k]) => k);

  const prompt = `Return ONLY JSON SEO metadata for this article.
Headline: ${article.headline}
Topic: ${topic}
Keywords: ${top.join(", ")}
PAA: ${(kw.paa.slice(0,3).map((q:any)=>q.question||q).join(" | "))}

JSON:
{"meta_title":"<=60 chars","meta_description":"140-160 chars","focus_keyword":"phrase","secondary_keywords":["a","b","c"],"url_slug":"kebab-case","schema_type":"Article","estimated_seo_score":78,"suggested_headers":["h2","h2","h2"],"internal_link_anchors":["a","b"]}`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: "application/json" } }),
  });
  const d = await r.json();
  let seo: any = {};
  try { seo = JSON.parse(d.candidates[0].content.parts[0].text); } catch { seo = { meta_title: article.headline?.slice(0,60), meta_description: topic, focus_keyword: topic, url_slug: String(topic).toLowerCase().replace(/\s+/g,"-"), estimated_seo_score: 65 }; }

  return new Response(JSON.stringify({ ...seo, seo_score: seo.estimated_seo_score ?? 65, keyword_data: kw, extracted_keywords: top }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
