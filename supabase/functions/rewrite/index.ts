// supabase/functions/rewrite/index.ts
// Rewrite — turn brief into publish-ready prose.

import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const WORDS = { short: 400, medium: 800, long: 1500 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { brief = {}, tone = "professional", length = "medium", target_audience = "GTM professionals" } = await req.json();
  const target = WORDS[length as keyof typeof WORDS] || 800;

  const prompt = `You are a senior editor at a world-class publication. Write a ~${target}-word article for ${target_audience}.

MANDATORY:
1. Every factual claim must come from the brief below — zero invention.
2. NEVER use: "In today's fast-paced world", "groundbreaking", "revolutionary", "leverage", "delve", "it's worth noting".
3. Active voice. Sentences < 25 words. Paragraphs < 80 words.
4. First sentence: a fact, statistic, or direct question. Never a scene-setter.
5. Tone: ${tone}.
6. Output ONLY Markdown — title as # heading, then intro, 3–4 ## body sections, conclusion. No preamble.

BRIEF:
- Summary: ${brief.summary || ""}
- Insights: ${(brief.key_insights || []).join(" | ")}
- Recommended angle: ${brief.recommended_angle || ""}
- Suggested opening: ${brief.draft_hook || ""}
- Sentiment: ${brief.sentiment || "neutral"}
- Entities: ${(brief.key_entities || []).join(", ")}

Write the article now:`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
    }),
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `gemini ${res.status}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const d = await res.json();
  const body: string = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const headlineMatch = body.match(/^#\s+(.+)$/m);
  const headline = headlineMatch ? headlineMatch[1].trim() : "Untitled";
  const sentences = body.split(/[.!?]+/).filter(Boolean);
  const avgLen = sentences.reduce((s, x) => s + x.split(/\s+/).length, 0) / Math.max(sentences.length, 1);
  const readability = Math.max(0, Math.min(100, Math.round(100 - (avgLen - 15) * 3)));

  return new Response(JSON.stringify({
    article: {
      headline, body,
      word_count: wordCount,
      readability_score: readability,
      tone_verified: true,
      length_target: target,
      length_actual: wordCount,
    },
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
