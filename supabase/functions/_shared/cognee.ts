// ============================================================
// Cognee Integration Helper
// Agent persistent memory - learns from every article
// ============================================================

const COGNEE_API_KEY = Deno.env.get("COGNEE_API_KEY") || "";
const COGNEE_BASE_URL = "https://api.cognee.ai/v1";

export function hasCogneeKey(): boolean {
  return !!COGNEE_API_KEY;
}

export interface CogneeMemory {
  text: string;
  dataset_name: string;
  metadata?: Record<string, any>;
}

export interface CogneeSearchResult {
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Store memory in Cognee
 */
export async function cogneeStore(memory: CogneeMemory): Promise<boolean> {
  if (!COGNEE_API_KEY) {
    console.warn("[Cognee] API key not configured, skipping memory storage");
    return false;
  }

  try {
    const response = await fetch(`${COGNEE_BASE_URL}/add`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COGNEE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(memory),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[Cognee] Store failed: ${response.status}`);
      return false;
    }

    console.log(`[Cognee] ✅ Stored memory in dataset: ${memory.dataset_name}`);
    return true;
  } catch (err) {
    console.error("[Cognee] Store error:", err);
    return false;
  }
}

/**
 * Search/recall memories from Cognee
 */
export async function cogneeRecall(
  query: string,
  dataset_name: string,
  options?: {
    query_type?: "INSIGHTS" | "SEARCH";
    limit?: number;
  }
): Promise<CogneeSearchResult[]> {
  if (!COGNEE_API_KEY) {
    console.warn("[Cognee] API key not configured, returning empty results");
    return [];
  }

  try {
    const response = await fetch(`${COGNEE_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COGNEE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        dataset_name,
        query_type: options?.query_type || "INSIGHTS",
        limit: options?.limit || 5,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[Cognee] Recall failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error("[Cognee] Recall error:", err);
    return [];
  }
}

/**
 * Store article performance for learning
 */
export async function cogneeStorePerformance(
  topic: string,
  angle: string,
  headline: string,
  performance: {
    views?: number;
    engagement_rate?: number;
    virality_score?: number;
    success?: boolean;
  }
): Promise<boolean> {
  const memory: CogneeMemory = {
    text: `Topic: ${topic} | Angle: ${angle} | Headline: ${headline} | Views: ${performance.views || 0} | Engagement: ${performance.engagement_rate || 0}% | Virality: ${performance.virality_score || 0}/10 | Success: ${performance.success ? "YES" : "NO"}`,
    dataset_name: "ladtoday_performance",
    metadata: {
      topic,
      angle,
      headline,
      ...performance,
      stored_at: new Date().toISOString(),
    },
  };

  return await cogneeStore(memory);
}

/**
 * Recall successful content patterns
 */
export async function cogneeRecallSuccessfulAngles(
  topic: string
): Promise<{
  successful_angles: string[];
  avg_virality: number;
  recommendations: string[];
}> {
  const results = await cogneeRecall(
    `successful content angles for ${topic}`,
    "ladtoday_performance",
    { query_type: "INSIGHTS", limit: 10 }
  );

  if (results.length === 0) {
    return {
      successful_angles: [],
      avg_virality: 0,
      recommendations: ["No historical data yet - this is a new topic area"],
    };
  }

  // Parse results to extract patterns
  const angles: string[] = [];
  let totalVirality = 0;
  let count = 0;

  results.forEach(r => {
    const angleMatch = r.text.match(/Angle: ([^|]+)/);
    const viralityMatch = r.text.match(/Virality: (\d+)/);
    
    if (angleMatch) angles.push(angleMatch[1].trim());
    if (viralityMatch) {
      totalVirality += parseInt(viralityMatch[1]);
      count++;
    }
  });

  const avgVirality = count > 0 ? totalVirality / count : 0;

  return {
    successful_angles: [...new Set(angles)].slice(0, 5),
    avg_virality: Math.round(avgVirality * 10) / 10,
    recommendations: [
      `Based on ${results.length} past articles, avg virality: ${avgVirality.toFixed(1)}/10`,
      angles.length > 0 ? `Top performing angles: ${angles.slice(0, 3).join(", ")}` : "No angle patterns yet",
    ],
  };
}

/**
 * Store intelligence insights for future reference
 */
export async function cogneeStoreIntelligence(
  topic: string,
  insights: string[],
  metadata?: Record<string, any>
): Promise<boolean> {
  const memory: CogneeMemory = {
    text: `Topic: ${topic}\n\nKey Insights:\n${insights.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`,
    dataset_name: "ladtoday_intelligence",
    metadata: {
      topic,
      insight_count: insights.length,
      stored_at: new Date().toISOString(),
      ...metadata,
    },
  };

  return await cogneeStore(memory);
}
