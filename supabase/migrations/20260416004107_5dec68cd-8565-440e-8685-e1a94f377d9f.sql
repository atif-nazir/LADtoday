
-- 1. facebook_pages: Remove anon SELECT that exposes access tokens
DROP POLICY IF EXISTS "Anon can select facebook_pages" ON public.facebook_pages;

-- 2. admin_logs: Remove anon INSERT (edge functions use service role key, bypass RLS)
DROP POLICY IF EXISTS "Anon insert for edge functions" ON public.admin_logs;

-- 3. article_fb_posts: Remove all anon policies (edge functions use service role key)
DROP POLICY IF EXISTS "Anon can insert article_fb_posts" ON public.article_fb_posts;
DROP POLICY IF EXISTS "Anon can select article_fb_posts" ON public.article_fb_posts;
DROP POLICY IF EXISTS "Anon can update article_fb_posts" ON public.article_fb_posts;

-- 4. scraper_sources: Remove overly permissive anon full-access policy
DROP POLICY IF EXISTS "Service role full access scraper_sources" ON public.scraper_sources;

-- 5. Storage: Restrict thumbnail write/update/delete to admins only
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete thumbnails" ON storage.objects;

CREATE POLICY "Admins can upload thumbnails" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update thumbnails" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete thumbnails" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6. Fix function search_path on increment_view_count
CREATE OR REPLACE FUNCTION public.increment_view_count(article_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
BEGIN
  UPDATE articles
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = article_id;
END;
$function$;
