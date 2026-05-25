-- Add model_overrides column to pipeline_runs for model selection support
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS model_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
