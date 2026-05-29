// Shared Gemini helper used by all backend AI functions.
// Reads GEMINI_API_KEY from server secrets and calls Google's Generative Language API.
// Never expose this key to the frontend.
// Integrated with Lobster Trap DPI for prompt injection detection.

import { lobsterTrapProxy } from "./lobstertrap.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const LOBSTER_TRAP_ENABLED = Deno.env.get("LOBSTER_TRAP_ENABLED") !== "false"; // Enabled by default

// Centralized model id so we can change it in one place later.
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

export class GeminiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ensureKey() {
  if (!GEMINI_API_KEY) {
    throw new GeminiError(
      "Gemini API key missing. Add GEMINI_API_KEY as a backend secret.",
      500,
      "missing_key"
    );
  }
}

function normalizeError(status: number, body: string): GeminiError {
  // Try to surface a clear, actionable message
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || body;
  } catch { /* ignore */ }

  if (status === 400 && /API key/i.test(detail)) {
    return new GeminiError(`Gemini rejected the API key: ${detail}`, 401, "invalid_key");
  }
  if (status === 401 || status === 403) {
    return new GeminiError(`Gemini authentication failed: ${detail}`, 401, "invalid_key");
  }
  if (status === 429) {
    // Check if this is a rate limit or quota exceeded
    const isQuotaExhausted = detail.toLowerCase().includes("quota") || 
                             detail.toLowerCase().includes("free_tier");
    
    return new GeminiError(
      isQuotaExhausted 
        ? `Gemini quota exceeded. Check Google AI Studio billing/quota for this API key. Falling back to AI/ML API. Detail: ${detail}`
        : `Gemini rate limited. Retrying or falling back to AI/ML API. Detail: ${detail}`,
      429,
      isQuotaExhausted ? "quota_exceeded" : "rate_limited"
    );
  }
  return new GeminiError(`Gemini API error ${status}: ${detail}`, 500, "api_error");
}

interface GeminiContent {
  parts: { text: string }[];
}

/**
 * Call Gemini for a plain text completion.
 * Returns the generated text (trimmed).
 * Integrated with Lobster Trap for prompt injection detection.
 */
export async function geminiText(
  prompt: string,
  opts?: { model?: string; maxOutputTokens?: number; temperature?: number; run_id?: string; agent_key?: string }
): Promise<string> {
  ensureKey();
  
  // Lobster Trap check
  if (LOBSTER_TRAP_ENABLED) {
    const trapResult = await lobsterTrapProxy(prompt, {
      run_id: opts?.run_id,
      agent_key: opts?.agent_key,
      model: opts?.model || GEMINI_TEXT_MODEL,
    });
    
    if (!trapResult.safe) {
      throw new GeminiError(
        `Prompt blocked by Lobster Trap (${trapResult.severity}): ${trapResult.threats[0]}`,
        403,
        "prompt_injection_detected"
      );
    }
  }
  
  const model = opts?.model || GEMINI_TEXT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts?.temperature ?? 0.8,
        maxOutputTokens: opts?.maxOutputTokens ?? 1024,
      },
    }),
  });

  if (!res.ok) throw normalizeError(res.status, await res.text());
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: GeminiContent["parts"] | undefined = candidate?.content?.parts;
  const text = (parts || []).map((p) => p.text || "").join("").trim();
  if (!text) {
    throw new GeminiError("Empty response from Gemini.", 500, "empty_response");
  }
  return text;
}

/**
 * Call Gemini and force a structured JSON response that matches the given schema.
 * Returns the parsed object.
 *
 * `schema` follows the Gemini responseSchema format (a JSON Schema subset).
 * Integrated with Lobster Trap for prompt injection detection.
 */
export async function geminiJson<T = any>(
  prompt: string,
  schema: Record<string, any>,
  opts?: { model?: string; maxOutputTokens?: number; temperature?: number; retries?: number; run_id?: string; agent_key?: string }
): Promise<T> {
  ensureKey();
  
  // Lobster Trap check
  if (LOBSTER_TRAP_ENABLED) {
    const trapResult = await lobsterTrapProxy(prompt, {
      run_id: opts?.run_id,
      agent_key: opts?.agent_key,
      model: opts?.model || GEMINI_TEXT_MODEL,
    });
    
    if (!trapResult.safe) {
      throw new GeminiError(
        `Prompt blocked by Lobster Trap (${trapResult.severity}): ${trapResult.threats[0]}`,
        403,
        "prompt_injection_detected"
      );
    }
  }
  
  const model = opts?.model || GEMINI_TEXT_MODEL;
  const maxRetries = opts?.retries ?? 2;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: opts?.temperature ?? 0.7,
            maxOutputTokens: opts?.maxOutputTokens ?? 8192,
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      });

      if (!res.ok) throw normalizeError(res.status, await res.text());
      const data = await res.json();
      
      // Check for finish_reason indicating truncation
      const candidate = data?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      
      if (finishReason === "MAX_TOKENS" || finishReason === "SAFETY") {
        console.warn(`[Gemini] Response truncated: ${finishReason}, attempt ${attempt + 1}/${maxRetries + 1}`);
        if (attempt < maxRetries) {
          // Retry with lower temperature for more concise output
          opts = { ...opts, temperature: (opts?.temperature ?? 0.7) * 0.8 };
          continue;
        }
      }
      
      const text = (candidate?.content?.parts || [])
        .map((p: any) => p.text || "")
        .join("")
        .trim();

      if (!text) throw new GeminiError("Empty JSON response from Gemini.", 500, "empty_response");

      try {
        return JSON.parse(text) as T;
      } catch (parseErr) {
        // Try to recover by extracting the first {...} or [...] block
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) {
          try { 
            const parsed = JSON.parse(match[0]) as T;
            console.warn(`[Gemini] Recovered partial JSON on attempt ${attempt + 1}`);
            return parsed;
          } catch { /* fallthrough */ }
        }
        
        // If this is not the last attempt, retry
        if (attempt < maxRetries) {
          console.warn(`[Gemini] JSON parse failed, retrying (${attempt + 1}/${maxRetries + 1})`);
          lastError = new Error(`Parse error: ${text.slice(0, 200)}`);
          continue;
        }
        
        throw new GeminiError(`Gemini returned malformed JSON after ${maxRetries + 1} attempts: ${text.slice(0, 300)}`, 500, "bad_json");
      }
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries && !(err instanceof GeminiError && err.code === "invalid_key")) {
        console.warn(`[Gemini] Attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
      throw err;
    }
  }

  throw lastError || new GeminiError("All retry attempts failed", 500, "retry_exhausted");
}

export function hasGeminiKey(): boolean {
  return !!GEMINI_API_KEY;
}
