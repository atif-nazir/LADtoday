-- =========================================================
-- Phase 0: 50-agent pipeline foundation
-- =========================================================

-- 1. pipeline_runs
CREATE TABLE public.pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  topic TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'topic',         -- topic|url|pdf|image|csv
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_voice TEXT NOT NULL DEFAULT 'professional',
  language TEXT NOT NULL DEFAULT 'english',
  status TEXT NOT NULL DEFAULT 'pending',           -- pending|running|completed|failed|cancelled
  current_phase TEXT,                                -- discover|analyze|create|multimedia|distribute|monetize|operate
  enabled_agents TEXT[] DEFAULT NULL,                -- NULL = use registry defaults
  agent_states JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { agent_key: { status, started_at, finished_at, tokens, error } }
  total_tokens INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  duration_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_runs_status ON public.pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_created ON public.pipeline_runs(created_at DESC);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pipeline_runs"
  ON public.pipeline_runs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pipeline_runs_updated_at
  BEFORE UPDATE ON public.pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. agent_outputs
CREATE TABLE public.agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',   -- completed|failed|skipped
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens INT NOT NULL DEFAULT 0,
  duration_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, agent_key)
);

CREATE INDEX idx_agent_outputs_run ON public.agent_outputs(run_id);

ALTER TABLE public.agent_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agent_outputs"
  ON public.agent_outputs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. lobstertrap_audit
CREATE TABLE public.lobstertrap_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  model TEXT,
  prompt_preview TEXT,
  prompt_tokens INT DEFAULT 0,
  response_tokens INT DEFAULT 0,
  injection_detected BOOLEAN DEFAULT FALSE,
  pii_detected BOOLEAN DEFAULT FALSE,
  pii_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  risk_score NUMERIC(4,2) DEFAULT 0,
  action_taken TEXT,    -- ALLOW|DENY|LOG|QUARANTINE|RATE_LIMIT
  verdict TEXT,         -- APPROVED|BLOCKED|REVIEW
  latency_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lobstertrap_run ON public.lobstertrap_audit(run_id, created_at);
CREATE INDEX idx_lobstertrap_created ON public.lobstertrap_audit(created_at DESC);

ALTER TABLE public.lobstertrap_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lobstertrap_audit"
  ON public.lobstertrap_audit FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. agent_registry
CREATE TABLE public.agent_registry (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phase TEXT NOT NULL,                       -- discover|analyze|create|multimedia|distribute|monetize|operate
  order_index INT NOT NULL,
  depends_on TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read agent_registry"
  ON public.agent_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage agent_registry"
  ON public.agent_registry FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER agent_registry_updated_at
  BEFORE UPDATE ON public.agent_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Seed all 50 agents (enabled=false; flipped on per phase)
INSERT INTO public.agent_registry (key, name, phase, order_index, depends_on, model, description) VALUES
-- Phase 1: DISCOVER (01-07)
('scout',              'Scout',                'discover',   1,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Ingest topic/URL/PDF/image, return sources'),
('intelligence',       'Intelligence',         'discover',   2,  ARRAY['scout'],                                   'gemini-2.5-pro',   'Synthesize sources, detect contradictions, write brief'),
('trend_forecaster',   'Trend Forecaster',     'discover',   3,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Predict topic momentum from search/social signals'),
('competitor_intel',   'Competitor Intel',     'discover',   4,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Scan competing publishers for coverage gaps'),
('audience_listener',  'Audience Listener',    'discover',   5,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Mine community signals for reader interest'),
('news_wire',          'News Wire',            'discover',   6,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Pull breaking-news context for the topic'),
('research',           'Research',             'discover',   7,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Deep background research, cite primary sources'),
-- Phase 2: ANALYZE (08-14)
('fact_checker',       'Fact Checker',         'analyze',    8,  ARRAY['scout','intelligence'],                    'gemini-2.5-pro',   'Verify each claim against sources'),
('bias_detector',      'Bias Detector',        'analyze',    9,  ARRAY['intelligence'],                            'gemini-2.5-flash', 'Score political/commercial bias in sources'),
('story_arc',          'Story Arc',            'analyze',   10,  ARRAY['intelligence','trend_forecaster','audience_listener'], 'gemini-2.5-flash', 'Pick narrative shape (hook, conflict, resolution)'),
('quote_extractor',    'Quote Extractor',      'analyze',   11,  ARRAY['scout','intelligence'],                    'gemini-2.5-flash', 'Pull attributable quotes from sources'),
('tone_calibrator',    'Tone Calibrator',      'analyze',   12,  ARRAY['intelligence'],                            'gemini-2.5-flash', 'Match brand voice to topic + audience'),
('localization',       'Localization',         'analyze',   13,  ARRAY['intelligence'],                            'gemini-2.5-flash', 'Inject Pakistan-local context and examples'),
('headline_optimizer', 'Headline Optimizer',   'analyze',   14,  ARRAY['story_arc','tone_calibrator','localization'], 'gemini-2.5-flash', 'Generate + rank 5 headline variants'),
-- Phase 3: CREATE (15-21)
('rewrite',            'Rewrite',              'create',    15,  ARRAY['fact_checker','bias_detector','story_arc','quote_extractor','tone_calibrator','localization','headline_optimizer'], 'gemini-2.5-pro', 'Write the humanized article'),
('vision',             'Vision',               'create',    16,  ARRAY['scout'],                                   'gemini-2.5-pro',   'Multimodal: analyze input images, build thumbnail brief'),
('seo',                'SEO',                  'create',    17,  ARRAY['rewrite'],                                 'gemini-2.5-flash', 'Optimize keywords, density, FAQ, score 0-100'),
('readability',        'Readability Optimizer','create',    18,  ARRAY['rewrite'],                                 'gemini-2.5-flash', 'Tune sentence length and grade level'),
('internal_linking',   'Internal Linking',     'create',    19,  ARRAY['rewrite'],                                 'gemini-2.5-flash', 'Suggest links to existing articles'),
('schema_architect',   'Schema Architect',     'create',    20,  ARRAY['seo'],                                     'gemini-2.5-flash', 'Generate JSON-LD Article + FAQPage schema'),
('excerpt',            'Excerpt',              'create',    21,  ARRAY['rewrite','seo','schema_architect'],        'gemini-2.5-flash', 'Build excerpt + meta description'),
-- Phase 4: MULTIMEDIA (22-31)
('creative',           'Creative',             'multimedia',22,  ARRAY['vision','excerpt'],                        'gemini-2.5-flash', 'Per-platform image briefs (WP/FB/Twitter/IG)'),
('infographic',        'Infographic',          'multimedia',23,  ARRAY['rewrite'],                                 'gemini-2.5-flash', 'Extract data paragraphs into infographic spec'),
('podcast_script',     'Podcast Script',       'multimedia',24,  ARRAY['rewrite'],                                 'gemini-2.5-flash', 'Convert article to podcast script with cues'),
('video_script',       'Video Script',         'multimedia',25,  ARRAY['rewrite','creative'],                      'gemini-2.5-flash', 'Long-form video script with shot list'),
('short_form',         'Short Form',           'multimedia',26,  ARRAY['headline_optimizer','excerpt'],            'gemini-2.5-flash', '30-60s Reel/TikTok script + captions'),
('thread',             'Thread',               'multimedia',27,  ARRAY['rewrite','excerpt'],                       'gemini-2.5-flash', 'X/Threads multi-tweet breakdown'),
('carousel',           'Carousel',             'multimedia',28,  ARRAY['rewrite','creative'],                      'gemini-2.5-flash', 'IG/LinkedIn carousel slide spec'),
('newsletter',         'Newsletter',           'multimedia',29,  ARRAY['rewrite','excerpt','creative'],            'gemini-2.5-flash', 'Email-ready 300-word version + subject line'),
('whatsapp_broadcast', 'WhatsApp Broadcast',   'multimedia',30,  ARRAY['excerpt','short_form'],                    'gemini-2.5-flash', 'WhatsApp/Telegram broadcast snippet'),
('data_viz',           'Data Viz',             'multimedia',31,  ARRAY['intelligence','infographic'],              'gemini-2.5-flash', 'Build chart spec (Recharts JSON)'),
-- Phase 5: DISTRIBUTE (32-40)
('account_manager',    'Account Manager',      'distribute',32,  ARRAY['rewrite','excerpt'],                       'gemini-2.5-flash', 'Pick destinations + per-account variants'),
('publish',            'Publish',              'distribute',33,  ARRAY['account_manager'],                         'gemini-2.5-flash', 'Insert into articles + queue FB post'),
('timing_intelligence','Timing Intelligence',  'distribute',34,  ARRAY['audience_listener','account_manager'],     'gemini-2.5-flash', 'Pick optimal publish/post times'),
('hashtag_strategy',   'Hashtag Strategy',     'distribute',35,  ARRAY['seo','short_form','thread'],               'gemini-2.5-flash', 'Per-platform hashtag sets'),
('cross_platform',     'Cross-Platform Adapter','distribute',36, ARRAY['rewrite','excerpt'],                       'gemini-2.5-flash', 'Reformat for each platform spec'),
('community',          'Community',            'distribute',37,  ARRAY['rewrite','cross_platform'],                'gemini-2.5-flash', 'Discussion prompts and replies'),
('influencer_radar',   'Influencer Radar',     'distribute',38,  ARRAY['trend_forecaster','competitor_intel'],     'gemini-2.5-flash', 'Suggest tag-worthy creators per topic'),
('performance_predictor','Performance Predictor','distribute',39,ARRAY['trend_forecaster','audience_listener','timing_intelligence'], 'gemini-2.5-flash', 'Estimate reach + CTR before publish'),
('syndication',        'Syndication',          'distribute',40,  ARRAY['publish'],                                 'gemini-2.5-flash', 'Re-distribute to partner outlets/RSS'),
-- Phase 6: MONETIZE (41-45)
('adsense_optimizer',  'AdSense Optimizer',    'monetize',  41,  ARRAY['seo','publish'],                           'gemini-2.5-flash', 'Place ad slots for max RPM without UX hit'),
('affiliate_detector', 'Affiliate Detector',   'monetize',  42,  ARRAY['rewrite','seo'],                           'gemini-2.5-flash', 'Surface affiliate link opportunities'),
('lead_magnet',        'Lead Magnet',          'monetize',  43,  ARRAY['rewrite','excerpt'],                       'gemini-2.5-flash', 'Generate downloadable companion asset spec'),
('content_calendar',   'Content Calendar',     'monetize',  44,  ARRAY['trend_forecaster','competitor_intel','audience_listener','analytics'], 'gemini-2.5-flash', 'Suggest next 7 topics'),
('revenue_intelligence','Revenue Intelligence','monetize',  45,  ARRAY['adsense_optimizer','affiliate_detector','analytics'], 'gemini-2.5-flash', 'Per-article revenue forecast'),
-- Phase 7: OPERATE (46-50)
('analytics',          'Analytics',            'operate',   46,  ARRAY['publish','syndication'],                   'gemini-2.5-flash', 'Pull stats, write weekly report'),
('guardian',           'Guardian',             'operate',   47,  ARRAY['rewrite','publish'],                       'gemini-2.5-flash', 'Final audit, plagiarism + AI-detection score, verdict'),
('content_refresh',    'Content Refresh',      'operate',   48,  ARRAY['analytics'],                               'gemini-2.5-flash', 'Detect decay, queue article refresh'),
('brand_safety',       'Brand Safety',         'operate',   49,  ARRAY['rewrite','publish'],                       'gemini-2.5-flash', 'Block hate/misinformation/legal risk'),
('knowledge_base',     'Knowledge Base',       'operate',   50,  ARRAY[]::TEXT[],                                  'gemini-2.5-flash', 'Index all published runs for future retrieval');

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lobstertrap_audit;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_outputs;
