-- Lobster Trap DPI Proxy Audit Table
-- Logs all prompt injection detection attempts

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.lobstertrap_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  model TEXT,
  prompt_hash TEXT NOT NULL,
  injection_detected BOOLEAN DEFAULT false,
  threats TEXT[],
  severity TEXT,
  blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$ 
BEGIN
  -- Add model column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'lobstertrap_audit' 
                 AND column_name = 'model') THEN
    ALTER TABLE public.lobstertrap_audit ADD COLUMN model TEXT;
  END IF;
  
  -- Add blocked column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'lobstertrap_audit' 
                 AND column_name = 'blocked') THEN
    ALTER TABLE public.lobstertrap_audit ADD COLUMN blocked BOOLEAN DEFAULT false;
  END IF;
  
  -- Add severity column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'lobstertrap_audit' 
                 AND column_name = 'severity') THEN
    ALTER TABLE public.lobstertrap_audit ADD COLUMN severity TEXT;
  END IF;
END $$;

-- Add check constraint for severity (drop first if exists)
DO $$
BEGIN
  ALTER TABLE public.lobstertrap_audit DROP CONSTRAINT IF EXISTS lobstertrap_audit_severity_check;
  ALTER TABLE public.lobstertrap_audit ADD CONSTRAINT lobstertrap_audit_severity_check 
    CHECK (severity IN ('none', 'low', 'medium', 'high', 'critical'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes only if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lobstertrap_run') THEN
    CREATE INDEX idx_lobstertrap_run ON public.lobstertrap_audit(run_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lobstertrap_agent') THEN
    CREATE INDEX idx_lobstertrap_agent ON public.lobstertrap_audit(agent_key);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lobstertrap_blocked') THEN
    CREATE INDEX idx_lobstertrap_blocked ON public.lobstertrap_audit(blocked);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lobstertrap_severity') THEN
    CREATE INDEX idx_lobstertrap_severity ON public.lobstertrap_audit(severity);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lobstertrap_created') THEN
    CREATE INDEX idx_lobstertrap_created ON public.lobstertrap_audit(created_at DESC);
  END IF;
END $$;

ALTER TABLE public.lobstertrap_audit ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "service_role_lobstertrap" ON public.lobstertrap_audit;
DROP POLICY IF EXISTS "admins_read_lobstertrap" ON public.lobstertrap_audit;

-- Service role can write (edge functions)
CREATE POLICY "service_role_lobstertrap"
  ON public.lobstertrap_audit
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can read
CREATE POLICY "admins_read_lobstertrap"
  ON public.lobstertrap_audit
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add to realtime publication (ignore if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lobstertrap_audit;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.lobstertrap_audit IS 'Lobster Trap DPI proxy audit log - tracks all prompt injection detection attempts';
