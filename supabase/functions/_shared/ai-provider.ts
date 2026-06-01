// ============================================================
// AI Provider Cascade: AIML API → Gemini → throw
// Auto-detects keys, no env flags needed
// ============================================================

import { aimlJson } from "./aimlapi.ts";
import { geminiJson } from "./gemini.ts";

const AIML_API_KEY = Deno.env.get("AIML_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

export type AIProvider = "aiml" | "gemini" | "auto";

/**
 * Cascade JSON call: AIML → Gemini → throw
 * Auto-detects available keys
 */
export async function aiJson<T = any>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, any>,
  opts?: {
    provider?: AIProvider;
    temperature?: number;
    maxTokens?: number;
    model?: string;
    run_id?: string;
    agent_key?: string;
  }
): Promise<{ result: T; provider: string }> {
  const provider = opts?.provider || "auto";
  
  // If specific provider requested, use only that
  if (provider === "aiml") {
    if (!AIML_API_KEY) throw new Error("AIML_API_KEY not configured");
    const result = await aimlJson<T>(systemPrompt, userPrompt, {
      temperature: opts?.temperature,
      max_tokens: opts?.maxTokens,
    });
    return { result, provider: "aiml" };
  }
  
  if (provider === "gemini") {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
    const result = await geminiJson<T>(userPrompt, schema, {
      model: opts?.model || "gemini-2.5-flash",
      temperature: opts?.temperature,
      maxOutputTokens: opts?.maxTokens,
      run_id: opts?.run_id,
      agent_key: opts?.agent_key,
    });
    return { result, provider: "gemini" };
  }
  
  // Auto cascade: AIML → Gemini → throw
  if (AIML_API_KEY) {
    try {
      const result = await aimlJson<T>(systemPrompt, userPrompt, {
        temperature: opts?.temperature,
        max_tokens: opts?.maxTokens,
      });
      return { result, provider: "aiml" };
    } catch (err) {
      console.warn(`[AI Provider] AIML failed, trying Gemini:`, err);
    }
  }
  
  if (GEMINI_API_KEY) {
    try {
      const result = await geminiJson<T>(userPrompt, schema, {
        model: opts?.model || "gemini-2.5-flash",
        temperature: opts?.temperature,
        maxOutputTokens: opts?.maxTokens,
        run_id: opts?.run_id,
        agent_key: opts?.agent_key,
      });
      return { result, provider: "gemini" };
    } catch (err) {
      console.error(`[AI Provider] Gemini failed:`, err);
      throw err;
    }
  }
  
  throw new Error("No AI provider available (AIML_API_KEY or GEMINI_API_KEY required)");
}

/**
 * Check which providers are available
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = ["auto"];
  if (AIML_API_KEY) providers.push("aiml");
  if (GEMINI_API_KEY) providers.push("gemini");
  return providers;
}
