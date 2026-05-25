
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS fb_posted boolean DEFAULT false;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS fb_posted_at timestamptz;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS fb_post_id text;

INSERT INTO public.settings (key, value) VALUES ('auto_fb_post_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value) VALUES ('auto_thumbnail_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
