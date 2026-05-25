
-- Add thumbnail_template column to scraper_sources
ALTER TABLE public.scraper_sources 
ADD COLUMN IF NOT EXISTS thumbnail_template TEXT DEFAULT 'classic';

-- Add thumbnail_template column to facebook_pages
ALTER TABLE public.facebook_pages 
ADD COLUMN IF NOT EXISTS thumbnail_template TEXT DEFAULT 'classic';

-- Add default_post_type to facebook_pages if missing
ALTER TABLE public.facebook_pages
ADD COLUMN IF NOT EXISTS default_post_type TEXT DEFAULT 'photo';
