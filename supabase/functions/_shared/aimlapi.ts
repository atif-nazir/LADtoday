// ============================================================
// AI/ML API Integration Helper
// GPT-4o for deep reasoning and intelligence analysis
// ============================================================

const AIML_API_KEY = Deno.env.get("AIML_API_KEY") || "";

export function hasAIMLAPIKey(): boolean {
  return !!AIML_API_KEY;
}

export interface AIMLMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIMLOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

/**
 * Call AI/ML API for chat completion
 */
export async function aimlChat(
  messages: AIMLMessage[],
  options?: AIMLOptions
): Promise<string> {
  if (!AIML_API_KEY) {
    throw new Error("AIML_API_KEY not configured");
  }

  const model = options?.model || "gpt-4o";
  const temperature = options?.temperature ?? 0.7;
  const max_tokens = options?.max_tokens ?? 4096;

  try {
    const response = await fetch("https://api.aimlapi.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AIML_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        ...(options?.response_format && { response_format: options.response_format }),
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI/ML API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from AI/ML API");
    }

    return content.trim();
  } catch (err) {
    console.error("[AI/ML API] Error:", err);
    throw err;
  }
}

/**
 * Call AI/ML API for JSON response
 */
export async function aimlJson<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options?: Omit<AIMLOptions, "response_format">
): Promise<T> {
  const messages: AIMLMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await aimlChat(messages, {
    ...options,
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(response) as T;
  } catch (err) {
    console.error("[AI/ML API] Failed to parse JSON:", response.slice(0, 200));
    throw new Error(`AI/ML API returned invalid JSON: ${err}`);
  }
}

/**
 * Intelligence analysis using GPT-4o
 * Specialized for deep reasoning and contradiction detection
 */
export async function aimlIntelligenceAnalysis(
  topic: string,
  sources: any[],
  options?: {
    brand_voice?: string;
    language?: string;
  }
): Promise<any> {
  const systemPrompt = `You are a senior editorial analyst for LADtoday — Pakistan's leading AI-powered digital media platform.

Your specialty: Deep reasoning, contradiction detection, and intelligence synthesis.

You excel at:
- Detecting subtle contradictions between sources
- Identifying credibility signals
- Extracting key insights that others miss
- Providing actionable editorial recommendations

Output ONLY valid JSON. No markdown, no preamble.`;

  const sourcesText = sources.map((s, i) => 
    `[SOURCE ${i}] ${s.title}\nURL: ${s.url}\nCredibility: ${s.credibility_score || 0.5}\n${s.full_text || s.snippet || ""}`
  ).join("\n\n---\n\n");

  const userPrompt = `Topic: "${topic}"
Brand Voice: ${options?.brand_voice || "professional"}
Language: ${options?.language || "English"}

Analyze these ${sources.length} sources and produce intelligence:

${sourcesText}

Return JSON with:
{
  "key_insights": ["insight 1", "insight 2", ...], // 4-6 insights
  "contradictions": [
    {
      "claim_a": "...",
      "source_a": "...",
      "claim_b": "...",
      "source_b": "...",
      "severity": "minor|major",
      "resolution": "..."
    }
  ],
  "credibility_assessment": {
    "most_credible": "source name",
    "least_credible": "source name",
    "reasoning": "..."
  },
  "recommended_angle": "...",
  "angle_justification": "...",
  "pakistan_relevance": 0-10,
  "sentiment": "positive|negative|neutral|mixed"
}`;

  return await aimlJson(systemPrompt, userPrompt, {
    model: "gpt-4o",
    temperature: 0.6,
    max_tokens: 4096,
  });
}
