// supabase/functions/intelligence-agent/index.ts
// LADtoday Intelligence Agent
// Uses: AI/ML API (GPT-4o) + Cognee (persistent memory) + contradiction detection

import { corsHeaders } from "../_shared/cors.ts";

const AIML_API_KEY = Deno.env.get("AIML_API_KEY")!;
const COGNEE_API_KEY = Deno.env.get("COGNEE_API_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!; // fallback

// ─── COGNEE: RECALL PAST PERFORMANCE ─────────────────────────────────────────
// LADtoday learns from every article — what angles, tones, topics performed best
async function recallFromCognee(topic: string): Promise<string> {
  try {
    const response = await fetch("https://api.cognee.ai/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COGNEE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `successful content angles and performance data for topic similar to: ${topic}`,
        query_type: "INSIGHTS",
        dataset_name: "ladtoday_performance"
      })
    });

    if (!response.ok) return "No prior performance data available.";
    const data = await response.json();

    if (!data.items?.length) return "No prior performance data available.";

    return data.items
      .slice(0, 3)
      .map((item: any) => item.text)
      .join("\n");
  } catch (err) {
    console.error("Cognee recall error:", err);
    return "No prior performance data available.";
  }
}

// ─── COGNEE: STORE NEW PERFORMANCE ───────────────────────────────────────────
export async function storeInCognee(article: {
  topic: string;
  angle: string;
  headline: string;
}, performance: {
  views: number;
  engagement_rate: number;
}) {
  try {
    await fetch("https://api.cognee.ai/v1/add", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COGNEE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: `Topic: ${article.topic} | Angle: ${article.angle} | Headline: "${article.headline}" | Views: ${performance.views} | Engagement: ${performance.engagement_rate}%`,
        dataset_name: "ladtoday_performance"
      })
    });
  } catch (err) {
    console.error("Cognee store error:", err);
  }
}

// ─── AI/ML API: DEEP ANALYSIS ─────────────────────────────────────────────────
// Uses GPT-4o via AI/ML API for richer multi-model reasoning
async function analyzeWithAIML(sources: any[], topic: string, mode: string, memoryContext: string) {
  const sourceSummaries = sources
    .map(s => `SOURCE [${s.sourceCredibility.toFixed(1)}★] ${s.title}\n${s.content.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  const systemPrompt = `You are the Intelligence Agent for LADtoday, a content intelligence platform.

Your role: Analyze ${sources.length} web sources and produce a structured brief for the ${mode.toUpperCase()} track.

Memory context from past successful articles:
${memoryContext}

OUTPUT RULES:
1. Output ONLY valid JSON — no markdown, no backticks, no preamble
2. Every insight must be traceable to a source
3. Flag contradictions (different sources saying opposite things)
4. Recommended angle should reference memory context if relevant

JSON Schema (output exactly this structure):
{
  "summary": "3-sentence executive summary",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "contradictions": [
    {
      "claim_a": "what source X says",
      "source_a": "url",
      "claim_b": "what source Y says",
      "source_b": "url",
      "resolution": "Source A is more recent/credible, prefer this claim"
    }
  ],
  "sentiment": "positive|negative|neutral|mixed",
  "recommended_angle": "specific framing recommendation with memory context if available",
  "key_entities": ["company1", "person1", "concept1"],
  "credibility_score": 85,
  "suggested_tone": "professional|conversational|editorial|urgent",
  "draft_hook": "single compelling first sentence for the article"
}`;

  const response = await fetch("https://api.aimlapi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${AIML_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `TOPIC: ${topic}\nMODE: ${mode}\n\nSOURCES:\n\n${sourceSummaries}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    console.error("AI/ML API error, falling back to Gemini:", await response.text());
    return analyzeWithGemini(sources, topic, mode, memoryContext);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content;

  try {
    return {
      brief: JSON.parse(raw),
      model_used: "aiml-gpt-4o",
      tokens_used: data.usage?.total_tokens ?? 0
    };
  } catch {
    return analyzeWithGemini(sources, topic, mode, memoryContext);
  }
}

// ─── GEMINI FALLBACK ──────────────────────────────────────────────────────────
async function analyzeWithGemini(sources: any[], topic: string, mode: string, memoryContext: string) {
  const sourceSummaries = sources
    .map(s => `${s.title}: ${s.content.slice(0, 1000)}`)
    .join("\n\n");

  const prompt = `Analyze these web sources about "${topic}" and return ONLY a JSON object with this exact structure:
{
  "summary": "3-sentence summary",
  "key_insights": ["4 key insights"],
  "contradictions": [],
  "sentiment": "neutral",
  "recommended_angle": "best angle based on sources",
  "key_entities": ["entities mentioned"],
  "credibility_score": 75,
  "suggested_tone": "professional",
  "draft_hook": "compelling opening sentence"
}

Sources:
${sourceSummaries}

Memory context: ${memoryContext}

Return ONLY the JSON object, no markdown.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
      })
    }
  );

  const data = await response.json();
  const raw = data.candidates[0].content.parts[0].text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return {
    brief: JSON.parse(raw),
    model_used: "gemini-2.0-flash",
    tokens_used: 0
  };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { sources, topic, mode = "gtm", recall_memory = true } = await req.json();

  if (!sources?.length) {
    return new Response(JSON.stringify({ error: "No sources provided" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Step 1: Recall relevant memory from Cognee
  let memoryContext = "No prior data.";
  let cogneeHits = 0;
  if (recall_memory) {
    console.log(`[Intelligence] Querying Cognee for memory on: ${topic}`);
    memoryContext = await recallFromCognee(topic);
    cogneeHits = memoryContext !== "No prior performance data available." ? 1 : 0;
    console.log(`[Intelligence] Cognee memory: ${memoryContext.slice(0, 100)}...`);
  }

  // Step 2: Deep analysis via AI/ML API
  console.log(`[Intelligence] AI/ML API analyzing ${sources.length} sources...`);
  const result = await analyzeWithAIML(sources, topic, mode, memoryContext);

  return new Response(JSON.stringify({
    ...result,
    metadata: {
      sources_analyzed: sources.length,
      cognee_memory_hits: cogneeHits,
      topic,
      mode
    }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
