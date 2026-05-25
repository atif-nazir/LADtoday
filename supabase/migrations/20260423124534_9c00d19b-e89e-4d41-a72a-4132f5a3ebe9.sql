-- Junction table to link news sources to Facebook pages for auto-posting
CREATE TABLE IF NOT EXISTS public.scraper_source_fb_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.scraper_sources(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, page_id)
);

ALTER TABLE public.scraper_source_fb_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to source-page mapping"
ON public.scraper_source_fb_pages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));