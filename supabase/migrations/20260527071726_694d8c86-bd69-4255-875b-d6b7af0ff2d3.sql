
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  topic_category text,
  -- intelligence
  angle_type text,
  virality_score numeric,
  content_brief_style text,
  -- trend-forecaster
  predicted_momentum numeric,
  trajectory text,
  optimal_publish_recommended text,
  optimal_publish_correct boolean,
  -- competitor-intel
  gap_type text,
  differentiator_used text,
  opportunity_realized numeric,
  avg_category_views numeric,
  -- audience-listener
  pain_point_used text,
  share_emotion text,
  platform_used text,
  actual_fb_shares integer,
  -- news-wire
  was_breaking_predicted boolean,
  source_used text,
  -- research
  dominant_source_type text,
  citation_count integer,
  research_pattern text,
  actual_linkedin_shares integer,
  authority_score numeric,
  -- shared actuals
  actual_views_week1 integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_memory TO authenticated;
GRANT ALL ON public.agent_memory TO service_role;

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agent_memory"
  ON public.agent_memory FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_agent_memory_lookup
  ON public.agent_memory (agent_key, topic_category, created_at DESC);

-- Enable all Phase 1 agents
UPDATE public.agent_registry
SET enabled = true
WHERE phase = 'discover'
  AND key IN ('trend_forecaster','competitor_intel','audience_listener','news_wire','research');
