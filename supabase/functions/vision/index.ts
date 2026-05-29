import { corsHeaders } from "../_shared/cors.ts";
const GEMINI = Deno.env.get("GEMINI_API_KEY")!;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { article = {}, topic } = await req.json();
  const prompt = `Return ONLY JSON image plan.
Article: ${article.headline}\nTopic: ${topic}\nSnippet: ${(article.body||"").slice(0,400)}

{"hero_image":{"query":"unsplash query","alt_text":"<=125 chars","caption":"..."},"inline_images":[{"placement":"after intro","query":"...","alt_text":"...","caption":"..."}],"infographic_data":{"should_create":true,"type":"stats","data_points":["a","b","c"]},"og_image_description":"..."}`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 600, responseMimeType: "application/json" } }),
  });
  const d = await r.json();
  let out: any = {};
  try { out = JSON.parse(d.candidates[0].content.parts[0].text); } catch { out = { hero_image: { query: topic, alt_text: topic, caption: topic }, inline_images: [], infographic_data: { should_create: false } }; }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
