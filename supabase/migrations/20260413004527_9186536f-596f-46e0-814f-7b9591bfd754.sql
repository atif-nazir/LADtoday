
-- Fix Facebook Table Policies (drop old granular ones, add unified)
DROP POLICY IF EXISTS "Admins can read facebook_pages" ON public.facebook_pages;
DROP POLICY IF EXISTS "Admins can insert facebook_pages" ON public.facebook_pages;
DROP POLICY IF EXISTS "Admins can update facebook_pages" ON public.facebook_pages;
DROP POLICY IF EXISTS "Admins can delete facebook_pages" ON public.facebook_pages;
DROP POLICY IF EXISTS "Admins can view facebook_pages" ON public.facebook_pages;
DROP POLICY IF EXISTS "Admins can manage facebook_pages" ON public.facebook_pages;

CREATE POLICY "Admins can manage facebook_pages" ON public.facebook_pages
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage article_fb_posts" ON public.article_fb_posts;
DROP POLICY IF EXISTS "Admins can delete article_fb_posts" ON public.article_fb_posts;
DROP POLICY IF EXISTS "Admins can insert article_fb_posts" ON public.article_fb_posts;
DROP POLICY IF EXISTS "Admins can update article_fb_posts" ON public.article_fb_posts;
DROP POLICY IF EXISTS "Admins can view article_fb_posts" ON public.article_fb_posts;

CREATE POLICY "Admins can manage article_fb_posts" ON public.article_fb_posts
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create Scraper Sources Table
CREATE TABLE IF NOT EXISTS public.scraper_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  thumbnail_theme TEXT DEFAULT 'pink',
  is_active BOOLEAN DEFAULT true,
  auto_scrape BOOLEAN DEFAULT false,
  scraping_method TEXT DEFAULT 'css',
  selectors JSONB DEFAULT '{}'::jsonb,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scraper_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scraper_sources" ON public.scraper_sources
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access scraper_sources" ON public.scraper_sources
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER update_scraper_sources_updated_at
BEFORE UPDATE ON public.scraper_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add source_id to articles for provenance tracking
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.scraper_sources(id) ON DELETE SET NULL;

-- Seed the initial scraper source
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
