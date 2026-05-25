// ============================================================
// Model Selection & Configuration System
// Allows agents to use optimal models based on:
// - User's quota/tier (free vs paid)
// - Agent requirements (reasoning, speed, cost)
// - UI-configurable overrides
// ============================================================

/**
 * Available models optimized for free tier usage
 * Each model has: name, type, cost relative to Flash (1.0 = baseline)
 */
export const AVAILABLE_MODELS = {
  // Text models optimized for free tier
  "gemini-2.5-flash": {
    name: "Gemini 2.5 Flash",
    category: "text",
    costMultiplier: 1.0,
    rpm: 5,
    tpm: 250000,
    isFree: true,
    bestFor: ["discovery", "fast", "parallelizable"],
  },
  "gemini-2.5-flash-lite": {
    name: "Gemini 2.5 Flash Lite",
    category: "text",
    costMultiplier: 0.7,
    rpm: 10,
    tpm: 250000,
    isFree: true,
    bestFor: ["lightweight", "simple"],
  },
  "gemini-3.5-flash": {
    name: "Gemini 3.5 Flash",
    category: "text",
    costMultiplier: 1.0,
    rpm: 5,
    tpm: 250000,
    isFree: true,
    bestFor: ["balanced", "fast"],
  },
  "gemini-3.1-flash-lite": {
    name: "Gemini 3.1 Flash Lite",
    category: "text",
    costMultiplier: 0.8,
    rpm: 15,
    tpm: 250000,
    isFree: true,
    bestFor: ["discovery", "high-volume"],
  },
  "gemini-3-flash": {
    name: "Gemini 3 Flash",
    category: "text",
    costMultiplier: 0.9,
    rpm: 5,
    tpm: 250000,
    isFree: true,
    bestFor: ["balanced"],
  },
  // Pro models (limited or unavailable on free tier, but allow for testing)
  "gemini-2.5-pro": {
    name: "Gemini 2.5 Pro",
    category: "text",
    costMultiplier: 5.0,
    rpm: 0,
    tpm: 0,
    isFree: false,
    bestFor: ["reasoning", "accuracy", "complex"],
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

/**
 * Recommended model assignments by agent type
 * Based on free tier quotas and agent complexity
 */
export const AGENT_MODEL_DEFAULTS: Record<string, ModelId> = {
  // Phase 1: Discovery agents
  scout: "gemini-2.5-flash", // fast source fetching
  intelligence: "gemini-3.5-flash", // reasoning required, but use Flash instead of Pro for free tier
  "trend-forecaster": "gemini-2.5-flash-lite", // lightweight trend analysis
  "competitor-intel": "gemini-3.1-flash-lite", // high RPM for multiple competitor checks
  "audience-listener": "gemini-2.5-flash", // creative but not reasoning-heavy
  "news-wire": "gemini-2.5-flash-lite", // simple breaking news detection
  research: "gemini-3.5-flash", // fact matching, use Flash + simpler matching logic

  // Phase 2: Analysis agents (will be added)
  "fact-checker": "gemini-3.5-flash",
  "bias-detector": "gemini-3.5-flash",
  "story-arc": "gemini-3.5-flash",
  "quote-extractor": "gemini-2.5-flash",
  "tone-calibrator": "gemini-2.5-flash",
  localization: "gemini-2.5-flash",
  "headline-optimizer": "gemini-2.5-flash",

  // Phase 3: Creation agents (will be added)
  rewrite: "gemini-3.5-flash",
  vision: "gemini-3.5-flash",
  seo: "gemini-3.5-flash",
  "readability-optimizer": "gemini-2.5-flash",
  "internal-linking": "gemini-2.5-flash",
  "schema-architect": "gemini-3.5-flash",
  excerpt: "gemini-2.5-flash",
};

/**
 * Select the best model for an agent
 * Priority:
 * 1. UI override (user-configured in agent settings)
 * 2. Agent default (from AGENT_MODEL_DEFAULTS)
 * 3. Fallback (cheapest available)
 */
export function selectModelForAgent(
  agentKey: string,
  userOverride?: ModelId,
  availableModels?: ModelId[]
): ModelId {
  // User override takes priority
  if (userOverride && AVAILABLE_MODELS[userOverride]) {
    return userOverride;
  }

  // Use agent default
  const defaultModel = AGENT_MODEL_DEFAULTS[agentKey];
  if (defaultModel && AVAILABLE_MODELS[defaultModel]) {
    return defaultModel;
  }

  // Fallback: cheapest free-tier model
  const cheapest = (Object.entries(AVAILABLE_MODELS) as [ModelId, any][])
    .filter(([_, info]) => info.isFree)
    .sort(([_, a], [_, b]) => a.costMultiplier - b.costMultiplier)[0];

  return cheapest?.[0] || "gemini-2.5-flash";
}

/**
 * Get model info (cost, RPM, TPM limits)
 */
export function getModelInfo(modelId: ModelId) {
  return AVAILABLE_MODELS[modelId];
}

/**
 * Check if a model is available on free tier
 */
export function isModelAvailableOnFreeTier(modelId: ModelId): boolean {
  return AVAILABLE_MODELS[modelId]?.isFree === true;
}

/**
 * Estimate cost of using a model
 * Returns relative cost (1.0 = gemini-2.5-flash baseline)
 */
export function estimateRelativeCost(modelId: ModelId, estimatedTokens: number): number {
  const baselineCost = 1.0;
  const modelCost = AVAILABLE_MODELS[modelId]?.costMultiplier || 1.0;
  return (estimatedTokens / 1000) * modelCost;
}

/**
 * Get recommended fallback model if primary not available
 * Used when quota is exhausted
 */
export function getFallbackModel(primaryModel: ModelId): ModelId {
  const primaryInfo = AVAILABLE_MODELS[primaryModel];
  if (!primaryInfo) return "gemini-2.5-flash";

  // Try to find next best model with same category
  const candidates = (Object.entries(AVAILABLE_MODELS) as [ModelId, any][])
    .filter(([_, info]) => info.category === primaryInfo.category && info.isFree)
    .sort(([_, a], [_, b]) => a.costMultiplier - b.costMultiplier);

  return candidates[0]?.[0] || "gemini-2.5-flash";
}

/**
 * Format model info for UI display
 */
export function formatModelForUI(modelId: ModelId): {
  name: string;
  costPercentile: number;
  available: boolean;
  recommended: boolean;
} {
  const info = AVAILABLE_MODELS[modelId];
  if (!info) return { name: "Unknown", costPercentile: 50, available: false, recommended: false };

  const allCosts = Object.values(AVAILABLE_MODELS).map((m) => m.costMultiplier);
  const costPercentile = Math.round((info.costMultiplier / Math.max(...allCosts)) * 100);

  return {
    name: info.name,
    costPercentile,
    available: info.isFree || true, // assume Pro available if not free tier
    recommended: info.bestFor.length > 0,
  };
}

/**
 * Get all available models grouped by category
 */
export function getModelsByCategory(): Record<string, ModelId[]> {
  const grouped: Record<string, ModelId[]> = {};

  for (const [modelId, info] of Object.entries(AVAILABLE_MODELS) as [ModelId, any][]) {
    if (!grouped[info.category]) {
      grouped[info.category] = [];
    }
    grouped[info.category].push(modelId);
  }

  return grouped;
}
