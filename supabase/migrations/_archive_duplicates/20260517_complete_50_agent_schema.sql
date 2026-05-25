-- Complete 50-Agent Intelligence Swarm Schema for LADtoday
-- Phases 0-7: Discovery → Analyze → Create → Multimedia → Distribute → Monetize → Operate

-- ============================================================================
-- CORE PIPELINE TABLES (Extended from Phase 0)
-- ============================================================================

-- Enhanced pipeline_runs to support all 50 agents and all phases
ALTER TABLE IF EXISTS pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_pkey CASCADE;

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  input_type TEXT DEFAULT 'topic' CHECK (input_type IN ('topic', 'url', 'file', 'social')),
  source_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_phase TEXT DEFAULT 'foundation' CHECK (current_phase IN (
    'foundation', 'discover', 'analyze', 'create', 'multimedia', 
    'distribute', 'monetize', 'operate'
  )),
  
  -- Phase completion tracking
  discovered_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  multimedia_at TIMESTAMPTZ,
  distributed_at TIMESTAMPTZ,
  monetized_at TIMESTAMPTZ,
  operated_at TIMESTAMPTZ,
  
  -- Execution metadata
  total_tokens INT DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 4) DEFAULT 0.00,
  execution_time_ms INT DEFAULT 0,
  
  -- Agent states for all 50 agents
  agent_states JSONB DEFAULT '{}',
  
  -- Configuration
  brand_voice TEXT,
  language TEXT DEFAULT 'en',
  enabled_agents TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Outputs summary
  final_article_id UUID,
  content_variants JSONB DEFAULT '{}',
  
  -- Audit
  created_at_run TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  FOREIGN KEY (final_article_id) REFERENCES articles(id)
);

-- Extended agent_outputs for all 50 agents with structured data
DROP TABLE IF EXISTS agent_outputs CASCADE;
CREATE TABLE agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  
  -- Agent output structure
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  execution_time_ms INT,
  
  -- Structured output (agent-specific)
  body JSONB,
  error_message TEXT,
  
  -- Token tracking
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  
  -- Dependencies (for DAG)
  depends_on TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(run_id, agent_key)
);

-- Lobster Trap security audit
DROP TABLE IF EXISTS lobstertrap_audit CASCADE;
CREATE TABLE lobstertrap_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  agent_key TEXT,
  
  -- Safety analysis
  prompt_preview TEXT,
  injection_detected BOOLEAN DEFAULT false,
  pii_detected BOOLEAN DEFAULT false,
  risk_score DECIMAL(3, 2) DEFAULT 0,
  
  -- Verdict
  verdict TEXT CHECK (verdict IN ('approved', 'review', 'rejected')),
  action_taken TEXT CHECK (action_taken IN ('allowed', 'masked', 'blocked', 'reviewed')),
  
  -- Metadata
  latency_ms INT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Master agent registry for all 50 agents
DROP TABLE IF EXISTS agent_registry CASCADE;
CREATE TABLE agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL CHECK (phase IN (
    'foundation', 'discover', 'analyze', 'create', 'multimedia',
    'discover', 'monetize', 'operate'
  )),
  
  -- Agent configuration
  model TEXT DEFAULT 'flash' CHECK (model IN ('flash', 'pro')),
  max_tokens INT DEFAULT 1000,
  temperature DECIMAL(3, 2) DEFAULT 0.7,
  
  -- Ordering & dependencies
  order_index INT,
  depends_on TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Control
  enabled BOOLEAN DEFAULT false,
  is_critical BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 1: DISCOVER OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS discover_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- Scout output
  raw_content TEXT,
  source_type TEXT,
  ingested_at TIMESTAMPTZ,
  
  -- Intelligence output
  key_facts TEXT[],
  entities JSONB,
  
  -- Trend Forecaster output
  trending_angles TEXT[],
  breakout_score DECIMAL(3, 2),
  
  -- Competitor Intel
  competitor_gaps JSONB,
  
  -- Audience Listener
  audience_questions TEXT[],
  pain_points TEXT[],
  
  -- News Wire
  breaking_news JSONB,
  time_sensitive BOOLEAN,
  
  -- Research
  authoritative_sources TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 2: ANALYZE OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS analyze_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- Fact Checker
  fact_checks JSONB,
  confidence_scores DECIMAL(3, 2)[],
  
  -- Bias Detector
  detected_biases TEXT[],
  bias_balance_directives TEXT,
  
  -- Story Arc
  narrative_type TEXT,
  story_structure JSONB,
  
  -- Quote Extractor
  quotes JSONB,
  authority_scores DECIMAL(3, 2)[],
  
  -- Tone Calibrator
  target_tone TEXT,
  voice_samples TEXT,
  
  -- Localization
  localized_content TEXT,
  cultural_notes TEXT,
  
  -- Headline Optimizer
  headline_variants TEXT[],
  ctr_scores DECIMAL(3, 2)[],
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 3: CREATE OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS create_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- Rewrite
  optimized_content TEXT,
  content_quality_score DECIMAL(3, 2),
  
  -- Vision
  thumbnail_concepts JSONB,
  image_prompts TEXT[],
  
  -- SEO
  meta_description TEXT,
  focus_keywords TEXT[],
  faq_sections JSONB,
  
  -- Readability
  flesch_kincaid_grade INT,
  readability_improvements TEXT[],
  
  -- Internal Linking
  internal_links JSONB,
  
  -- Schema Architect
  schema_types TEXT[],
  structured_data JSONB,
  
  -- Excerpt
  excerpts JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 4: MULTIMEDIA OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS multimedia_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- Creative (thumbnails)
  thumbnail_designs JSONB,
  design_specs TEXT[],
  
  -- Infographic
  infographic_specs JSONB,
  data_visualizations TEXT[],
  
  -- Podcast Script
  podcast_script TEXT,
  audio_duration_seconds INT,
  
  -- Video Script
  video_scripts JSONB,
  b_roll_descriptions TEXT[],
  
  -- Short Form
  short_form_variants JSONB,
  tiktok_scripts TEXT[],
  reels_scripts TEXT[],
  
  -- Thread
  twitter_threads JSONB,
  thread_count INT,
  
  -- Carousel
  carousel_specs JSONB,
  slide_count INT,
  
  -- Newsletter
  newsletter_content JSONB,
  email_subject_variants TEXT[],
  
  -- WhatsApp
  whatsapp_content TEXT,
  
  -- Data Visualization
  chart_specs JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 5: DISTRIBUTE OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS distribute_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- Account Manager
  platform_routing JSONB,
  
  -- Publish
  publish_targets TEXT[],
  publish_status JSONB,
  
  -- Timing Intelligence
  optimal_posting_windows JSONB,
  
  -- Hashtag Strategy
  hashtags_by_platform JSONB,
  
  -- Cross-Platform Adapter
  platform_variants JSONB,
  
  -- Community
  community_posts JSONB,
  target_communities TEXT[],
  
  -- Influencer Radar
  influencer_targets JSONB,
  outreach_templates TEXT[],
  
  -- Performance Predictor
  first_week_forecast JSONB,
  confidence_intervals DECIMAL(3, 2)[],
  
  -- Syndication
  syndication_urls TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 6: MONETIZE OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS monetize_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- AdSense Optimizer
  category_analysis JSONB,
  estimated_cpm_range JSONB,
  
  -- Affiliate Detector
  affiliate_opportunities JSONB,
  
  -- Lead Magnet
  lead_magnet_specs JSONB,
  conversion_points TEXT[],
  
  -- Content Calendar
  calendar_30_days JSONB,
  
  -- Revenue Intelligence
  revenue_per_category JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PHASE 7: OPERATE OUTPUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS operate_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  -- Analytics
  multi_platform_metrics JSONB,
  performance_summary JSONB,
  
  -- Guardian
  compliance_verdict TEXT,
  security_alerts TEXT[],
  
  -- Content Refresh
  decay_signals TEXT[],
  refresh_recommendations TEXT[],
  
  -- Brand Safety
  legal_review JSONB,
  risk_flags TEXT[],
  
  -- Knowledge Base
  entities JSONB,
  facts JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_topic ON pipeline_runs(topic);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_current_phase ON pipeline_runs(current_phase);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created ON pipeline_runs(created_at_run);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_run_id ON agent_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_key ON agent_outputs(agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_phase ON agent_outputs(phase);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_status ON agent_outputs(status);

CREATE INDEX IF NOT EXISTS idx_lobstertrap_run_id ON lobstertrap_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_lobstertrap_verdict ON lobstertrap_audit(verdict);

CREATE INDEX IF NOT EXISTS idx_agent_registry_phase ON agent_registry(phase);
CREATE INDEX IF NOT EXISTS idx_agent_registry_enabled ON agent_registry(enabled);

-- ============================================================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_outputs;
ALTER PUBLICATION supabase_realtime ADD TABLE lobstertrap_audit;

-- ============================================================================
-- RLS POLICIES (Admin Only)
-- ============================================================================

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobstertrap_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access pipeline_runs"
  ON pipeline_runs FOR ALL USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND role = 'authenticated')
  );

CREATE POLICY "Admin access agent_outputs"
  ON agent_outputs FOR ALL USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND role = 'authenticated')
  );

CREATE POLICY "Admin access lobstertrap_audit"
  ON lobstertrap_audit FOR ALL USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND role = 'authenticated')
  );

CREATE POLICY "Admin access agent_registry"
  ON agent_registry FOR ALL USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND role = 'authenticated')
  );

-- ============================================================================
-- SEED AGENT REGISTRY WITH ALL 50 AGENTS
-- ============================================================================

INSERT INTO agent_registry (key, name, phase, model, max_tokens, order_index, depends_on, enabled) VALUES
-- PHASE 1: DISCOVER (7 agents)
('scout-01', 'Scout', 'discover', 'flash', 2000, 1, ARRAY[]::TEXT[], false),
('intelligence-02', 'Intelligence', 'discover', 'flash', 2000, 2, ARRAY['scout-01'], false),
('trend-forecaster-03', 'Trend Forecaster', 'discover', 'pro', 2500, 3, ARRAY['intelligence-02'], false),
('competitor-intel-04', 'Competitor Intelligence', 'discover', 'flash', 2000, 4, ARRAY['intelligence-02'], false),
('audience-listener-05', 'Audience Listener', 'discover', 'flash', 1500, 5, ARRAY['scout-01'], false),
('news-wire-06', 'News Wire', 'discover', 'pro', 2500, 6, ARRAY[]::TEXT[], false),
('research-07', 'Research', 'discover', 'pro', 3000, 7, ARRAY['intelligence-02'], false),

-- PHASE 2: ANALYZE (7 agents)
('fact-checker-08', 'Fact Checker', 'analyze', 'pro', 2500, 8, ARRAY['intelligence-02'], false),
('bias-detector-09', 'Bias Detector', 'analyze', 'pro', 2000, 9, ARRAY['scout-01'], false),
('story-arc-10', 'Story Arc', 'analyze', 'flash', 1500, 10, ARRAY['intelligence-02'], false),
('quote-extractor-11', 'Quote Extractor', 'analyze', 'flash', 1500, 11, ARRAY['scout-01'], false),
('tone-calibrator-12', 'Tone Calibrator', 'analyze', 'flash', 1000, 12, ARRAY[]::TEXT[], false),
('localization-13', 'Localization', 'analyze', 'flash', 1500, 13, ARRAY['scout-01'], false),
('headline-optimizer-14', 'Headline Optimizer', 'analyze', 'flash', 1500, 14, ARRAY['intelligence-02'], false),

-- PHASE 3: CREATE (7 agents)
('rewrite-15', 'Rewrite', 'create', 'pro', 3000, 15, ARRAY['story-arc-10', 'bias-detector-09'], false),
('vision-16', 'Vision', 'create', 'flash', 2000, 16, ARRAY['scout-01'], false),
('seo-17', 'SEO Optimizer', 'create', 'pro', 2000, 17, ARRAY['intelligence-02', 'audience-listener-05'], false),
('readability-18', 'Readability Optimizer', 'create', 'flash', 1000, 18, ARRAY['rewrite-15'], false),
('internal-linking-19', 'Internal Linking', 'create', 'flash', 1500, 19, ARRAY['rewrite-15'], false),
('schema-architect-20', 'Schema Architect', 'create', 'flash', 1500, 20, ARRAY['rewrite-15'], false),
('excerpt-21', 'Excerpt Generator', 'create', 'flash', 1000, 21, ARRAY['rewrite-15'], false),

-- PHASE 4: MULTIMEDIA (10 agents)
('creative-22', 'Creative', 'multimedia', 'flash', 2000, 22, ARRAY['headline-optimizer-14'], false),
('infographic-23', 'Infographic', 'multimedia', 'pro', 1500, 23, ARRAY['intelligence-02'], false),
('podcast-script-24', 'Podcast Script', 'multimedia', 'pro', 2500, 24, ARRAY['rewrite-15'], false),
('video-script-25', 'Video Script', 'multimedia', 'pro', 2500, 25, ARRAY['rewrite-15'], false),
('short-form-26', 'Short Form', 'multimedia', 'flash', 1000, 26, ARRAY['rewrite-15', 'headline-optimizer-14'], false),
('thread-27', 'Thread', 'multimedia', 'flash', 1000, 27, ARRAY['excerpt-21'], false),
('carousel-28', 'Carousel', 'multimedia', 'flash', 1500, 28, ARRAY['creative-22'], false),
('newsletter-29', 'Newsletter', 'multimedia', 'flash', 1500, 29, ARRAY['rewrite-15'], false),
('whatsapp-30', 'WhatsApp Content', 'multimedia', 'flash', 500, 30, ARRAY['excerpt-21'], false),
('data-viz-31', 'Data Visualization', 'multimedia', 'pro', 1500, 31, ARRAY['infographic-23'], false),

-- PHASE 5: DISTRIBUTE (9 agents)
('account-manager-32', 'Account Manager', 'distribute', 'flash', 1000, 32, ARRAY[]::TEXT[], false),
('publish-33', 'Publish', 'distribute', 'pro', 2000, 33, ARRAY['rewrite-15', 'account-manager-32'], false),
('timing-34', 'Timing Intelligence', 'distribute', 'flash', 800, 34, ARRAY[]::TEXT[], false),
('hashtag-35', 'Hashtag Strategy', 'distribute', 'flash', 800, 35, ARRAY['short-form-26'], false),
('cross-platform-36', 'Cross-Platform Adapter', 'distribute', 'flash', 1000, 36, ARRAY['publish-33'], false),
('community-37', 'Community', 'distribute', 'flash', 1000, 37, ARRAY['thread-27', 'excerpt-21'], false),
('influencer-38', 'Influencer Radar', 'distribute', 'pro', 1500, 38, ARRAY['audience-listener-05'], false),
('performance-pred-39', 'Performance Predictor', 'distribute', 'pro', 1500, 39, ARRAY['publish-33'], false),
('syndication-40', 'Syndication', 'distribute', 'flash', 1000, 40, ARRAY['publish-33'], false),

-- PHASE 6: MONETIZE (5 agents)
('adsense-41', 'AdSense Optimizer', 'monetize', 'flash', 1000, 41, ARRAY['rewrite-15'], false),
('affiliate-42', 'Affiliate Detector', 'monetize', 'flash', 1000, 42, ARRAY['intelligence-02'], false),
('lead-magnet-43', 'Lead Magnet', 'monetize', 'flash', 1000, 43, ARRAY['seo-17'], false),
('calendar-44', 'Content Calendar', 'monetize', 'flash', 1000, 44, ARRAY[]::TEXT[], false),
('revenue-intel-45', 'Revenue Intelligence', 'monetize', 'pro', 1500, 45, ARRAY['adsense-41', 'publish-33'], false),

-- PHASE 7: OPERATE (5 agents)
('analytics-46', 'Analytics', 'operate', 'pro', 2000, 46, ARRAY['publish-33'], false),
('guardian-47', 'Guardian', 'operate', 'pro', 2000, 47, ARRAY[]::TEXT[], true),
('refresh-48', 'Content Refresh', 'operate', 'flash', 1000, 48, ARRAY['analytics-46'], false),
('brand-safety-49', 'Brand Safety', 'operate', 'pro', 2000, 49, ARRAY['rewrite-15'], true),
('knowledge-base-50', 'Knowledge Base', 'operate', 'flash', 1500, 50, ARRAY['intelligence-02', 'fact-checker-08'], false)

ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  phase = EXCLUDED.phase,
  model = EXCLUDED.model,
  max_tokens = EXCLUDED.max_tokens,
  order_index = EXCLUDED.order_index,
  depends_on = EXCLUDED.depends_on,
  enabled = EXCLUDED.enabled;
