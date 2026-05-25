const API_BASE_URL = "http://localhost:8000";

export interface PipelineRequest {
  source_url: string;
  article_title: string;
  article_content: string;
  featured_image_url?: string;
  mock_mode?: boolean;
}

export interface PipelineRun {
  id: string;
  source_url: string;
  article_title: string;
  status: "pending" | "running" | "success" | "failed";
  started_at?: string;
  completed_at?: string;
  agent_results: Record<string, any>;
  error_message?: string;
  created_at: string;
}

export interface AgentExecution {
  id: string;
  pipeline_run_id: string;
  agent_name: string;
  status: "pending" | "running" | "success" | "failed";
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  error_message?: string;
  execution_time_ms: number;
  created_at: string;
}

export const pipelineAPI = {
  /**
   * Execute a new pipeline
   */
  async executePipeline(request: PipelineRequest): Promise<PipelineRun> {
    const response = await fetch(`${API_BASE_URL}/api/pipeline/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Pipeline execution failed");
    }

    return response.json();
  },

  /**
   * Get a pipeline run by ID
   */
  async getPipelineRun(runId: string): Promise<PipelineRun> {
    const response = await fetch(`${API_BASE_URL}/api/pipeline/${runId}`);

    if (!response.ok) {
      throw new Error("Failed to fetch pipeline run");
    }

    return response.json();
  },

  /**
   * Get all agent executions for a pipeline run
   */
  async getAgentExecutions(runId: string): Promise<AgentExecution[]> {
    const response = await fetch(`${API_BASE_URL}/api/pipeline/${runId}/agents`);

    if (!response.ok) {
      throw new Error("Failed to fetch agent executions");
    }

    return response.json();
  },

  /**
   * Check backend health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  },
};
