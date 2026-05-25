
-- Create admin_logs table for real log storage
CREATE TABLE public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error', 'ai', 'system')),
  source text NOT NULL DEFAULT 'system',
  message text NOT NULL,
  details text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast filtering
CREATE INDEX idx_admin_logs_timestamp ON public.admin_logs (timestamp DESC);
CREATE INDEX idx_admin_logs_level ON public.admin_logs (level);
CREATE INDEX idx_admin_logs_source ON public.admin_logs (source);

-- RLS
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Everyone can read logs (admin check done in app)
CREATE POLICY "Admins can view logs" ON public.admin_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role and edge functions insert logs
CREATE POLICY "Service can insert logs" ON public.admin_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow anon insert for edge functions (they use service role key)
CREATE POLICY "Anon insert for edge functions" ON public.admin_logs
  FOR INSERT TO anon
  WITH CHECK (true);

-- Admins can delete logs
CREATE POLICY "Admins can delete logs" ON public.admin_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for live log streaming
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_logs;
