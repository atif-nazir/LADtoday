// Shared model configuration mapping and helper functions for agents.

// Available models (only those currently supported by Gemini API v1beta)
const AVAILABLE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

const DEFAULT_MODELS: Record<string, string> = {
  "scout": "gemini-2.5-flash",
  "intelligence": "gemini-2.5-flash",
  "trend-forecaster": "gemini-2.5-flash",
  "competitor-intel": "gemini-2.5-flash",
  "audience-listener": "gemini-2.5-flash",
  "news-wire": "gemini-2.5-flash",
  "research": "gemini-2.5-flash",
  "fact-checker": "gemini-2.5-flash",
  "bias-detector": "gemini-2.5-flash",
  "story-arc": "gemini-2.5-flash",
  "quote-extractor": "gemini-2.5-flash",
  "tone-calibrator": "gemini-2.5-flash",
  "localization": "gemini-2.5-flash",
  "headline-optimizer": "gemini-2.5-flash",
  "rewrite": "gemini-2.5-flash",
  "vision": "gemini-2.5-flash",
  "seo": "gemini-2.5-flash",
  "readability": "gemini-2.5-flash",
  "internal-linking": "gemini-2.5-flash",
  "schema-architect": "gemini-2.5-flash",
  "excerpt": "gemini-2.5-flash",
  "creative": "gemini-2.5-flash",
  "infographic": "gemini-2.5-flash",
  "podcast-script": "gemini-2.5-flash",
  "video-script": "gemini-2.5-flash",
  "short-form": "gemini-2.5-flash",
  "thread": "gemini-2.5-flash",
  "carousel": "gemini-2.5-flash",
  "newsletter": "gemini-2.5-flash",
  "whatsapp-broadcast": "gemini-2.5-flash",
  "data-viz": "gemini-2.5-flash",
  "account-manager": "gemini-2.5-flash",
  "publish": "gemini-2.5-flash",
  "timing-intelligence": "gemini-2.5-flash",
  "hashtag-strategy": "gemini-2.5-flash",
  "cross-platform": "gemini-2.5-flash",
  "community": "gemini-2.5-flash",
  "influencer-radar": "gemini-2.5-flash",
  "performance-predictor": "gemini-2.5-flash",
  "syndication": "gemini-2.5-flash",
  "adsense-optimizer": "gemini-2.5-flash",
  "affiliate-detector": "gemini-2.5-flash",
  "lead-magnet": "gemini-2.5-flash",
  "content-calendar": "gemini-2.5-flash",
  "revenue-intelligence": "gemini-2.5-flash",
  "analytics": "gemini-2.5-flash",
  "guardian": "gemini-2.5-flash",
  "content-refresh": "gemini-2.5-flash",
  "brand-safety": "gemini-2.5-flash",
  "knowledge-base": "gemini-2.5-flash",
};

/**
 * Validate if a model is available in Gemini API
 */
function isModelAvailable(modelName: string): boolean {
  return AVAILABLE_MODELS.includes(modelName);
}

/**
 * Select the model to use for a given agent, respecting user overrides.
 * Validates that the model is available, falls back to default if not.
 *
 * @param agentKey The key of the agent (e.g. 'scout', 'intelligence')
 * @param modelOverride The model overrides dictionary from the run payload
 * @returns The resolved model name to invoke Gemini with
 */
export function selectModelForAgent(agentKey: string, modelOverride?: Record<string, string>): string {
  let selectedModel: string | undefined;
  
  if (modelOverride) {
    if (modelOverride[agentKey]) {
      selectedModel = modelOverride[agentKey];
    } else {
      const normalizedKey = agentKey.replace(/_/g, "-");
      if (modelOverride[normalizedKey]) {
        selectedModel = modelOverride[normalizedKey];
      } else {
        const underscoreKey = agentKey.replace(/-/g, "_");
        if (modelOverride[underscoreKey]) {
          selectedModel = modelOverride[underscoreKey];
        }
      }
    }
  }
  
  // If no override or override not found, use default
  if (!selectedModel) {
    const normalizedKey = agentKey.replace(/_/g, "-");
    selectedModel = DEFAULT_MODELS[agentKey] || DEFAULT_MODELS[normalizedKey] || "gemini-2.5-flash";
  }
  
  // Validate model is available
  if (!isModelAvailable(selectedModel)) {
    console.warn(`[Model Config] Model "${selectedModel}" not available for agent "${agentKey}", falling back to gemini-2.5-flash`);
    return "gemini-2.5-flash";
  }
  
  return selectedModel;
}

/**
 * Return model specifications or metadata if needed.
 */
export function getModelInfo(modelName: string) {
  return {
    name: modelName,
    isPro: modelName.endsWith("-pro"),
    available: isModelAvailable(modelName),
  };
}

/**
 * Get list of all available models
 */
export function getAvailableModels(): string[] {
  return [...AVAILABLE_MODELS];
}
