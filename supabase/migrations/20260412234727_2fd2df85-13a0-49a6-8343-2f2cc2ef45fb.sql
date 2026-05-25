
-- Create facebook_pages table
CREATE TABLE public.facebook_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_name TEXT NOT NULL,
  page_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  thumbnail_theme TEXT NOT NULL DEFAULT 'pink',
  auto_post BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view facebook_pages" ON public.facebook_pages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert facebook_pages" ON public.facebook_pages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update facebook_pages" ON public.facebook_pages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete facebook_pages" ON public.facebook_pages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create article_fb_posts junction table
CREATE TABLE public.article_fb_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  fb_post_id TEXT,
  posted_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, page_id)
);

ALTER TABLE public.article_fb_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view article_fb_posts" ON public.article_fb_posts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert article_fb_posts" ON public.article_fb_posts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update article_fb_posts" ON public.article_fb_posts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete article_fb_posts" ON public.article_fb_posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Allow anon (edge functions) to read/write both tables
CREATE POLICY "Anon can select facebook_pages" ON public.facebook_pages FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert article_fb_posts" ON public.article_fb_posts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update article_fb_posts" ON public.article_fb_posts FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can select article_fb_posts" ON public.article_fb_posts FOR SELECT TO anon USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_facebook_pages_updated_at BEFORE UPDATE ON public.facebook_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_article_fb_posts_updated_at BEFORE UPDATE ON public.article_fb_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
