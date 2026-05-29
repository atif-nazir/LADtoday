-- ============================================================
-- FIX: Add missing columns for 10-agent pipeline
-- Paste this entire file into Supabase SQL Editor → Run
-- ============================================================

-- 1. Add pipeline progress tracking columns (fixes the 500 error)
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS pipeline_progress  INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pipeline_message   TEXT         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS publish_results    JSONB        DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wordpress_url      TEXT,
  ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ;

-- 2. Fix account-manager key (was inserted with underscore, orchestrator uses hyphen)
UPDATE public.agent_registry
  SET key = 'account-manager'
  WHERE key = 'account_manager';

-- 3. Fix agent_registry phase values to match orchestrator DAG
--    (orchestrator uses uppercase: DISCOVER, CREATE, REVIEW, PUBLISH, OPERATE)
UPDATE public.agent_registry SET phase = 'DISCOVER'  WHERE key IN ('scout', 'intelligence');
UPDATE public.agent_registry SET phase = 'CREATE'    WHERE key IN ('rewrite', 'seo', 'vision', 'creative');
UPDATE public.agent_registry SET phase = 'REVIEW'    WHERE key = 'guardian';
UPDATE public.agent_registry SET phase = 'PUBLISH'   WHERE key = 'publish';
UPDATE public.agent_registry SET phase = 'OPERATE'   WHERE key IN ('analytics', 'account-manager');

-- 4. Ensure pipeline_runs is in realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pipeline_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_runs;
  END IF;
END $$;

-- 5. Create pipeline-inputs storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pipeline-inputs',
  'pipeline-inputs',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage RLS for pipeline-inputs (drop first to avoid conflicts)
DROP POLICY IF EXISTS "admin_insert_pipeline_inputs"  ON storage.objects;
DROP POLICY IF EXISTS "admin_read_pipeline_inputs"    ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_pipeline_inputs"  ON storage.objects;
DROP POLICY IF EXISTS "Admins upload pipeline inputs" ON storage.objects;
DROP POLICY IF EXISTS "Admins read pipeline inputs"   ON storage.objects;
DROP POLICY IF EXISTS "Admins delete pipeline inputs" ON storage.objects;

CREATE POLICY "Admins upload pipeline inputs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pipeline-inputs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins read pipeline inputs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pipeline-inputs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins delete pipeline inputs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pipeline-inputs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 7. agent_memory table (used by Intelligence + Analytics agents for Cognee fallback)
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key     TEXT        NOT NULL,
  topic_category TEXT       NOT NULL DEFAULT 'general',
  angle_type    TEXT        NOT NULL DEFAULT 'general',
  virality_score NUMERIC    DEFAULT 5,
  word_count    INTEGER     DEFAULT 0,
  section_count INTEGER     DEFAULT 0,
  quality_score NUMERIC     DEFAULT 7,
  actual_time_on_page INTEGER,
  content_brief_style TEXT  DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_key      ON public.agent_memory(agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON public.agent_memory(topic_category);
CREATE INDEX IF NOT EXISTS idx_agent_memory_virality ON public.agent_memory(virality_score DESC);

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_agent_memory" ON public.agent_memory;
CREATE POLICY "service_role_agent_memory"
  ON public.agent_memory FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admins_agent_memory" ON public.agent_memory;
CREATE POLICY "admins_agent_memory"
  ON public.agent_memory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 8. lobstertrap_audit — ensure verdict column exists (Guardian writes to it)
ALTER TABLE public.lobstertrap_audit
  ADD COLUMN IF NOT EXISTS verdict TEXT DEFAULT 'PASSED';

-- Done. Verify with:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'pipeline_runs' AND table_schema = 'public'
-- ORDER BY ordinal_position;
