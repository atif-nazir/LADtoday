
-- Junction table to link news sources to Facebook pages for auto-posting
CREATE TABLE IF NOT EXISTS public.scraper_source_fb_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.scraper_sources(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, page_id)
);

-- Enable RLS
ALTER TABLE public.scraper_source_fb_pages ENABLE ROW LEVEL SECURITY;

-- Policy for admins to manage mapping
CREATE POLICY "Admins have full access to source-page mapping"
ON public.scraper_source_fb_pages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);
