// ============================================================
// Unified AI Provider with cascade fallback
// AIML API (GPT-4o) → Gemini → throw
// Each call passes through quota/missing-key errors to next provider.
// ============================================================

import { geminiJson, hasGeminiKey, GeminiError } from "./gemini.ts";
import { aimlJson, hasAIMLAPIKey } from "./aimlapi.ts";

export type AIProvider = "auto" | "aimlapi" | "gemini";

export interface AIJsonOpts {
  prefer?: AIProvider;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;          // Gemini model (e.g. gemini-2.5-flash)
  aimlModel?: string;      // AIML model (default gpt-4o-mini)
  system?: string;         // Optional system prompt for AIML
  retries?: number;
  run_id?: string;
  agent_key?: string;
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
 * Strict JSON cascade. Tries AIML then Gemini (or in order preferred).
 * Throws only if every provider fails.
 */
export async function aiJson<T = any>(
  prompt: string,
  schema: Record<string, any>,
  opts: AIJsonOpts = {}
): Promise<{ result: T; provider: "aimlapi" | "gemini"; attempts: string[] }> {
  const prefer = opts.prefer || "auto";
  const order: ("aimlapi" | "gemini")[] = [];

  if (prefer === "aimlapi") {
    if (hasAIMLAPIKey()) order.push("aimlapi");
    if (hasGeminiKey()) order.push("gemini");
  } else if (prefer === "gemini") {
    if (hasGeminiKey()) order.push("gemini");
    if (hasAIMLAPIKey()) order.push("aimlapi");
  } else {
    // auto: AIML first (higher per-day quota typically), fallback to Gemini
    if (hasAIMLAPIKey()) order.push("aimlapi");
    if (hasGeminiKey()) order.push("gemini");
  }

  if (order.length === 0) {
    throw new Error("No AI provider configured. Set AIML_API_KEY or GEMINI_API_KEY.");
  }

  const attempts: string[] = [];
  let lastErr: any = null;

  for (const provider of order) {
    attempts.push(provider);
    try {
      if (provider === "aimlapi") {
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

export function describeProviders(): { aimlapi: boolean; gemini: boolean } {
  return { aimlapi: hasAIMLAPIKey(), gemini: hasGeminiKey() };
}
