// ============================================================
// Unified AI Provider with Intelligent Fallback
// Primary: Gemini | Fallback: AI/ML API (GPT-4o)
// ============================================================
// When Gemini hits quota (429), automatically falls back to AI/ML API
// Tracks provider usage for cost optimization and debugging
// Integrated with Lobster Trap for prompt injection detection

import { 
  geminiJson, 
  geminiText, 
  GeminiError,
  hasGeminiKey 
} from "./gemini.ts";

import { 
  aimlChat,
  aimlJson,
  hasAIMLAPIKey,
  AIMLMessage,
  AIMLOptions
} from "./aimlapi.ts";

export interface AIProviderResult<T = any> {
  provider: "gemini" | "aiml"; // Which provider was used
  success: boolean;
  data: T;
  error?: string;
  retried?: boolean; // Was fallback used?
  fallbackReason?: string; // Why we fell back
  model?: string;
  duration_ms: number;
}

export interface AIProviderOptions {
  preferredProvider?: "gemini" | "aiml" | "auto"; // Default: "auto" (try Gemini first)
  allowFallback?: boolean; // Default: true
  onFallback?: (reason: string, provider: string) => void; // Callback when fallback happens
  timeout_ms?: number;
  temperature?: number;
  max_tokens?: number;
}

// Track fallback statistics
let fallbackStats = {
  gemini_quota_exhausted: 0,
  fallback_to_aiml: 0,
  both_failed: 0,
};

/**
 * Unified text generation with fallback support
 */
export async function generateText(
  prompt: string,
  options?: AIProviderOptions
): Promise<AIProviderResult<string>> {
  const startTime = Date.now();
  const { 
    preferredProvider = "auto",
    allowFallback = true,
    onFallback
  } = options || {};

  // Determine primary provider
  const primaryProvider = preferredProvider === "auto" 
    ? (hasGeminiKey() ? "gemini" : "aiml")
    : preferredProvider;

  // Try primary provider first
  if (primaryProvider === "gemini" && hasGeminiKey()) {
    try {
      console.log("[AI Provider] Attempting Gemini for text generation");
      const text = await geminiText(prompt, {
        temperature: options?.temperature,
        maxOutputTokens: options?.max_tokens
      });
      
      return {
        provider: "gemini",
        success: true,
        data: text,
        model: "gemini-2.5-flash",
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      const error = err as GeminiError;
      
      // Check if it's a quota error
      if (error.code === "quota_exceeded") {
        console.warn("[AI Provider] Gemini quota exceeded, attempting fallback...");
        fallbackStats.gemini_quota_exhausted++;
        
        if (allowFallback && hasAIMLAPIKey()) {
          return fallbackToAIML(prompt, "Gemini quota exceeded", startTime, options);
        }
      }
      
      // For other errors, re-throw
      throw error;
    }
  }

  // If AI/ML is preferred or primary failed
  if (hasAIMLAPIKey()) {
    console.log("[AI Provider] Using AI/ML API for text generation");
    try {
      const response = await aimlChat(
        [{ role: "user", content: prompt }],
        {
          model: "gpt-4o",
          temperature: options?.temperature,
          max_tokens: options?.max_tokens
        }
      );
      
      return {
        provider: "aiml",
        success: true,
        data: response,
        model: "gpt-4o",
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      console.error("[AI Provider] AI/ML API failed:", err);
      throw err;
    }
  }

  throw new Error("No AI provider available (Gemini and AI/ML API both unavailable)");
}

/**
 * Unified JSON generation with fallback support
 */
export async function generateJSON<T = any>(
  prompt: string,
  schema: Record<string, any>,
  options?: AIProviderOptions
): Promise<AIProviderResult<T>> {
  const startTime = Date.now();
  const { 
    preferredProvider = "auto",
    allowFallback = true,
    onFallback
  } = options || {};

  // Determine primary provider
  const primaryProvider = preferredProvider === "auto" 
    ? (hasGeminiKey() ? "gemini" : "aiml")
    : preferredProvider;

  // Try primary provider first
  if (primaryProvider === "gemini" && hasGeminiKey()) {
    try {
      console.log("[AI Provider] Attempting Gemini for JSON generation");
      const data = await geminiJson<T>(prompt, schema, {
        temperature: options?.temperature,
        maxOutputTokens: options?.max_tokens
      });
      
      return {
        provider: "gemini",
        success: true,
        data,
        model: "gemini-2.5-flash",
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      const error = err as GeminiError;
      
      // Check if it's a quota error
      if (error.code === "quota_exceeded") {
        console.warn("[AI Provider] Gemini quota exceeded, attempting fallback to AI/ML API...");
        fallbackStats.gemini_quota_exhausted++;
        
        if (allowFallback && hasAIMLAPIKey()) {
          return fallbackToAIMLJSON<T>(
            prompt, 
            schema,
            "Gemini quota exceeded", 
            startTime, 
            options
          );
        }
        
        fallbackStats.both_failed++;
        throw new Error(`Gemini quota exceeded and fallback unavailable. ${error.message}`);
      }
      
      // For other errors, re-throw
      throw error;
    }
  }

  // If AI/ML is preferred or primary failed
  if (hasAIMLAPIKey()) {
    console.log("[AI Provider] Using AI/ML API for JSON generation");
    return fallbackToAIMLJSON<T>(
      prompt, 
      schema,
      "Using AI/ML API as primary provider", 
      startTime, 
      options
    );
  }

  throw new Error("No AI provider available (Gemini and AI/ML API both unavailable)");
}

/**
 * Internal: Fallback to AI/ML API for text generation
 */
async function fallbackToAIML(
  prompt: string,
  fallbackReason: string,
  startTime: number,
  options?: AIProviderOptions
): Promise<AIProviderResult<string>> {
  fallbackStats.fallback_to_aiml++;
  
  try {
    const response = await aimlChat(
      [{ role: "user", content: prompt }],
      {
        model: "gpt-4o",
        temperature: options?.temperature,
        max_tokens: options?.max_tokens
      }
    );
    
    console.log(`[AI Provider] Fallback to AI/ML successful. Reason: ${fallbackReason}`);
    options?.onFallback?.(fallbackReason, "aiml");
    
    return {
      provider: "aiml",
      success: true,
      data: response,
      model: "gpt-4o",
      retried: true,
      fallbackReason,
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    console.error(`[AI Provider] Fallback to AI/ML also failed:`, err);
    fallbackStats.both_failed++;
    throw err;
  }
}

/**
 * Internal: Fallback to AI/ML API for JSON generation
 */
async function fallbackToAIMLJSON<T>(
  prompt: string,
  schema: Record<string, any>,
  fallbackReason: string,
  startTime: number,
  options?: AIProviderOptions
): Promise<AIProviderResult<T>> {
  fallbackStats.fallback_to_aiml++;
  
  try {
    // Create schema description for AI/ML API
    const schemaStr = JSON.stringify(schema, null, 2);
    const enhancedPrompt = `${prompt}\n\nReturn ONLY valid JSON matching this schema:\n${schemaStr}`;
    
    const response = await aimlChat(
      [{ role: "user", content: enhancedPrompt }],
      {
        model: "gpt-4o",
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 8192,
        response_format: { type: "json_object" }
      }
    );
    
    const data = JSON.parse(response) as T;
    
    console.log(`[AI Provider] Fallback to AI/ML JSON successful. Reason: ${fallbackReason}`);
    options?.onFallback?.(fallbackReason, "aiml");
    
    return {
      provider: "aiml",
      success: true,
      data,
      model: "gpt-4o",
      retried: true,
      fallbackReason,
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    console.error(`[AI Provider] Fallback to AI/ML JSON also failed:`, err);
    fallbackStats.both_failed++;
    throw err;
  }
}

/**
 * Get fallback statistics for monitoring and cost optimization
 */
export function getFallbackStats() {
  return {
    ...fallbackStats,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset fallback statistics (useful for testing)
 */
export function resetFallbackStats() {
  fallbackStats = {
    gemini_quota_exhausted: 0,
    fallback_to_aiml: 0,
    both_failed: 0,
  };
}

/**
 * Check provider availability
 */
export function getAvailableProviders() {
  return {
    gemini: hasGeminiKey(),
    aiml: hasAIMLAPIKey(),
    fallbackEnabled: hasGeminiKey() && hasAIMLAPIKey(),
  };
}

/**
 * Health check for AI providers
 */
export async function healthCheckAIProviders(): Promise<{
  gemini: { available: boolean; configured: boolean };
  aiml: { available: boolean; configured: boolean };
}> {
  return {
    gemini: {
      available: hasGeminiKey(),
      configured: !!Deno.env.get("GEMINI_API_KEY"),
    },
    aiml: {
      available: hasAIMLAPIKey(),
      configured: !!Deno.env.get("AIML_API_KEY"),
    },
  };
}
