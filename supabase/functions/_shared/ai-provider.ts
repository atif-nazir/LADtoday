// ============================================================
// Unified AI Provider with cascade fallback
// Featherless.ai → AIML API → Gemini → throw
// Each call passes through quota/missing-key errors to next provider.
// ============================================================

import { geminiJson, hasGeminiKey, GeminiError } from "./gemini.ts";
import { aimlJson, hasAIMLAPIKey } from "./aimlapi.ts";
import { canUse, track } from "./quota.ts";

const FEATHERLESS_API_KEY = Deno.env.get("FEATHERLESS_API_KEY") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

export type AIProvider = "auto" | "lovable" | "featherless" | "aimlapi" | "gemini";

export interface AIJsonOpts {
  prefer?: AIProvider;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;          // Gemini model (e.g. gemini-2.5-flash)
  aimlModel?: string;      // AIML model (default gpt-4o-mini)
  featherlessModel?: string; // Featherless model (default meta-llama/Meta-Llama-3.1-70B-Instruct)
  system?: string;         // Optional system prompt for AIML/Featherless
  retries?: number;
  run_id?: string;
  agent_key?: string;
}

function hasFeatherlessKey(): boolean {
  return !!FEATHERLESS_API_KEY;
}

async function featherlessJson<T = any>(
  systemPrompt: string,
  userPrompt: string,
  opts?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }
): Promise<T> {
  if (!FEATHERLESS_API_KEY) {
    throw new Error("FEATHERLESS_API_KEY not configured");
  }

  const model = opts?.model || "meta-llama/Meta-Llama-3.1-70B-Instruct";
  const temperature = opts?.temperature ?? 0.6;
  const max_tokens = opts?.max_tokens ?? 4096;

  try {
    const response = await fetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FEATHERLESS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Featherless API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("Featherless returned empty response");
    }

    return JSON.parse(content);
  } catch (err) {
    if (err instanceof Error && err.message.includes("JSON")) {
      throw new Error(`Featherless JSON parse error: ${err.message}`);
    }
    throw err;
  }
}

function isRetryable(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("429") ||
    msg.includes("missing") ||
    msg.includes("not configured") ||
    msg.includes("invalid_key") ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("fetch failed")
  );
}

/**
 * Strict JSON cascade. Tries Featherless → AIML → Gemini (or in order preferred).
 * Throws only if every provider fails.
 */
export async function aiJson<T = any>(
  prompt: string,
  schema: Record<string, any>,
  opts: AIJsonOpts = {}
): Promise<{ result: T; provider: "featherless" | "aimlapi" | "gemini"; attempts: string[] }> {
  const prefer = opts.prefer || "auto";
  const order: ("featherless" | "aimlapi" | "gemini")[] = [];

  if (prefer === "featherless") {
    if (hasFeatherlessKey()) order.push("featherless");
    if (hasAIMLAPIKey()) order.push("aimlapi");
    if (hasGeminiKey()) order.push("gemini");
  } else if (prefer === "aimlapi") {
    if (hasAIMLAPIKey()) order.push("aimlapi");
    if (hasFeatherlessKey()) order.push("featherless");
    if (hasGeminiKey()) order.push("gemini");
  } else if (prefer === "gemini") {
    if (hasGeminiKey()) order.push("gemini");
    if (hasFeatherlessKey()) order.push("featherless");
    if (hasAIMLAPIKey()) order.push("aimlapi");
  } else {
    // auto: Featherless first (free tier), then AIML, fallback to Gemini
    if (hasFeatherlessKey()) order.push("featherless");
    if (hasAIMLAPIKey()) order.push("aimlapi");
    if (hasGeminiKey()) order.push("gemini");
  }

  if (order.length === 0) {
    throw new Error("No AI provider configured. Set FEATHERLESS_API_KEY, AIML_API_KEY, or GEMINI_API_KEY.");
  }

  const attempts: string[] = [];
  let lastErr: any = null;

  for (const provider of order) {
    attempts.push(provider);
    try {
      if (provider === "featherless") {
        const system = opts.system ||
          "You are a JSON-only assistant. Output a single valid JSON object matching the requested schema. No prose, no markdown.";
        const schemaText = `\n\nSCHEMA (return JSON matching exactly):\n${JSON.stringify(schema)}`;
        const result = await featherlessJson<T>(system, prompt + schemaText, {
          model: opts.featherlessModel || "meta-llama/Meta-Llama-3.1-70B-Instruct",
          temperature: opts.temperature ?? 0.6,
          max_tokens: opts.maxOutputTokens ?? 4096,
        });
        return { result, provider, attempts };
      } else if (provider === "aimlapi") {
        const system = opts.system ||
          "You are a JSON-only assistant. Output a single valid JSON object matching the requested schema. No prose, no markdown.";
        const schemaText = `\n\nSCHEMA (return JSON matching exactly):\n${JSON.stringify(schema)}`;
        const result = await aimlJson<T>(system, prompt + schemaText, {
          model: opts.aimlModel || "gpt-4o-mini",
          temperature: opts.temperature ?? 0.6,
          max_tokens: opts.maxOutputTokens ?? 4096,
        });
        return { result, provider, attempts };
      } else {
        const result = await geminiJson<T>(prompt, schema, {
          model: opts.model,
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          retries: opts.retries ?? 1,
          run_id: opts.run_id,
          agent_key: opts.agent_key,
        });
        return { result, provider, attempts };
      }
    } catch (err) {
      lastErr = err;
      console.warn(`[ai-provider] ${provider} failed: ${String(err).slice(0, 200)}`);
      if (!isRetryable(err) && !(err instanceof GeminiError)) {
        // Non-retryable hard error — still try next provider as last resort
      }
      continue;
    }
  }
  throw new Error(`All AI providers failed (tried: ${attempts.join(", ")}). Last error: ${String(lastErr).slice(0, 300)}`);
}

export function describeProviders(): { featherless: boolean; aimlapi: boolean; gemini: boolean } {
  return { 
    featherless: hasFeatherlessKey(), 
    aimlapi: hasAIMLAPIKey(), 
    gemini: hasGeminiKey() 
  };
}
