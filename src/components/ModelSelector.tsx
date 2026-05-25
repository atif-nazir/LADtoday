import React, { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Model configuration (mirrors supabase/functions/_shared/model-config.ts)
const AVAILABLE_MODELS = {
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
    costMultiplier: 0.5,
    rpm: 10,
    tpm: 250000,
    isFree: true,
    bestFor: ["lightweight", "high-volume", "cheap"],
  },
  "gemini-3.5-flash": {
    name: "Gemini 3.5 Flash",
    category: "text",
    costMultiplier: 1.2,
    rpm: 5,
    tpm: 250000,
    isFree: true,
    bestFor: ["reasoning", "structured", "analysis"],
  },
  "gemini-3.1-flash-lite": {
    name: "Gemini 3.1 Flash Lite",
    category: "text",
    costMultiplier: 0.6,
    rpm: 15,
    tpm: 250000,
    isFree: true,
    bestFor: ["high-rpm", "lightweight", "batch"],
  },
  "gemini-3-flash": {
    name: "Gemini 3 Flash",
    category: "text",
    costMultiplier: 1.0,
    rpm: 5,
    tpm: 250000,
    isFree: true,
    bestFor: ["discovery", "general"],
  },
};

const AGENT_MODEL_DEFAULTS = {
  scout: "gemini-2.5-flash",
  intelligence: "gemini-3.5-flash",
  "trend-forecaster": "gemini-2.5-flash-lite",
  "competitor-intel": "gemini-3.1-flash-lite",
  "audience-listener": "gemini-2.5-flash",
  "news-wire": "gemini-2.5-flash-lite",
  research: "gemini-3.5-flash",
  "fact-checker": "gemini-3.5-flash",
  "bias-detector": "gemini-3.5-flash",
  "story-arc": "gemini-3.5-flash",
};

const PHASE_1_AGENTS = [
  "scout",
  "intelligence",
  "trend-forecaster",
  "competitor-intel",
  "audience-listener",
  "news-wire",
  "research",
];

interface ModelSelectorProps {
  onModelOverridesChange?: (overrides: Record<string, string>) => void;
  compact?: boolean;
}

export function ModelSelector({ onModelOverridesChange, compact = false }: ModelSelectorProps) {
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const handleAgentModelChange = (agentKey: string, modelId: string) => {
    const newOverrides = { ...modelOverrides };
    if (modelId === AGENT_MODEL_DEFAULTS[agentKey as keyof typeof AGENT_MODEL_DEFAULTS]) {
      delete newOverrides[agentKey];
    } else {
      newOverrides[agentKey] = modelId;
    }
    setModelOverrides(newOverrides);
    onModelOverridesChange?.(newOverrides);
  };

  const resetToDefaults = () => {
    setModelOverrides({});
    onModelOverridesChange?.({});
  };

  const sortedModels = useMemo(() => {
    return Object.entries(AVAILABLE_MODELS).sort((a, b) => {
      // Sort by RPM (descending), then cost multiplier (ascending)
      const rpmDiff = b[1].rpm - a[1].rpm;
      if (rpmDiff !== 0) return rpmDiff;
      return a[1].costMultiplier - b[1].costMultiplier;
    });
  }, []);

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Model Selection (Free Tier)</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            className="text-xs"
          >
            Reset to Defaults
          </Button>
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            💡 <strong>Recommended for Free Tier:</strong> Gemini 3.1 Flash Lite (15 RPM) or 2.5
            Flash Lite (10 RPM)
          </p>
          <p>
            ⚠️ <strong>Pro Models:</strong> Not available on free tier (0 RPM). Using Flash variants
            instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Configuration</CardTitle>
        <CardDescription>Select models for Phase 1 Discovery agents (free tier)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-blue-50 p-3 rounded">
            <div className="font-semibold text-blue-900">Free-Tier Models</div>
            <div className="text-blue-700">{sortedModels.length} available</div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="font-semibold text-green-900">Overrides Active</div>
            <div className="text-green-700">{Object.keys(modelOverrides).length}</div>
          </div>
        </div>

        {/* Model Recommendations */}
        <div className="bg-amber-50 border border-amber-200 rounded p-4">
          <div className="font-semibold text-amber-900 mb-2">⚡ Recommendations for Free Tier:</div>
          <ul className="space-y-1 text-sm text-amber-800">
            <li>
              <strong>High Volume Tasks:</strong> Gemini 3.1 Flash Lite (15 RPM) - Best for Scout,
              News Wire
            </li>
            <li>
              <strong>Reasoning Tasks:</strong> Gemini 3.5 Flash (5 RPM) - For Research, Analysis
            </li>
            <li>
              <strong>Cost Optimization:</strong> Gemini 2.5 Flash Lite (10 RPM) - Lightweight tasks
            </li>
          </ul>
        </div>

        {/* Agent Model Selectors */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Phase 1 Agents</h4>
            <Button variant="outline" size="sm" onClick={resetToDefaults}>
              Reset to Defaults
            </Button>
          </div>

          <div className="space-y-3">
            {PHASE_1_AGENTS.map((agentKey) => {
              const defaultModel = AGENT_MODEL_DEFAULTS[agentKey as keyof typeof AGENT_MODEL_DEFAULTS];
              const currentModel = modelOverrides[agentKey] || defaultModel;
              const isOverridden = modelOverrides[agentKey] !== undefined;

              return (
                <div key={agentKey} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                  <div className="flex-1">
                    <div className="font-medium text-sm capitalize">
                      {agentKey.replace("-", " ")}
                      {isOverridden && <Badge variant="secondary" className="ml-2 text-xs">Override</Badge>}
                    </div>
                    <div className="text-xs text-gray-600">
                      Default: {AVAILABLE_MODELS[defaultModel as keyof typeof AVAILABLE_MODELS]?.name || defaultModel}
                    </div>
                  </div>

                  <Select value={currentModel} onValueChange={(model) => handleAgentModelChange(agentKey, model)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedModels.map(([modelId, model]) => (
                        <SelectItem key={modelId} value={modelId}>
                          <div className="flex items-center gap-2">
                            <span>{model.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {model.rpm} RPM
                            </Badge>
                            {model.rpm === 15 && <span className="text-amber-600">⭐</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Details Reference */}
        <details className="text-sm">
          <summary className="font-semibold cursor-pointer text-gray-700">Model Specifications</summary>
          <div className="mt-3 space-y-2 text-xs text-gray-600">
            {sortedModels.map(([modelId, model]) => (
              <div key={modelId} className="grid grid-cols-3 gap-2 p-2 bg-gray-50 rounded">
                <div>
                  <strong>{model.name}</strong>
                </div>
                <div>RPM: {model.rpm} | Cost: {(model.costMultiplier * 100).toFixed(0)}% of Flash</div>
                <div className="text-right">{model.bestFor.join(", ")}</div>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
