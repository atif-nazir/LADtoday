-- ══════════════════════════════════════════════════════════════════════════
-- Facebook multi-page management + article posting junction table
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Create facebook_pages table
CREATE TABLE IF NOT EXISTS public.facebook_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_name TEXT NOT NULL,
  page_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  thumbnail_theme TEXT DEFAULT 'pink',
  auto_post BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

-- Admin-only access for facebook_pages
CREATE POLICY "Admins can read facebook_pages" ON public.facebook_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can insert facebook_pages" ON public.facebook_pages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can update facebook_pages" ON public.facebook_pages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can delete facebook_pages" ON public.facebook_pages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 2. Create article_fb_posts junction table (tracks which articles were posted to which pages)
CREATE TABLE IF NOT EXISTS public.article_fb_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued',  -- queued, auto_posted, manual_posted, failed
  fb_post_id TEXT,
  posted_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(article_id, page_id)
);

ALTER TABLE public.article_fb_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage article_fb_posts" ON public.article_fb_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 3. Add "News" category if it doesn't exist
INSERT INTO public.categories (name, slug)
VALUES ('News', 'news')
ON CONFLICT (name) DO NOTHING;

-- 4. Add updated_at trigger for facebook_pages
CREATE TRIGGER update_facebook_pages_updated_at
  BEFORE UPDATE ON public.facebook_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
