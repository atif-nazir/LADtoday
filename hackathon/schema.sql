-- LADtoday Supabase Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ARTICLES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  mode TEXT DEFAULT 'gtm',              -- gtm | finance | security
  headline TEXT,
  body TEXT,
  meta_description TEXT,
  url_slug TEXT,
  seo_score INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',          -- draft | running | published | quarantined | failed
  pipeline_status TEXT DEFAULT 'idle',  -- idle | discovering | analyzing | writing | optimizing | creating | compliance | publishing | tracking | completed | failed | quarantined
  pipeline_progress INTEGER DEFAULT 0,
  pipeline_message TEXT DEFAULT '',
  guardian_verdict TEXT,               -- APPROVED | FLAGGED | QUARANTINED
  audit_log JSONB,
  bright_data_sources JSONB,           -- array of sources with tool used
  social_snippets JSONB,
  publish_results JSONB,
  wordpress_url TEXT,
  brief JSONB,
  user_id UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- ── AGENT RUNS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  status TEXT DEFAULT 'running',        -- running | completed | failed
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  bright_data_calls INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ANALYTICS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles ON DELETE CASCADE,
  views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  engagement_rate NUMERIC DEFAULT 0,
  avg_time_on_page INTEGER DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  social_shares JSONB DEFAULT '{"facebook":0,"twitter":0,"linkedin":0}'::jsonb,
  estimated_revenue_pkr NUMERIC DEFAULT 0,
  projected_views INTEGER DEFAULT 0,
  seo_score INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  sources_count INTEGER DEFAULT 0,
  mode TEXT,
  seo_position INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── BRIGHT DATA USAGE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bright_data_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool TEXT NOT NULL,                  -- serp_api | web_unlocker | scraping_browser | scraper_api
  url TEXT,
  success BOOLEAN DEFAULT TRUE,
  response_time_ms INTEGER,
  credits_used NUMERIC DEFAULT 0,
  article_id UUID REFERENCES articles ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── REALTIME ENABLE ───────────────────────────────────────────────────────────
-- Enable real-time updates for live dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE articles;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE analytics;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (Edge Functions use service role)
CREATE POLICY "service_role_all_articles" ON articles FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_runs" ON agent_runs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_analytics" ON analytics FOR ALL TO service_role USING (true);

-- Users can read their own articles
CREATE POLICY "users_read_own_articles" ON articles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_insert_articles" ON articles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_article ON agent_runs(article_id);
CREATE INDEX IF NOT EXISTS idx_analytics_article ON analytics(article_id);
CREATE INDEX IF NOT EXISTS idx_bright_data_tool ON bright_data_usage(tool);

-- ── DEMO DATA ─────────────────────────────────────────────────────────────────
-- Insert sample analytics for dashboard demo
INSERT INTO articles (id, topic, headline, status, pipeline_status, pipeline_progress, seo_score, word_count, guardian_verdict, mode, published_at)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Pakistan fintech growth', 'Pakistan Fintech Sector Sees 47% YoY Growth as Mobile Payments Surge', 'published', 'completed', 100, 87, 1240, 'APPROVED', 'finance', NOW() - INTERVAL '2 days'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'AI adoption enterprise Pakistan', 'Enterprise AI Adoption in Pakistan: The Infrastructure Problem Nobody Talks About', 'published', 'completed', 100, 82, 980, 'APPROVED', 'gtm', NOW() - INTERVAL '1 day'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'SECP regulatory update 2026', 'SECP New Guidelines for Crypto Exchanges: What Operators Must Do by July 2026', 'published', 'completed', 100, 91, 1450, 'APPROVED', 'security', NOW() - INTERVAL '6 hours')
ON CONFLICT DO NOTHING;

INSERT INTO analytics (article_id, views, engagement_rate, estimated_revenue_pkr, projected_views, sources_count)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 4820, 8.3, 723, 8000, 6),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 2340, 6.1, 351, 5000, 5),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 710, 11.4, 107, 3000, 7)
ON CONFLICT DO NOTHING;
