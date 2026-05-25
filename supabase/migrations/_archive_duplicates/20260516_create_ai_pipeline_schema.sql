-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enum types for agent status and pipeline stages
CREATE TYPE agent_status AS ENUM ('pending', 'running', 'success', 'failed', 'skipped');
CREATE TYPE agent_name AS ENUM (
  'scout', 'intelligence', 'rewrite', 'seo', 'vision', 
  'creative', 'account_manager', 'publish', 'analytics', 'guardian'
);

-- Main pipeline runs table - tracks each article's processing journey
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID,
  source_url TEXT NOT NULL,
  article_title TEXT,
  article_content TEXT,
  featured_image_url TEXT,
  
  -- Pipeline metadata
  status agent_status DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- DAG execution tracking
  dag_state JSONB DEFAULT '{}',
  agent_results JSONB DEFAULT '{}',
  
  -- Environment tracking
  environment TEXT DEFAULT 'production',
  mock_mode BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent execution tracking - detailed logs for each agent's run
CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  agent_name agent_name NOT NULL,
  
  -- Execution status
  status agent_status DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  execution_time_ms INTEGER,
  
  -- Input/Output tracking
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  
  -- Dependency tracking for DAG
  depends_on_agents agent_name[] DEFAULT '{}',
  
  -- Audit trail
  execution_order INTEGER,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Articles table - stores final processed articles
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source information
  source_url TEXT UNIQUE,
  source_name TEXT,
  
  -- Article content
  title TEXT NOT NULL,
  original_title TEXT,
  slug TEXT UNIQUE,
  content TEXT,
  original_content TEXT,
  featured_image_url TEXT,
  featured_image_alt TEXT,
  
  -- AI processed metadata
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT[],
  
  -- Creative versions
  short_summary TEXT,
  medium_summary TEXT,
  
  -- Account-specific metadata
  account_id UUID,
  category_id UUID,
  tags TEXT[],
  
  -- Analytics
  views INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status TEXT DEFAULT 'draft', -- draft, published, scheduled, failed
  publish_scheduled_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lobster Trap audit log - security & policy enforcement
CREATE TABLE IF NOT EXISTS lobstertrap_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identification
  request_id TEXT UNIQUE,
  api_key_hash TEXT,
  
  -- Request details
  agent_name TEXT,
  prompt_sent TEXT,
  model_used TEXT,
  
  -- Security checks
  pii_detected BOOLEAN DEFAULT FALSE,
  pii_locations JSONB, -- {field: "description", type: "email", value: "***"}
  injection_detected BOOLEAN DEFAULT FALSE,
  injection_type TEXT, -- prompt_injection, template_injection, etc
  policy_violations TEXT[],
  
  -- Gemini response
  response_text TEXT,
  response_tokens INTEGER,
  
  -- Outcomes
  request_allowed BOOLEAN,
  action_taken TEXT, -- blocked, sanitized, allowed, etc
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Connected accounts table - for API integrations
CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL, -- wordpress, facebook, google_analytics, etc
  
  -- Authentication
  api_key TEXT,
  api_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Account metadata
  account_id TEXT,
  account_url TEXT,
  
  -- Configuration
  is_active BOOLEAN DEFAULT TRUE,
  auto_publish BOOLEAN DEFAULT FALSE,
  
  -- Tracking
  last_synced_at TIMESTAMP WITH TIME ZONE,
  error_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- view, share, click, error, etc
  event_data JSONB,
  
  user_agent TEXT,
  ip_address TEXT,
  referrer TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indices for performance
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_article_id ON pipeline_runs(article_id);
CREATE INDEX idx_pipeline_runs_created_at ON pipeline_runs(created_at DESC);

CREATE INDEX idx_agent_executions_pipeline_run_id ON agent_executions(pipeline_run_id);
CREATE INDEX idx_agent_executions_agent_name ON agent_executions(agent_name);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);

CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_account_id ON articles(account_id);

CREATE INDEX idx_lobstertrap_audit_created_at ON lobstertrap_audit(created_at DESC);
CREATE INDEX idx_lobstertrap_audit_request_id ON lobstertrap_audit(request_id);

CREATE INDEX idx_analytics_events_article_id ON analytics_events(article_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);

-- Enable RLS policies
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobstertrap_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all for now (can be restricted later based on auth)
CREATE POLICY "Enable read access for all users" ON pipeline_runs
  FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for authenticated users" ON pipeline_runs
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Enable update for authenticated users" ON pipeline_runs
  FOR UPDATE USING (TRUE);

CREATE POLICY "Enable read access for all users" ON agent_executions
  FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for authenticated users" ON agent_executions
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Enable update for authenticated users" ON agent_executions
  FOR UPDATE USING (TRUE);

CREATE POLICY "Enable read access for all users" ON articles
  FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for authenticated users" ON articles
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Enable update for authenticated users" ON articles
  FOR UPDATE USING (TRUE);

CREATE POLICY "Enable read access for all users" ON lobstertrap_audit
  FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for authenticated users" ON lobstertrap_audit
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Enable read access for all users" ON connected_accounts
  FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for authenticated users" ON connected_accounts
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Enable update for authenticated users" ON connected_accounts
  FOR UPDATE USING (TRUE);

CREATE POLICY "Enable read access for all users" ON analytics_events
  FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for authenticated users" ON analytics_events
  FOR INSERT WITH CHECK (TRUE);

-- Create realtime subscriptions for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE articles;
ALTER PUBLICATION supabase_realtime ADD TABLE analytics_events;
