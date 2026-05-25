// ============================================================
// Shared Agent Patterns & Utilities
// Used by all agents (Scout, Intelligence, Trend, Competitor, etc.)
// Eliminates code duplication across the agent swarm
// ============================================================

/**
 * Estimate tokens from text (rough approximation: 1 token ≈ 4 chars)
 * Used for context window tracking and truncation decisions
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Safely truncate text to a maximum token count
 * Appends notice if truncation occurs
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... content truncated for context window ...]";
}

/**
 * Format a topic category for memory bucketing & learning
 * Used by Intelligence, Trend, and other agents
 */
export function inferTopicCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/fintech|banking|sbp|secp|payment|wallet|loan|credit|cryptocurrency/.test(t)) return "fintech";
  if (/startup|tech|ai|software|app|digital|saas/.test(t)) return "tech";
  if (/cricket|psl|sport|football|hockey/.test(t)) return "sports";
  if (/election|politics|government|minister|parliament|senate/.test(t)) return "politics";
  if (/economy|gdp|inflation|rupee|dollar|trade|export|import/.test(t)) return "economy";
  if (/health|covid|hospital|medical|disease|virus/.test(t)) return "health";
  if (/education|university|school|degree|exam/.test(t)) return "education";
  if (/climate|environment|water|forest|pollution/.test(t)) return "environment";
  return "general";
}

/**
 * Format source material (from Scout or other agents) into structured context
 * Respects token limits and adds source attribution markers
 */
export interface SourceForContext {
  title?: string;
  source_domain?: string;
  full_text?: string;
  full_summary?: string;
  author?: string;
  publish_date?: string;
  credibility_score?: number;
  recency_score?: number;
  sentiment?: string;
  credibility_signals?: string[];
  key_facts?: string[];
}

export function buildSourceContext(sources: SourceForContext[], maxTokens: number = 12000): {
  context: string;
  sourceCount: number;
  totalTokens: number;
} {
  const parts: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    parts.push([
      `[SOURCE ${i + 1}: ${s.source_domain || "unknown"} | Credibility: ${((s.credibility_score || 0.5) * 10).toFixed(1)}/10 | Recency: ${((s.recency_score || 0.5) * 10).toFixed(1)}/10]`,
      `Title: ${s.title || "N/A"}`,
      `Author: ${s.author || "Unknown"} | Date: ${s.publish_date || "Unknown"}`,
      `Sentiment: ${s.sentiment || "neutral"} | Credibility signals: ${(s.credibility_signals || []).join("; ")}`,
      `Key Facts: ${(s.key_facts || []).join(" | ")}`,
      `Content: ${s.full_text || s.full_summary || ""}`,
      `---`,
    ].join("\n"));
  }

  const context = parts.join("\n\n");
  const truncated = truncateToTokenLimit(context, maxTokens);
  return { context: truncated, sourceCount: sources.length, totalTokens: estimateTokens(truncated) };
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 * Used in prompts that need current date context
 */
export function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Format a JSON object as a readable debugging string
 * Used for logging agent outputs
 */
export function formatAgentOutput(data: any, maxLength: number = 500): string {
  const str = JSON.stringify(data, null, 2);
  if (str.length > maxLength) {
    return str.slice(0, maxLength) + "\n... (truncated)";
  }
  return str;
}

/**
 * Validate that a Gemini API response contains expected fields
 * Throws if validation fails
 */
export function validateGeminiResponse(response: any, requiredFields: string[]): void {
  for (const field of requiredFields) {
    if (!(field in response)) {
      throw new Error(`Gemini response missing required field: "${field}"`);
    }
  }
}

/**
 * Score text credibility based on simple heuristics
 * Used by Scout and other agents evaluating sources
 * Returns 0–1 score
 */
export function scoreTextCredibility(text: string, domain: string): number {
  let score = 0.5; // baseline

  // Domain authority signals
  if (/\.edu$|\.gov$|\.org$/.test(domain)) score += 0.25;
  if (/news|times|post|tribune|guardian/.test(domain)) score += 0.15;

  // Text quality signals
  if (text.length > 800) score += 0.1; // substantial content
  if (/source|according to|reported by/.test(text)) score += 0.05; // attribution
  if (/data|statistic|research|study/.test(text)) score += 0.05; // evidence-based

  return Math.min(score, 1.0);
}

/**
 * Calculate recency score (1.0 = published today, 0.0 = >30 days old)
 * Returns 0–1 score
 */
export function scoreRecency(publishDateString: string): number {
  try {
    const publishDate = new Date(publishDateString);
    const now = new Date();
    const daysAgo = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysAgo < 0) return 0.5; // future date (invalid), give middle score
    if (daysAgo === 0) return 1.0;
    if (daysAgo <= 7) return 0.9;
    if (daysAgo <= 14) return 0.7;
    if (daysAgo <= 30) return 0.4;
    return Math.max(0.1, 1 - daysAgo / 100); // gradual decay
  } catch {
    return 0.5; // invalid date
  }
}

/**
 * Deduplicate sources by semantic similarity (simple hash-based)
 * Keeps higher-scored source, removes lower
 * Returns deduplicated list
 */
export function deduplicateSources<T extends { title?: string; credibility_score?: number }>(
  sources: T[],
  similarityThreshold: number = 0.85
): { deduplicated: T[]; removed: number } {
  const kept: T[] = [];
  const removed: T[] = [];

  for (const source of sources) {
    const isDuplicate = kept.some((k) => {
      const sim = computeStringSimplicity(k.title || "", source.title || "");
      if (sim > similarityThreshold) {
        // Keep the higher-scored one
        if ((k.credibility_score || 0) < (source.credibility_score || 0)) {
          // New source is better, replace
          kept.splice(kept.indexOf(k), 1);
          return false;
        }
        return true; // Existing source is better, skip new one
      }
      return false;
    });

    if (!isDuplicate) {
      kept.push(source);
    } else {
      removed.push(source);
    }
  }

  return { deduplicated: kept, removed: removed.length };
}

/**
 * Simple string similarity (Jaccard on word tokens)
 * Returns 0–1
 */
function computeStringSimplicity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

/**
 * Parse Pakistan time for scheduling
 * Converts UTC to PKT (UTC+5)
 */
export function toPKT(date: Date = new Date()): Date {
  const pktDate = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return pktDate;
}

/**
 * Check if a URL is valid and accessible (non-blocking check)
 * Returns true if domain is reachable
 */
export async function isUrlAccessible(url: string, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "LADtodayBot/1.0" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return res.ok || res.status === 405; // 405 = method not allowed (still accessible)
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL
 * "https://example.com/path" → "example.com"
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
