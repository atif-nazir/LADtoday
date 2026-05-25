
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read site_settings" ON public.site_settings;
CREATE POLICY "Authenticated read site_settings" ON public.site_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage site_settings" ON public.site_settings;
CREATE POLICY "Admins manage site_settings" ON public.site_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, article_id TEXT, event_type TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  views_7d INT DEFAULT 0, views_30d INT DEFAULT 0,
  ga4_measurement_id TEXT, goals JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage analytics_events" ON public.analytics_events;
CREATE POLICY "Admins manage analytics_events" ON public.analytics_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ab_tests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, article_id TEXT, test_type TEXT,
  variant_a JSONB, variant_b JSONB,
  impressions_a INT DEFAULT 0, impressions_b INT DEFAULT 0,
  clicks_a INT DEFAULT 0, clicks_b INT DEFAULT 0,
  winner TEXT, confidence NUMERIC,
  status TEXT DEFAULT 'running',
  start_at TIMESTAMPTZ DEFAULT now(),
  concluded_at TIMESTAMPTZ
);
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage ab_tests" ON public.ab_tests;
CREATE POLICY "Admins manage ab_tests" ON public.ab_tests FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.engagement_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, article_id TEXT, platform TEXT,
  likes INT DEFAULT 0, shares INT DEFAULT 0, comments INT DEFAULT 0,
  engagement_score NUMERIC, engagement_grade TEXT, recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.engagement_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage engagement_reports" ON public.engagement_reports;
CREATE POLICY "Admins manage engagement_reports" ON public.engagement_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.article_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, article_id TEXT,
  viral_score NUMERIC, views_7d INT, views_30d INT,
  revenue_estimate_pkr NUMERIC, content_tier TEXT,
  boost_recommended BOOLEAN DEFAULT FALSE, boost_budget_pkr NUMERIC,
  predictions JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.article_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage article_predictions" ON public.article_predictions;
CREATE POLICY "Admins manage article_predictions" ON public.article_predictions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.influencer_registry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT, handle TEXT, platform TEXT,
  followers INT DEFAULT 0, engagement_rate NUMERIC DEFAULT 0,
  topics TEXT[] DEFAULT '{}', location TEXT DEFAULT 'Pakistan',
  email TEXT, active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.influencer_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage influencer_registry" ON public.influencer_registry;
CREATE POLICY "Admins manage influencer_registry" ON public.influencer_registry FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.influencer_outreach (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, article_url TEXT, influencer_name TEXT, platform TEXT,
  message TEXT, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.influencer_outreach ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage influencer_outreach" ON public.influencer_outreach;
CREATE POLICY "Admins manage influencer_outreach" ON public.influencer_outreach FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.content_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE UNIQUE, topic TEXT, status TEXT DEFAULT 'suggested',
  reason TEXT, article_id TEXT, article_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage content_calendar" ON public.content_calendar;
CREATE POLICY "Admins manage content_calendar" ON public.content_calendar FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.article_revenue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT UNIQUE, article_id TEXT,
  adsense_tier TEXT, estimated_cpm_usd NUMERIC,
  projected_revenue_30d_usd NUMERIC, projected_revenue_30d_pkr NUMERIC,
  affiliate_potential TEXT, revenue_grade TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.article_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage article_revenue" ON public.article_revenue;
CREATE POLICY "Admins manage article_revenue" ON public.article_revenue FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.hashtag_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hashtag TEXT, topic_category TEXT,
  times_used INT DEFAULT 1, total_impressions INT DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT now(), run_id TEXT,
  UNIQUE(hashtag, topic_category)
);
ALTER TABLE public.hashtag_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage hashtag_analytics" ON public.hashtag_analytics;
CREATE POLICY "Admins manage hashtag_analytics" ON public.hashtag_analytics FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pipeline_health (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  checked_at TIMESTAMPTZ, active_runs INT DEFAULT 0,
  healthy_runs INT DEFAULT 0, stuck_runs INT DEFAULT 0,
  failed_runs INT DEFAULT 0, pending_approval INT DEFAULT 0,
  overall_status TEXT DEFAULT 'green', alerts_count INT DEFAULT 0,
  report JSONB, auto_actions INT DEFAULT 0
);
ALTER TABLE public.pipeline_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage pipeline_health" ON public.pipeline_health;
CREATE POLICY "Admins manage pipeline_health" ON public.pipeline_health FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.system_health (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  checked_at TIMESTAMPTZ, overall_status TEXT DEFAULT 'healthy',
  uptime_pct INT DEFAULT 100, critical_down TEXT[] DEFAULT '{}',
  degraded TEXT[] DEFAULT '{}', checks JSONB, duration_ms INT DEFAULT 0
);
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage system_health" ON public.system_health;
CREATE POLICY "Admins manage system_health" ON public.system_health FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.cost_reports (
  id TEXT PRIMARY KEY, period TEXT, period_type TEXT,
  total_cost_usd NUMERIC DEFAULT 0, total_cost_pkr NUMERIC DEFAULT 0,
  total_runs INT DEFAULT 0, total_tokens INT DEFAULT 0,
  budget_used_pct INT DEFAULT 0, budget_status TEXT DEFAULT 'under_budget',
  report JSONB, generated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cost_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cost_reports" ON public.cost_reports;
CREATE POLICY "Admins manage cost_reports" ON public.cost_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.backups (
  id TEXT PRIMARY KEY, backup_date DATE, status TEXT,
  total_rows INT DEFAULT 0, total_bytes INT DEFAULT 0,
  tables_backed INT DEFAULT 0, tables_failed INT DEFAULT 0,
  pruned_count INT DEFAULT 0, manifest JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage backups" ON public.backups;
CREATE POLICY "Admins manage backups" ON public.backups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.cleanup_reports (
  id TEXT PRIMARY KEY, ran_at TIMESTAMPTZ, status TEXT,
  total_deleted INT DEFAULT 0, total_archived INT DEFAULT 0,
  space_freed TEXT, duration_ms INT DEFAULT 0, tasks JSONB
);
ALTER TABLE public.cleanup_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cleanup_reports" ON public.cleanup_reports;
CREATE POLICY "Admins manage cleanup_reports" ON public.cleanup_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pipeline_runs_archive (
  LIKE public.pipeline_runs INCLUDING DEFAULTS,
  archived_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pipeline_runs_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage pipeline_runs_archive" ON public.pipeline_runs_archive;
CREATE POLICY "Admins manage pipeline_runs_archive" ON public.pipeline_runs_archive FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.social_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, platform TEXT, content JSONB,
  scheduled_for TIMESTAMPTZ, status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage social_queue" ON public.social_queue;
CREATE POLICY "Admins manage social_queue" ON public.social_queue FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.newsletter_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, subject TEXT, html TEXT,
  status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.newsletter_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage newsletter_queue" ON public.newsletter_queue;
CREATE POLICY "Admins manage newsletter_queue" ON public.newsletter_queue FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, message TEXT, groups JSONB,
  status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage whatsapp_queue" ON public.whatsapp_queue;
CREATE POLICY "Admins manage whatsapp_queue" ON public.whatsapp_queue FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.syndication_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT, partner TEXT, content JSONB,
  status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.syndication_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage syndication_queue" ON public.syndication_queue;
CREATE POLICY "Admins manage syndication_queue" ON public.syndication_queue FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT, title TEXT, body TEXT, run_id TEXT,
  metadata JSONB, read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications" ON public.notifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS brief TEXT;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'semi_auto';
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS total_agents INT DEFAULT 50;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS hashtags_twitter TEXT[];
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS hashtags_facebook TEXT[];
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS hashtags_master TEXT[];
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS refresh_count INT DEFAULT 0;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS last_refreshed TIMESTAMPTZ;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_health; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.system_health; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
