// ============================================================
// Model Registry - Defines supported models per agent
// ============================================================

export interface ModelInfo {
  id: string;
  name: string;
  rpm?: number; // Requests per minute
  rpd?: number; // Requests per day
  tier: "free" | "paid";
  available: boolean; // Currently available in API
}

// All Gemini models
export const GEMINI_MODELS: Record<string, ModelInfo> = {
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    rpm: 20,
    tier: "free",
    available: true,
  },
  "gemini-3.5-flash": {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    rpm: 20,
    tier: "free",
    available: false, // Not yet released
  },
  "gemini-3-flash": {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    rpm: 20,
    tier: "free",
    available: false, // Not available in v1beta
  },
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    rpd: 500,
    tier: "free",
    available: false, // Not yet released
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    rpd: 500,
    tier: "free",
    available: false, // Not available in v1beta
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    rpm: 10,
    tier: "free",
    available: true,
  },
  "gemini-1.5-flash": {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    rpm: 15,
    tier: "free",
    available: true,
  },
  "gemini-1.5-pro": {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    rpm: 2,
    tier: "free",
    available: true,
  },
};

// Agent-specific model support
export const AGENT_MODELS: Record<string, string[]> = {
  scout: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  intelligence: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  rewrite: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  seo: [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ],
  vision: [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ],
  creative: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
  ],
  guardian: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  publish: [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ],
  analytics: [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ],
  "account-manager": [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ],
};

/**
 * Get supported models for an agent
 */
export function getSupportedModels(agentKey: string): ModelInfo[] {
  const modelIds = AGENT_MODELS[agentKey] || [];
  return modelIds
    .map(id => GEMINI_MODELS[id])
    .filter(m => m && m.available); // Only return available models
}

/**
 * Check if a model is supported for an agent
 */
export function isModelSupported(agentKey: string, modelId: string): boolean {
  const supported = AGENT_MODELS[agentKey] || [];
  const model = GEMINI_MODELS[modelId];
  return supported.includes(modelId) && model?.available === true;
}

/**
 * Get default model for an agent
 */
export function getDefaultModel(agentKey: string): string {
  const supported = getSupportedModels(agentKey);
  return supported[0]?.id || "gemini-2.5-flash";
}

/**
 * Get all available models (for UI)
 */
export function getAllAvailableModels(): ModelInfo[] {
  return Object.values(GEMINI_MODELS).filter(m => m.available);
}
