-- ============================================================
-- Agent Memory Table — LADtoday 50-Agent Swarm
-- Enables: learning, calibration, performance tracking
-- All 50 agents read/write to this table to improve over time.
-- ============================================================
-- Each agent stores what it did and, after publishing,
-- the analytics agent backfills actual performance data.
-- The agents then read this historical data to adapt their
-- prompts, thresholds, and strategies in future runs.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_memory (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  agent_key                 TEXT NOT NULL,              -- e.g. "intelligence", "trend-forecaster"
  topic_category            TEXT DEFAULT 'general',     -- "fintech", "tech", "sports", etc.
  pipeline_run_id           UUID REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,

  -- Intelligence Agent
  angle_type                TEXT,                       -- "data-led|narrative|explainer|contrarian|investigative"
  virality_score            NUMERIC(4,1),               -- 1-10 predicted virality
  content_brief_style       TEXT,                       -- first 500 chars of the brief

  -- Trend Forecaster Agent
  predicted_momentum        NUMERIC(4,1),               -- 1-10 predicted trend momentum
  trajectory                TEXT,                       -- "rising|peaking|declining|stable"
  optimal_publish_recommended TEXT,                     -- "now|wait_24h|wait_48h"
  optimal_publish_correct   BOOLEAN,                    -- was timing prediction right? (backfilled)

  -- Competitor Intel Agent
  gap_type                  TEXT,                       -- "angle|depth|data|format|timing|audience"
  differentiator_used       TEXT,                       -- what differentiation approach was used
  opportunity_realized      BOOLEAN,                    -- did the gap exploitation work? (backfilled)

  -- Audience Listener Agent
  pain_point_used           TEXT,                       -- the dominant pain point targeted
  share_emotion             TEXT,                       -- emotion that was targeted for sharing
  platform_used             TEXT,                       -- primary distribution platform used

  -- News Wire Agent
  was_breaking_predicted    BOOLEAN,                    -- did the agent flag this as breaking?
  source_used               TEXT,                       -- primary source for breaking claim

  -- Performance Feedback (backfilled by Analytics Agent after publish)
  actual_views_week1        INTEGER,                    -- actual views in first week
  actual_fb_shares          INTEGER,                    -- actual Facebook shares
  actual_comments           INTEGER,                    -- actual comments
  avg_category_views        INTEGER,                    -- avg views for this topic category (context)

  -- Indexing columns
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Only service role can read/write agent_memory
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.agent_memory
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes for fast learning queries
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_key ON public.agent_memory(agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_topic_category ON public.agent_memory(topic_category);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_topic ON public.agent_memory(agent_key, topic_category);
CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON public.agent_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_virality ON public.agent_memory(virality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_agent_memory_actual_views ON public.agent_memory(actual_views_week1 DESC NULLS LAST);

-- ============================================================
-- Pipeline Runs Table — enhanced for 50-agent swarm
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Input
  topic             TEXT NOT NULL,
  input_type        TEXT DEFAULT 'topic',               -- "topic|url|text"
  input_payload     JSONB DEFAULT '{}',
  brand_voice       TEXT DEFAULT 'professional',
  language          TEXT DEFAULT 'english',
  mode              TEXT DEFAULT 'semi_auto',            -- "auto|semi_auto|manual"
  enabled_agents    TEXT[],                             -- null = all enabled

  -- Status
  status            TEXT DEFAULT 'pending',             -- "pending|running|completed|failed|cancelled"
  current_phase     TEXT DEFAULT 'DISCOVER',
  error             TEXT,
  cancel_reason     TEXT,

  -- Agent orchestration state
  -- JSONB map of: { "scout": { status, started_at, finished_at, ...metrics } }
  agent_states      JSONB DEFAULT '{}',

  -- Counters
  total_agents      INTEGER DEFAULT 50,

  -- Output
  article_url       TEXT,                               -- final published URL
  wp_post_id        INTEGER,                            -- WordPress post ID

  CONSTRAINT status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

-- RLS: Users can only see their own runs. Admins see all.
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_runs" ON public.pipeline_runs
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON public.pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON public.pipeline_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON public.pipeline_runs(created_at DESC);

-- ============================================================
-- Agent Outputs Table — stores each agent's full JSON output
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_outputs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  run_id          UUID NOT NULL REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  agent_key       TEXT NOT NULL,                        -- e.g. "scout", "intelligence"
  output          JSONB NOT NULL DEFAULT '{}',          -- the full agent output JSON
  tokens_used     INTEGER,
  duration_ms     INTEGER,
  status          TEXT DEFAULT 'completed',             -- "completed|failed"
  error           TEXT,

  UNIQUE (run_id, agent_key)                            -- one output per agent per run
);

ALTER TABLE public.agent_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.agent_outputs
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_agent_outputs_run_id ON public.agent_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_key ON public.agent_outputs(agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_run_agent ON public.agent_outputs(run_id, agent_key);

-- ============================================================
-- Lobster Trap Audit Table — security audit log for all Gemini calls
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lobstertrap_audit (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  run_id              UUID REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  agent_key           TEXT NOT NULL,
  prompt_preview      TEXT,                             -- first 200 chars of prompt
  injection_detected  BOOLEAN DEFAULT FALSE,
  pii_detected        BOOLEAN DEFAULT FALSE,
  risk_score          NUMERIC(4,2),                     -- 0.0 to 1.0
  action_taken        TEXT,                             -- "allowed|masked|blocked"
  verdict             TEXT,                             -- "approved|rejected"
  latency_ms          INTEGER,
  metadata            JSONB DEFAULT '{}'
);

ALTER TABLE public.lobstertrap_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.lobstertrap_audit
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_lobstertrap_run_id ON public.lobstertrap_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_lobstertrap_agent_key ON public.lobstertrap_audit(agent_key);
CREATE INDEX IF NOT EXISTS idx_lobstertrap_verdict ON public.lobstertrap_audit(verdict);

-- ============================================================
-- Agent Registry Table — admin control panel for all 50 agents
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_registry (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  key         TEXT UNIQUE NOT NULL,                     -- e.g. "scout", "intelligence"
  name        TEXT NOT NULL,                            -- human-readable name
  phase       TEXT NOT NULL,                            -- "DISCOVER|ANALYZE|CREATE|MULTIMEDIA|DISTRIBUTE|MONETIZE|OPERATE"
  agent_num   INTEGER,                                  -- 1-50
  model       TEXT DEFAULT 'gemini-2.5-flash',
  deps        TEXT[] DEFAULT '{}',                      -- dependent agent keys
  enabled     BOOLEAN DEFAULT TRUE,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON public.agent_registry
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "authenticated_read" ON public.agent_registry
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- Site Settings Table — for disable/enable agent list
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.site_settings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Admin Logs Table — operational observability
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  log_type    TEXT DEFAULT 'info',                      -- "info|warning|error|ai"
  source      TEXT,                                     -- agent key or function name
  event       TEXT,                                     -- event description
  detail      TEXT,                                     -- longer detail
  metadata    JSONB DEFAULT '{}'
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.admin_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_log_type ON public.admin_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_source ON public.admin_logs(source);

-- ============================================================
-- Seed Agent Registry with all 50 agents
-- ============================================================

INSERT INTO public.agent_registry (key, name, phase, agent_num, model, deps, description) VALUES
-- DISCOVER
('scout',           'Scout',               'DISCOVER',   1,  'gemini-2.5-flash', '{}',                                                          'Ingests topic/URL, finds 5+ credible sources, scores credibility + recency'),
('intelligence',    'Intelligence',        'DISCOVER',   2,  'gemini-2.5-pro',   '{"scout"}',                                                   'Extracts facts, detects contradictions, builds master content_brief'),
('trend-forecaster','Trend Forecaster',    'DISCOVER',   3,  'gemini-2.5-flash', '{"scout"}',                                                   'Predicts trend trajectory, optimal publish window, Pakistan-specific timing'),
('competitor-intel','Competitor Intel',    'DISCOVER',   4,  'gemini-2.5-flash', '{"scout"}',                                                   'Maps competitor coverage, finds content gaps, identifies differentiation'),
('audience-listener','Audience Listener',  'DISCOVER',   5,  'gemini-2.5-flash', '{"scout"}',                                                   'Profiles audience, identifies pain points, emotional hooks'),
('news-wire',       'News Wire',           'DISCOVER',   6,  'gemini-2.5-flash', '{"scout"}',                                                   'Monitors breaking news, generates instant briefs, ticker items'),
('research',        'Research',            'DISCOVER',   7,  'gemini-2.5-pro',   '{"intelligence"}',                                            'Finds authority sources, verifies facts, generates APA citations'),
-- ANALYZE
('fact-checker',    'Fact Checker',        'ANALYZE',    8,  'gemini-2.5-pro',   '{"research"}',                                                'Cross-references claims, flags misinformation, confidence scoring'),
('bias-detector',   'Bias Detector',       'ANALYZE',    9,  'gemini-2.5-pro',   '{"research"}',                                                'Detects framing bias, political slant, missing perspectives'),
('story-arc',       'Story Arc',           'ANALYZE',    10, 'gemini-2.5-pro',   '{"research","trend-forecaster","audience-listener"}',         'Selects article structure, builds narrative blueprint'),
('quote-extractor', 'Quote Extractor',     'ANALYZE',    11, 'gemini-2.5-flash', '{"scout","intelligence"}',                                    'Pulls pullquotes, expert statements for article embedding'),
('tone-calibrator', 'Tone Calibrator',     'ANALYZE',    12, 'gemini-2.5-pro',   '{"audience-listener"}',                                      'Adapts writing tone to audience segment'),
('localization',    'Localization',        'ANALYZE',    13, 'gemini-2.5-flash', '{"intelligence"}',                                            'Pakistan-specific localization, urdu terms, local context'),
('headline-optimizer','Headline Optimizer','ANALYZE',    14, 'gemini-2.5-flash', '{"story-arc","tone-calibrator","localization"}',              'Generates 5 headline variants with CTR predictions'),
-- CREATE
('rewrite',         'Rewrite',             'CREATE',     15, 'gemini-2.5-pro',   '{"fact-checker","bias-detector","story-arc","quote-extractor","tone-calibrator","localization","headline-optimizer"}', 'Writes full article HTML using all analysis outputs'),
('vision',          'Vision',              'CREATE',     16, 'gemini-2.5-pro',   '{"rewrite"}',                                                 'Designs featured image, OG image, alt text, captions'),
('seo',             'SEO',                 'CREATE',     17, 'gemini-2.5-flash', '{"rewrite"}',                                                 'Meta title, description, keyword density, internal link strategy'),
('readability',     'Readability',         'CREATE',     18, 'gemini-2.5-flash', '{"rewrite"}',                                                 'Flesch-Kincaid optimization, sentence simplification'),
('internal-linker', 'Internal Linker',     'CREATE',     19, 'gemini-2.5-flash', '{"rewrite"}',                                                 'Finds internal link opportunities from published articles'),
('schema-markup',   'Schema Markup',       'CREATE',     20, 'gemini-2.5-flash', '{"seo"}',                                                     'Generates JSON-LD schema for Article, FAQ, BreadcrumbList'),
('excerpt',         'Excerpt',             'CREATE',     21, 'gemini-2.5-flash', '{"rewrite","seo","schema-markup"}',                           'Creates social excerpts, OG descriptions, email preview text'),
-- MULTIMEDIA
('creative',        'Creative',            'MULTIMEDIA', 22, 'gemini-2.5-flash', '{"vision","excerpt"}',                                        'Facebook/Instagram visual content concepts'),
('infographic',     'Infographic',         'MULTIMEDIA', 23, 'gemini-2.5-pro',   '{"rewrite"}',                                                 'Data visualization design for key statistics'),
('podcast-script',  'Podcast Script',      'MULTIMEDIA', 24, 'gemini-2.5-flash', '{"rewrite"}',                                                 'Converts article to 5-minute podcast script'),
('video-script',    'Video Script',        'MULTIMEDIA', 25, 'gemini-2.5-flash', '{"rewrite","creative"}',                                      '60-second video script with shot list'),
('short-form',      'Short Form',          'MULTIMEDIA', 26, 'gemini-2.5-flash', '{"headline-optimizer","excerpt"}',                            'Twitter/Instagram caption, TikTok hooks'),
('thread',          'Thread',              'MULTIMEDIA', 27, 'gemini-2.5-flash', '{"rewrite","excerpt"}',                                       'Twitter/X thread 8-12 tweets with engagement hooks'),
('carousel',        'Carousel',            'MULTIMEDIA', 28, 'gemini-2.5-flash', '{"rewrite","creative"}',                                      '8-10 slide Instagram/LinkedIn carousel'),
('newsletter',      'Newsletter',          'MULTIMEDIA', 29, 'gemini-2.5-flash', '{"rewrite","excerpt","creative"}',                            'Email newsletter with subject line variants'),
('whatsapp-broadcast','WhatsApp Broadcast','MULTIMEDIA', 30, 'gemini-2.5-flash', '{"excerpt","short-form"}',                                    'WhatsApp-formatted broadcast message'),
('data-viz',        'Data Viz',            'MULTIMEDIA', 31, 'gemini-2.5-flash', '{"intelligence","infographic"}',                              'Chart/graph data specs from research statistics'),
-- DISTRIBUTE
('account-manager', 'Account Manager',     'DISTRIBUTE', 32, 'gemini-2.5-flash', '{"rewrite","excerpt"}',                                       'Routes content to correct Facebook pages'),
('publish',         'Publish',             'DISTRIBUTE', 33, 'gemini-2.5-flash', '{"account-manager"}',                                         'Publishes to WordPress, formats for SEO'),
('timing-intelligence','Timing Intelligence','DISTRIBUTE',34,'gemini-2.5-flash', '{"audience-listener","account-manager"}',                    'Schedules posts at peak audience times'),
('hashtag-strategy','Hashtag Strategy',    'DISTRIBUTE', 35, 'gemini-2.5-flash', '{"seo","short-form","thread"}',                               'Platform-specific hashtag sets'),
('cross-platform',  'Cross Platform',      'DISTRIBUTE', 36, 'gemini-2.5-flash', '{"rewrite","excerpt"}',                                       'Adapts content for each platform format'),
('community',       'Community',           'DISTRIBUTE', 37, 'gemini-2.5-flash', '{"rewrite","cross-platform"}',                                'Reddit/Quora/Facebook group content'),
('influencer-radar','Influencer Radar',    'DISTRIBUTE', 38, 'gemini-2.5-flash', '{"trend-forecaster","competitor-intel"}',                    'Identifies influencers, generates outreach templates'),
('performance-predictor','Performance Predictor','DISTRIBUTE',39,'gemini-2.5-flash','{"trend-forecaster","audience-listener","timing-intelligence"}','Pre-publish traffic forecast'),
('syndication',     'Syndication',         'DISTRIBUTE', 40, 'gemini-2.5-flash', '{"publish"}',                                                 'Medium, LinkedIn Articles, RSS, Google Discover packages'),
-- MONETIZE
('adsense-optimizer','AdSense Optimizer',  'MONETIZE',   41, 'gemini-2.5-flash', '{"seo","publish"}',                                           'CPM optimization, ad placement strategy'),
('affiliate-detector','Affiliate Detector','MONETIZE',   42, 'gemini-2.5-flash', '{"rewrite","seo"}',                                           'Natural affiliate link opportunities'),
('lead-magnet',     'Lead Magnet',         'MONETIZE',   43, 'gemini-2.5-flash', '{"rewrite","excerpt"}',                                       'Email opt-in lead magnet content'),
('content-calendar','Content Calendar',    'MONETIZE',   44, 'gemini-2.5-pro',   '{"trend-forecaster","competitor-intel","audience-listener"}', '30-day editorial calendar'),
('revenue-intelligence','Revenue Intelligence','MONETIZE',45,'gemini-2.5-flash', '{"adsense-optimizer","affiliate-detector","analytics"}',      'Revenue per content category analysis'),
-- OPERATE
('analytics',       'Analytics',           'OPERATE',    46, 'gemini-2.5-flash', '{"publish","syndication"}',                                   'Performance tracking, forecast vs actuals'),
('guardian',        'Guardian',            'OPERATE',    47, 'gemini-2.5-flash', '{"analytics"}',                                               'Security monitoring, Lobster Trap orchestration'),
('content-refresh', 'Content Refresh',     'OPERATE',    48, 'gemini-2.5-pro',   '{"analytics"}',                                               'Detects decaying content, rewrites outdated sections'),
('brand-safety',    'Brand Safety',        'OPERATE',    49, 'gemini-2.5-pro',   '{"rewrite","publish"}',                                       'Pre-publish defamation, legal, cultural sensitivity check'),
('knowledge-base',  'Knowledge Base',      'OPERATE',    50, 'gemini-2.5-pro',   '{"guardian"}',                                                'Builds searchable knowledge graph from all published content')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  phase = EXCLUDED.phase,
  agent_num = EXCLUDED.agent_num,
  model = EXCLUDED.model,
  deps = EXCLUDED.deps,
  description = EXCLUDED.description,
  updated_at = NOW();
