// supabase/functions/vision-agent/index.ts
// LADtoday Vision Agent — image recommendations + ALT text

import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { article, topic } = await req.json();

  const prompt = `You are a visual content strategist. Recommend images for this article.

Article: ${article.headline}
Topic: ${topic}
Content summary: ${article.body?.slice(0, 500)}

Return ONLY valid JSON:
{
  "hero_image": {
    "query": "Unsplash search query for hero image",
    "alt_text": "SEO-optimized alt text under 125 chars",
    "caption": "Descriptive caption for the image"
  },
  "inline_images": [
    {
      "placement": "after intro paragraph",
      "query": "specific search query",
      "alt_text": "alt text",
      "caption": "caption"
    }
  ],
  "infographic_data": {
    "should_create": true,
    "type": "comparison|timeline|stats|flow",
    "data_points": ["key stat 1", "key stat 2", "key stat 3"]
  },
  "og_image_description": "Description for social media preview image"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
      })
    }
  );

  const data = await response.json();
  const raw = data.candidates[0].content.parts[0].text
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return new Response(raw, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({
      hero_image: {
        query: topic,
        alt_text: topic,
        caption: topic
      },
      inline_images: [],
      infographic_data: { should_create: false }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
