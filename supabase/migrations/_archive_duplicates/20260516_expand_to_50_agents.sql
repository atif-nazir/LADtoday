-- Expand agent_name enum to include all 50 agents
ALTER TYPE agent_name ADD VALUE 'trend_forecaster' AFTER 'intelligence';
ALTER TYPE agent_name ADD VALUE 'competitor_intel' AFTER 'trend_forecaster';
ALTER TYPE agent_name ADD VALUE 'audience_listener' AFTER 'competitor_intel';
ALTER TYPE agent_name ADD VALUE 'news_wire' AFTER 'audience_listener';
ALTER TYPE agent_name ADD VALUE 'research' AFTER 'news_wire';
ALTER TYPE agent_name ADD VALUE 'fact_checker' AFTER 'research';
ALTER TYPE agent_name ADD VALUE 'bias_detector' AFTER 'fact_checker';
ALTER TYPE agent_name ADD VALUE 'story_arc' AFTER 'bias_detector';
ALTER TYPE agent_name ADD VALUE 'quote_extractor' AFTER 'story_arc';
ALTER TYPE agent_name ADD VALUE 'tone_calibrator' AFTER 'quote_extractor';
ALTER TYPE agent_name ADD VALUE 'localization' AFTER 'tone_calibrator';
ALTER TYPE agent_name ADD VALUE 'headline_optimizer' AFTER 'localization';
ALTER TYPE agent_name ADD VALUE 'readability_optimizer' AFTER 'headline_optimizer';
ALTER TYPE agent_name ADD VALUE 'internal_linking' AFTER 'readability_optimizer';
ALTER TYPE agent_name ADD VALUE 'schema_architect' AFTER 'internal_linking';
ALTER TYPE agent_name ADD VALUE 'excerpt' AFTER 'schema_architect';
ALTER TYPE agent_name ADD VALUE 'infographic' AFTER 'excerpt';
ALTER TYPE agent_name ADD VALUE 'podcast_script' AFTER 'infographic';
ALTER TYPE agent_name ADD VALUE 'video_script' AFTER 'podcast_script';
ALTER TYPE agent_name ADD VALUE 'short_form' AFTER 'video_script';
ALTER TYPE agent_name ADD VALUE 'thread' AFTER 'short_form';
ALTER TYPE agent_name ADD VALUE 'carousel' AFTER 'thread';
ALTER TYPE agent_name ADD VALUE 'newsletter' AFTER 'carousel';
ALTER TYPE agent_name ADD VALUE 'whatsapp_broadcast' AFTER 'newsletter';
ALTER TYPE agent_name ADD VALUE 'data_visualization' AFTER 'whatsapp_broadcast';
ALTER TYPE agent_name ADD VALUE 'timing_intelligence' AFTER 'data_visualization';
ALTER TYPE agent_name ADD VALUE 'hashtag_strategy' AFTER 'timing_intelligence';
ALTER TYPE agent_name ADD VALUE 'cross_platform_adapter' AFTER 'hashtag_strategy';
ALTER TYPE agent_name ADD VALUE 'community' AFTER 'cross_platform_adapter';
ALTER TYPE agent_name ADD VALUE 'influencer_radar' AFTER 'community';
ALTER TYPE agent_name ADD VALUE 'performance_predictor' AFTER 'influencer_radar';
ALTER TYPE agent_name ADD VALUE 'syndication' AFTER 'performance_predictor';
ALTER TYPE agent_name ADD VALUE 'adsense_optimizer' AFTER 'syndication';
ALTER TYPE agent_name ADD VALUE 'affiliate_detector' AFTER 'adsense_optimizer';
ALTER TYPE agent_name ADD VALUE 'lead_magnet' AFTER 'affiliate_detector';
ALTER TYPE agent_name ADD VALUE 'content_calendar' AFTER 'lead_magnet';
ALTER TYPE agent_name ADD VALUE 'revenue_intelligence' AFTER 'content_calendar';
ALTER TYPE agent_name ADD VALUE 'content_refresh' AFTER 'revenue_intelligence';
ALTER TYPE agent_name ADD VALUE 'brand_safety' AFTER 'content_refresh';
ALTER TYPE agent_name ADD VALUE 'knowledge_base' AFTER 'brand_safety';

-- Extend pipeline_runs table to track all 50 agent statuses
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_1_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_2_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_3_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_4_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_5_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_6_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phase_7_complete BOOLEAN DEFAULT FALSE;

-- Extend articles table with multimedia content
ALTER TABLE articles ADD COLUMN IF NOT EXISTS podcast_script TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS video_script TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS short_form_variants JSONB DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS thread_tweets JSONB DEFAULT '[]';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS carousel_spec JSONB DEFAULT '[]';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS newsletter_html TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS whatsapp_content JSONB DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS infographic_spec JSONB DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS data_chart_html TEXT;

-- Extend articles with distribution tracking
ALTER TABLE articles ADD COLUMN IF NOT EXISTS published_platforms TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS scheduled_posts JSONB DEFAULT '[]';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS syndication_status JSONB DEFAULT '{}';

-- Extend articles with monetization
ALTER TABLE articles ADD COLUMN IF NOT EXISTS revenue_report JSONB DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS affiliate_opportunities JSONB DEFAULT '[]';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS lead_magnet_content TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS performance_forecast JSONB DEFAULT '{}';

-- New table for agent dependencies and DAG relationships
CREATE TABLE IF NOT EXISTS agent_dag (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id INT NOT NULL UNIQUE,
  agent_name TEXT NOT NULL UNIQUE,
  phase INT NOT NULL,
  priority INT NOT NULL,
  dependencies INT[] DEFAULT '{}',
  model TEXT NOT NULL,
  estimated_tokens INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert all 50 agent DAG definitions
INSERT INTO agent_dag (agent_id, agent_name, phase, priority, dependencies, model, estimated_tokens) VALUES
-- Phase 1: Discover
(1, 'scout', 1, 1, '{}', 'gemini-2.0-flash', 800),
(2, 'intelligence', 1, 2, '{1}', 'gemini-2.0-pro', 4500),
(3, 'trend_forecaster', 1, 1, '{}', 'gemini-2.0-flash', 600),
(4, 'competitor_intel', 1, 1, '{}', 'gemini-2.0-flash', 700),
(5, 'audience_listener', 1, 1, '{}', 'gemini-2.0-flash', 500),
(6, 'news_wire', 1, 1, '{}', 'gemini-2.0-flash', 400),
(7, 'research', 1, 3, '{1,2}', 'gemini-2.0-pro', 2500),
-- Phase 2: Analyze
(8, 'fact_checker', 2, 1, '{1,2,7}', 'gemini-2.0-pro', 2000),
(9, 'bias_detector', 2, 1, '{2}', 'gemini-2.0-pro', 1800),
(10, 'story_arc', 2, 2, '{2,3,5}', 'gemini-2.0-pro', 1500),
(11, 'quote_extractor', 2, 1, '{1,2}', 'gemini-2.0-flash', 600),
(12, 'tone_calibrator', 2, 1, '{2}', 'gemini-2.0-pro', 2000),
(13, 'localization', 2, 1, '{2}', 'gemini-2.0-flash', 800),
(14, 'headline_optimizer', 2, 3, '{10,12,13}', 'gemini-2.0-flash', 700),
-- Phase 3: Create
(15, 'rewrite', 3, 1, '{8,9,10,11,12,13,14}', 'gemini-2.0-pro', 5500),
(16, 'vision', 3, 1, '{1}', 'gemini-2.0-pro', 1800),
(17, 'seo', 3, 1, '{15}', 'gemini-2.0-flash', 1200),
(18, 'readability_optimizer', 3, 1, '{15}', 'gemini-2.0-flash', 1000),
(19, 'internal_linking', 3, 1, '{15}', 'gemini-2.0-flash', 800),
(20, 'schema_architect', 3, 1, '{17,18,19}', 'gemini-2.0-flash', 600),
(21, 'excerpt', 3, 1, '{15,17,20}', 'gemini-2.0-flash', 700),
-- Phase 4: Multimedia
(22, 'creative', 4, 1, '{16,21}', 'gemini-2.0-flash', 800),
(23, 'infographic', 4, 1, '{15}', 'gemini-2.0-pro', 1500),
(24, 'podcast_script', 4, 1, '{15}', 'gemini-2.0-flash', 1200),
(25, 'video_script', 4, 1, '{15,22}', 'gemini-2.0-flash', 1100),
(26, 'short_form', 4, 1, '{14,21}', 'gemini-2.0-flash', 600),
(27, 'thread', 4, 1, '{15,21}', 'gemini-2.0-flash', 800),
(28, 'carousel', 4, 1, '{15,22}', 'gemini-2.0-flash', 900),
(29, 'newsletter', 4, 1, '{15,21,22}', 'gemini-2.0-flash', 800),
(30, 'whatsapp_broadcast', 4, 1, '{21,26}', 'gemini-2.0-flash', 500),
(31, 'data_visualization', 4, 1, '{2,23}', 'gemini-2.0-flash', 700),
-- Phase 5: Distribute
(32, 'account_manager', 5, 1, '{15,21}', 'gemini-2.0-flash', 600),
(33, 'publish', 5, 1, '{32}', 'gemini-2.0-flash', 800),
(34, 'timing_intelligence', 5, 1, '{5,32}', 'gemini-2.0-flash', 400),
(35, 'hashtag_strategy', 5, 1, '{17,26,27}', 'gemini-2.0-flash', 500),
(36, 'cross_platform_adapter', 5, 1, '{15,21}', 'gemini-2.0-flash', 800),
(37, 'community', 5, 1, '{15,36}', 'gemini-2.0-flash', 800),
(38, 'influencer_radar', 5, 1, '{3,4}', 'gemini-2.0-flash', 600),
(39, 'performance_predictor', 5, 1, '{3,5,34}', 'gemini-2.0-pro', 1200),
(40, 'syndication', 5, 1, '{33}', 'gemini-2.0-flash', 600),
-- Phase 6: Monetize
(41, 'adsense_optimizer', 6, 1, '{17,33}', 'gemini-2.0-flash', 500),
(42, 'affiliate_detector', 6, 1, '{15,17}', 'gemini-2.0-flash', 400),
(43, 'lead_magnet', 6, 1, '{15,21}', 'gemini-2.0-flash', 800),
(44, 'content_calendar', 6, 1, '{3,4,5,46}', 'gemini-2.0-pro', 2000),
(45, 'revenue_intelligence', 6, 1, '{41,42,46}', 'gemini-2.0-flash', 600),
-- Phase 7: Operate
(46, 'analytics', 7, 1, '{33,40}', 'gemini-2.0-flash', 800),
(47, 'guardian', 7, 1, '{}', 'gemini-2.0-flash', 600),
(48, 'content_refresh', 7, 1, '{46}', 'gemini-2.0-pro', 3000),
(49, 'brand_safety', 7, 1, '{15,33}', 'gemini-2.0-pro', 1500),
(50, 'knowledge_base', 7, 1, '{}', 'gemini-2.0-pro', 2500);

-- New table for multimedia content variations
CREATE TABLE IF NOT EXISTS content_variations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  variation_type TEXT NOT NULL, -- 'podcast', 'video', 'short_form', 'thread', 'carousel', 'newsletter', 'whatsapp'
  content TEXT,
  metadata JSONB DEFAULT '{}',
  platform_targets TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- New table for performance analytics across all platforms
CREATE TABLE IF NOT EXISTS platform_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'wordpress', 'facebook', 'twitter', 'linkedin', 'instagram', 'whatsapp'
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0.0,
  revenue DECIMAL(10,2) DEFAULT 0.0,
  metric_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- New table for knowledge base extraction
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'person', 'company', 'regulation', 'place'
  entity_name TEXT NOT NULL,
  context TEXT,
  mentioned_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- New table for tracked facts with sources
CREATE TABLE IF NOT EXISTS knowledge_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  fact_text TEXT NOT NULL,
  source_attribution TEXT,
  fact_confidence DECIMAL(3,2), -- 0.0 to 1.0
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indices for better query performance
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created ON pipeline_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_executions_pipeline ON agent_executions(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_content_variations_article ON content_variations(article_id);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_article ON platform_analytics(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_article ON knowledge_entities(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_facts_article ON knowledge_facts(article_id);

-- Create indexes for full-text search on knowledge base
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON knowledge_entities USING GIN(to_tsvector('english', entity_name));
CREATE INDEX IF NOT EXISTS idx_knowledge_facts_text ON knowledge_facts USING GIN(to_tsvector('english', fact_text));

-- Enable realtime for dashboard updates
ALTER TABLE pipeline_runs REPLICA IDENTITY FULL;
ALTER TABLE agent_executions REPLICA IDENTITY FULL;
ALTER TABLE platform_analytics REPLICA IDENTITY FULL;

-- Create function to update article updated_at timestamp
CREATE OR REPLACE FUNCTION update_article_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_timestamp_trigger
BEFORE UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_article_timestamp();

-- Create function to auto-log agent executions
CREATE OR REPLACE FUNCTION log_agent_execution()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_executions (pipeline_run_id, agent_name, status, started_at)
  VALUES (NEW.id, 'scout', 'pending', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_first_agent
AFTER INSERT ON pipeline_runs
FOR EACH ROW
EXECUTE FUNCTION log_agent_execution();
