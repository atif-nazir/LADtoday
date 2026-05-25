
-- Add rewrite tracking columns to articles
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_rewrite_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_rewrite_status text NOT NULL DEFAULT 'pending';

-- Create settings table for global config like auto-rewrite toggle
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow everyone to read settings, only admins to update
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings are viewable by everyone" ON public.settings FOR SELECT TO public USING (true);
CREATE POLICY "Admins can update settings" ON public.settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert settings" ON public.settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default auto_rewrite setting
INSERT INTO public.settings (key, value) VALUES ('auto_rewrite_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;
