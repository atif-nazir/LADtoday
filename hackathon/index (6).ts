// supabase/functions/creative-agent/index.ts
// LADtoday Creative Agent — headlines, hooks, social snippets

import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const AIML_API_KEY = Deno.env.get("AIML_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { article, brief, seo } = await req.json();

  const prompt = `You are a world-class content strategist. Generate creative variants for this article.

Article headline: ${article.headline}
Topic summary: ${brief?.summary ?? ""}
Focus keyword: ${seo?.focus_keyword ?? ""}

Return ONLY valid JSON:
{
  "headlines": [
    {"variant": "Headline using question format?", "type": "question", "predicted_ctr": 0.08},
    {"variant": "7 Facts About X That Will Change How You Work", "type": "number", "predicted_ctr": 0.07},
    {"variant": "The Uncomfortable Truth About X", "type": "contrarian", "predicted_ctr": 0.09},
    {"variant": "How X Teams Are Solving Y in 2026", "type": "how-to", "predicted_ctr": 0.06}
  ],
  "hooks": [
    "Compelling first sentence variant 1 (under 25 words)",
    "Compelling first sentence variant 2 (under 25 words)"
  ],
  "cta_variants": [
    "Get the full analysis →",
    "See how teams are doing this →",
    "Read the complete breakdown"
  ],
  "social_snippets": {
    "twitter": "Tweet under 280 chars with hook + article link placeholder [URL]",
    "linkedin": "LinkedIn post 3-4 sentences. Professional insight framing. [URL]",
    "facebook": "Facebook post 2-3 sentences. Conversational. [URL]"
  },
  "email_subject_lines": [
    "Subject line 1 (under 50 chars)",
    "Subject line 2 (under 50 chars)"
  ]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 800 }
      })
    }
  );

  const data = await response.json();
  const raw = data.candidates[0].content.parts[0].text
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return new Response(JSON.parse(raw) ? raw : JSON.stringify({
      headlines: [{ variant: article.headline, type: "default", predicted_ctr: 0.05 }],
      hooks: [],
      cta_variants: ["Read more →"],
      social_snippets: { twitter: "", linkedin: "", facebook: "" },
      email_subject_lines: [article.headline?.slice(0, 50)]
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({
      headlines: [{ variant: article.headline ?? "Untitled", type: "default", predicted_ctr: 0.05 }],
      hooks: [],
      cta_variants: ["Read more →"],
      social_snippets: { twitter: "", linkedin: "", facebook: "" },
      email_subject_lines: []
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
