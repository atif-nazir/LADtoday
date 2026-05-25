-- Add old_article_id to articles table (tracks external source ID to avoid duplicates)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS old_article_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_old_article_id ON public.articles(old_article_id);

-- Insert 'Talks' category
INSERT INTO public.categories (name, slug, description)
VALUES ('Talks', 'talks', 'Curated articles from expert conversations and academic insights')
ON CONFLICT (slug) DO NOTHING;

-- Allow service_role to insert articles (needed for edge function with service key)
CREATE POLICY IF NOT EXISTS "Service role can insert articles"
  ON public.articles FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role can select articles"
  ON public.articles FOR SELECT
  TO service_role
  USING (true);

-- Enable pg_cron and pg_net extensions (may already be enabled in your project)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule edge function every 30 minutes
-- Replace YOUR_PROJECT_REF with your actual Supabase project ref: rqzzuycvsrrafbxepjtn
-- Replace YOUR_SERVICE_ROLE_KEY with your actual service role key (from Supabase dashboard > Settings > API)
SELECT cron.schedule(
  'scrape-talks-articles',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rqzzuycvsrrafbxepjtn.supabase.co/functions/v1/scrape-articles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
