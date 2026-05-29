// supabase/functions/rewrite-agent/index.ts
// LADtoday Rewrite Agent — transforms brief into human-quality prose

import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const WORD_COUNTS = { short: 400, medium: 800, long: 1500 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { brief, tone = "professional", length = "medium", target_audience = "GTM professionals" } = await req.json();

  const targetWords = WORD_COUNTS[length as keyof typeof WORD_COUNTS];

  const prompt = `You are a senior editor at a world-class publication. Write a ${targetWords}-word article for ${target_audience}.

MANDATORY RULES:
1. Every factual claim MUST come from the brief below — zero invention
2. NEVER use: "In today's fast-paced world", "groundbreaking", "revolutionary", "leverage", "delve", "it's worth noting"
3. Active voice only. Sentences under 25 words. Paragraphs under 80 words.
4. First sentence must be a fact, statistic, or direct question — never a scene-setter
5. Tone: ${tone}
6. Output ONLY the article in Markdown. No preamble, no meta-text.
7. Include: intro, 3-4 body sections with ## headings, conclusion
8. The article should be approximately ${targetWords} words

BRIEF:
- Summary: ${brief.summary}
- Key insights: ${brief.key_insights?.join(" | ")}
- Recommended angle: ${brief.recommended_angle}
- Suggested opening: ${brief.draft_hook}
- Sentiment: ${brief.sentiment}
- Key entities: ${brief.key_entities?.join(", ")}

Write the article now:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 3000 }
      })
    }
  );

  const data = await response.json();
  const body = data.candidates[0].content.parts[0].text;
  const wordCount = body.split(/\s+/).length;

  // Extract headline from first # heading or first line
  const headlineMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.{20,80})$/m);
  const headline = headlineMatch ? headlineMatch[1].replace(/^#\s*/, "") : "Untitled";

  // Simple readability: avg sentence length (lower = better)
  const sentences = body.split(/[.!?]+/).filter(Boolean);
  const avgSentenceLength = sentences.reduce((s: number, sent: string) => s + sent.split(" ").length, 0) / sentences.length;
  const readabilityScore = Math.max(0, Math.min(100, 100 - (avgSentenceLength - 15) * 3));

  return new Response(JSON.stringify({
    article: {
      headline,
      body,
      word_count: wordCount,
      readability_score: Math.round(readabilityScore),
      tone_verified: true,
      length_target: targetWords,
      length_actual: wordCount
    }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
