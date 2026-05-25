-- Phase 0: Foundation - Shared infrastructure for 50-agent pipeline
-- Created: 2026-05-16

-- 1. Pipeline runs table - tracks each topic → publish job
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  input_type text CHECK (input_type IN ('topic', 'url', 'content')) DEFAULT 'topic',
  input_payload jsonb NOT NULL DEFAULT '{}',
  status text CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  current_phase text,
  total_tokens integer DEFAULT 0,
  estimated_cost_usd numeric(10, 6) DEFAULT 0,
  duration_ms integer,
  agent_states jsonb DEFAULT '{}' -- {agent_key: {status, started_at, finished_at, tokens, output_ref, error}}
  ,
  metadata jsonb DEFAULT '{}' -- brand_voice, language, enabled_agents, etc.
  ,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Agent outputs table - per-agent structured outputs
CREATE TABLE IF NOT EXISTS agent_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  phase text NOT NULL,
  status text CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  body jsonb NOT NULL DEFAULT '{}',
  tokens_used integer DEFAULT 0,
  cost_usd numeric(10, 6) DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(run_id, agent_key)
);

-- 3. Lobster Trap audit table - every Gemini call logged
CREATE TABLE IF NOT EXISTS lobstertrap_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  prompt_preview text,
  prompt_tokens integer,
  response_tokens integer,
  total_tokens integer,
  injection_detected boolean DEFAULT false,
  pii_detected boolean DEFAULT false,
  risk_score numeric(4, 2) DEFAULT 0,
  action_taken text CHECK (action_taken IN ('allowed', 'masked', 'blocked', 'reviewed')),
  verdict text CHECK (verdict IN ('approved', 'review', 'rejected')),
  latency_ms integer,
  metadata jsonb DEFAULT '{}' -- model, temperature, etc.
  ,
  created_at timestamptz DEFAULT now()
);

-- 4. Agent registry - master list of all 50 agents
CREATE TABLE IF NOT EXISTS agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  phase text NOT NULL,
  depends_on text[] DEFAULT '{}',
  model text CHECK (model IN ('flash', 'pro')),
  prompt_template text,
  enabled boolean DEFAULT false,
  order_index integer,
  max_tokens integer DEFAULT 2048,
  temperature numeric(3, 2) DEFAULT 0.8,
  metadata jsonb DEFAULT '{}' -- cost estimates, etc.
  ,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON pipeline_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON pipeline_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_run_id ON agent_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_key ON agent_outputs(agent_key);
CREATE INDEX IF NOT EXISTS idx_lobstertrap_audit_run_id ON lobstertrap_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_lobstertrap_audit_created_at ON lobstertrap_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_registry_phase ON agent_registry(phase);
CREATE INDEX IF NOT EXISTS idx_agent_registry_enabled ON agent_registry(enabled);

-- Enable realtime on these tables
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_outputs;
ALTER PUBLICATION supabase_realtime ADD TABLE lobstertrap_audit;

-- RLS: All tables admin-only
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobstertrap_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all pipeline_runs" ON pipeline_runs
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create pipeline_runs" ON pipeline_runs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pipeline_runs" ON pipeline_runs
  FOR UPDATE USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all agent_outputs" ON agent_outputs
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert agent_outputs" ON agent_outputs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update agent_outputs" ON agent_outputs
  FOR UPDATE USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all lobstertrap_audit" ON lobstertrap_audit
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert lobstertrap_audit" ON lobstertrap_audit
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view agent_registry" ON agent_registry
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update agent_registry" ON agent_registry
  FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Seed agent_registry with all 50 agents (most disabled)
INSERT INTO agent_registry (key, name, description, phase, depends_on, model, enabled, order_index) VALUES
-- Phase 0: Foundation (no agents, just setup)

-- Phase 1: Discover (7 agents)
('scout-01', 'Scout', 'Raw content ingestion', 'discover', '{}', 'flash', false, 1),
('intelligence-02', 'Intelligence', 'Content brief & facts', 'discover', '{scout-01}', 'pro', false, 2),
('trendforecaster-03', 'Trend Forecaster', '72-hour trend predictions', 'discover', '{scout-01}', 'pro', false, 3),
('compintel-04', 'Competitor Intel', 'Gap analysis', 'discover', '{scout-01}', 'pro', false, 4),
('audience-05', 'Audience Listener', 'Real audience questions', 'discover', '{scout-01}', 'flash', false, 5),
('newswire-06', 'News Wire', 'Breaking news monitoring', 'discover', '{}', 'flash', false, 6),
('research-07', 'Research', 'Authoritative sources', 'discover', '{scout-01}', 'flash', false, 7),

-- Phase 2: Analyze (7 agents)
('factchecker-08', 'Fact Checker', 'Verification & confidence', 'analyze', '{intelligence-02}', 'pro', false, 8),
('biasdetector-09', 'Bias Detector', '5-type bias detection', 'analyze', '{intelligence-02}', 'flash', false, 9),
('storyarc-10', 'Story Arc', 'Narrative structure', 'analyze', '{intelligence-02}', 'flash', false, 10),
('quoteextractor-11', 'Quote Extractor', 'Mine quotable statements', 'analyze', '{intelligence-02}', 'flash', false, 11),
('tonecalibrator-12', 'Tone Calibrator', 'Voice matching', 'analyze', '{factchecker-08}', 'flash', false, 12),
('localization-13', 'Localization', 'Geographic adaptation', 'analyze', '{biasdetector-09}', 'flash', false, 13),
('headlineopt-14', 'Headline Optimizer', '20 variants + CTR', 'analyze', '{storyarc-10}', 'flash', false, 14),

-- Phase 3: Create (7 agents)
('rewrite-15', 'Rewrite', 'Enhanced content', 'create', '{factchecker-08,tonecalibrator-12}', 'pro', false, 15),
('vision-16', 'Vision', '3 thumbnail concepts', 'create', '{headlineopt-14}', 'flash', false, 16),
('seo-17', 'SEO', 'Search optimization', 'create', '{rewrite-15}', 'flash', false, 17),
('readability-18', 'Readability Optimizer', 'Flesch-Kincaid', 'create', '{rewrite-15}', 'flash', false, 18),
('intlink-19', 'Internal Linking', 'Content graph', 'create', '{rewrite-15}', 'flash', false, 19),
('schema-20', 'Schema Architect', 'Structured data', 'create', '{rewrite-15}', 'flash', false, 20),
('excerpt-21', 'Excerpt', '8+ text variants', 'create', '{rewrite-15}', 'flash', false, 21),

-- Phase 4: Multimedia (10 agents)
('creative-22', 'Creative', 'Multi-platform thumbnails', 'multimedia', '{headlineopt-14}', 'flash', false, 22),
('infographic-23', 'Infographic', 'Data visualization specs', 'multimedia', '{storyarc-10}', 'flash', false, 23),
('podcast-24', 'Podcast Script', 'Audio adaptation', 'multimedia', '{rewrite-15}', 'flash', false, 24),
('videoscript-25', 'Video Script', 'YouTube/TikTok briefs', 'multimedia', '{rewrite-15}', 'flash', false, 25),
('shortform-26', 'Short Form', 'TikTok/Reels scripts', 'multimedia', '{excerpt-21}', 'flash', false, 26),
('thread-27', 'Thread', 'Twitter/X threads', 'multimedia', '{excerpt-21}', 'flash', false, 27),
('carousel-28', 'Carousel', 'LinkedIn/Instagram slides', 'multimedia', '{excerpt-21}', 'flash', false, 28),
('newsletter-29', 'Newsletter', 'Email templates', 'multimedia', '{excerpt-21}', 'flash', false, 29),
('whatsapp-30', 'WhatsApp Broadcast', 'Plain-text formatting', 'multimedia', '{excerpt-21}', 'flash', false, 30),
('dataviz-31', 'Data Visualization', 'Interactive Chart.js', 'multimedia', '{infographic-23}', 'flash', false, 31),

-- Phase 5: Distribute (9 agents)
('acctmgr-32', 'Account Manager', 'Multi-platform routing', 'distribute', '{rewrite-15}', 'flash', false, 32),
('publish-33', 'Publish', '6+ destinations', 'distribute', '{rewrite-15,creative-22}', 'flash', false, 33),
('timing-34', 'Timing Intelligence', 'Optimal windows', 'distribute', '{}', 'flash', false, 34),
('hashtag-35', 'Hashtag Strategy', 'Platform-specific tags', 'distribute', '{thread-27}', 'flash', false, 35),
('crossplatform-36', 'Cross-Platform Adapter', 'Native framing', 'distribute', '{rewrite-15}', 'flash', false, 36),
('community-37', 'Community', 'Quora/Reddit/Discord', 'distribute', '{excerpt-21}', 'flash', false, 37),
('influencer-38', 'Influencer Radar', 'Target personas', 'distribute', '{creative-22}', 'flash', false, 38),
('perfpred-39', 'Performance Predictor', 'First-week forecast', 'distribute', '{timing-34}', 'flash', false, 39),
('syndication-40', 'Syndication', 'Medium/LinkedIn RSS', 'distribute', '{publish-33}', 'flash', false, 40),

-- Phase 6: Monetize (5 agents)
('adsense-41', 'AdSense Optimizer', 'CPM category analysis', 'monetize', '{rewrite-15}', 'flash', false, 41),
('affiliate-42', 'Affiliate Detector', 'Opportunity detection', 'monetize', '{rewrite-15}', 'flash', false, 42),
('leadmagnet-43', 'Lead Magnet', 'Email list growth', 'monetize', '{rewrite-15}', 'flash', false, 43),
('contentcal-44', 'Content Calendar', '30-day planning', 'monetize', '{publish-33}', 'flash', false, 44),
('revenue-45', 'Revenue Intelligence', 'Revenue analytics', 'monetize', '{adsense-41}', 'flash', false, 45),

-- Phase 7: Operate (5 agents)
('analytics-46', 'Analytics', 'Performance tracking', 'operate', '{publish-33}', 'flash', false, 46),
('guardian-47', 'Guardian', 'Security & compliance', 'operate', '{}', 'flash', false, 47),
('refresh-48', 'Content Refresh', 'Decay detection', 'operate', '{analytics-46}', 'flash', false, 48),
('brandsafety-49', 'Brand Safety', 'Legal review', 'operate', '{rewrite-15}', 'flash', false, 49),
('kb-50', 'Knowledge Base', 'Entity extraction', 'operate', '{rewrite-15}', 'flash', false, 50);
