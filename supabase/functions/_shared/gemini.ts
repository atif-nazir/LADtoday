// Shared Gemini helper used by all backend AI functions.
// Reads GEMINI_API_KEY from server secrets and calls Google's Generative Language API.
// Never expose this key to the frontend.
// Supports dynamic model selection via model-config system.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// Centralized model id so we can change it in one place later.
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

// Track recent quota errors to trigger fallback
let recentQuotaErrors: { model: string; timestamp: number }[] = [];

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
    return new GeminiError(
      `Gemini quota exceeded. Check Google AI Studio billing/quota for this API key. Detail: ${detail}`,
      429,
      "quota_exceeded"
    );
  }
  return new GeminiError(`Gemini API error ${status}: ${detail}`, 500, "api_error");
}

/**
 * Check if a model recently hit quota and should trigger fallback
 */
export function shouldFallbackModel(model: string): boolean {
  const now = Date.now();
  const recent = recentQuotaErrors.filter(
    (e) => e.model === model && now - e.timestamp < 60000 // within last 60s
  );
  return recent.length >= 2; // fallback after 2 recent quota errors
}

/**
 * Record a quota error for fallback tracking
 */
export function recordQuotaError(model: string): void {
  recentQuotaErrors.push({ model, timestamp: Date.now() });
  // Trim old errors
  recentQuotaErrors = recentQuotaErrors.filter((e) => Date.now() - e.timestamp < 120000);
}

interface GeminiContent {
  parts: { text: string }[];
}

/**
 * Call Gemini for a plain text completion.
 * Returns the generated text (trimmed).
 */
export async function geminiText(
  prompt: string,
  opts?: { model?: string; maxOutputTokens?: number; temperature?: number }
): Promise<string> {
  ensureKey();
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
 */
export async function geminiJson<T = any>(
  prompt: string,
  schema: Record<string, any>,
  opts?: { model?: string; maxOutputTokens?: number; temperature?: number }
): Promise<T> {
  ensureKey();
  const model = opts?.model || GEMINI_TEXT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

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
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p.text || "")
    .join("")
    .trim();

  if (!text) throw new GeminiError("Empty JSON response from Gemini.", 500, "empty_response");

  try {
    return JSON.parse(text) as T;
  } catch {
    // Try to recover by extracting the first {...} or [...] block
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { /* fallthrough */ }
    }
    throw new GeminiError(`Gemini returned malformed JSON: ${text.slice(0, 300)}`, 500, "bad_json");
  }
}

export function hasGeminiKey(): boolean {
  return !!GEMINI_API_KEY;
}
