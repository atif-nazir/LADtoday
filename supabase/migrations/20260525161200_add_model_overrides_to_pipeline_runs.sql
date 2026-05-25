-- Add model_overrides column to pipeline_runs table
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS model_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Update pro agents to use flash by default to support the free tier API
UPDATE public.agent_registry SET model = 'gemini-2.5-flash' WHERE model = 'gemini-2.5-pro';
