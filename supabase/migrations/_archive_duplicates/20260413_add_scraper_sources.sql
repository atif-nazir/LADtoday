-- ==============================================================================
-- Scraper Sources multi-source management
-- ==============================================================================

-- 1. Create scraper_sources table
CREATE TABLE IF NOT EXISTS public.scraper_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  thumbnail_theme TEXT DEFAULT 'pink',
  is_active BOOLEAN DEFAULT true,
  auto_scrape BOOLEAN DEFAULT false,
  scraping_method TEXT DEFAULT 'css', -- 'css', 'smart_ai', or 'legacy_theconversation'
  selectors JSONB DEFAULT '{}'::jsonb,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scraper_sources ENABLE ROW LEVEL SECURITY;

-- 2. Admin-only access policies
CREATE POLICY "Admins can manage scraper_sources" ON public.scraper_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 3. Add updated_at trigger
CREATE TRIGGER update_scraper_sources_updated_at
  BEFORE UPDATE ON public.scraper_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Automatically insert the current legacy source so things don't break
DO $$
DECLARE
  v_talks_cat UUID;
BEGIN
  SELECT id INTO v_talks_cat FROM public.categories WHERE slug = 'talks' LIMIT 1;
  
  INSERT INTO public.scraper_sources (name, url, category_id, thumbnail_theme, is_active, auto_scrape, scraping_method, selectors)
  VALUES (
    'The Conversation (US)',
    'https://theconversation.com/us',
    v_talks_cat,
    'blue',
    true,
    true,
    'legacy_theconversation',
    '{}'::jsonb
  )
  ON CONFLICT DO NOTHING;
END $$;
