-- 1. Add columns to pipeline_runs for new 10-agent architecture
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'gtm',
  ADD COLUMN IF NOT EXISTS tone text DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS length text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS final_article jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS guardian_verdict text,
  ADD COLUMN IF NOT EXISTS published_article_id uuid;

-- 2. Reset agent_registry to the 10 new agents
DELETE FROM public.agent_registry;

INSERT INTO public.agent_registry (key, name, phase, order_index, depends_on, model, enabled, description) VALUES
  ('scout',        'Scout',         'discover', 1,  ARRAY[]::text[],                            'gemini-2.5-flash', true, 'Bright Data SERP + Web Unlocker source discovery'),
  ('intelligence', 'Intelligence',  'analyze',  2,  ARRAY['scout']::text[],                     'gemini-2.5-flash', true, 'AI/ML GPT-4o brief + Cognee memory'),
  ('rewrite',      'Rewrite',       'create',   3,  ARRAY['intelligence']::text[],              'gemini-2.5-flash', true, 'Human-quality prose from brief'),
  ('seo',          'SEO',           'create',   4,  ARRAY['rewrite']::text[],                   'gemini-2.5-flash', true, 'Bright Data SERP keyword + meta'),
  ('vision',       'Vision',        'create',   5,  ARRAY['rewrite']::text[],                   'gemini-2.5-flash', true, 'Image recommendations + alt text'),
  ('creative',     'Creative',      'create',   6,  ARRAY['rewrite','seo']::text[],             'gemini-2.5-flash', true, 'Headlines, hooks, social snippets'),
  ('guardian',     'Guardian',      'analyze',  7,  ARRAY['rewrite','seo','creative']::text[],  'gemini-2.5-flash', true, 'Plagiarism + compliance + Lobster Trap'),
  ('publish',      'Publish',       'distribute',8, ARRAY['guardian']::text[],                  'gemini-2.5-flash', true, 'Insert into articles + TriggerWare webhook'),
  ('analytics',    'Analytics',     'operate',  9,  ARRAY['publish']::text[],                   'gemini-2.5-flash', true, 'Performance tracking + Cognee store'),
  ('account_manager','Account Manager','operate',10,ARRAY['publish']::text[],                   'gemini-2.5-flash', true, 'Competitor monitoring + trend detection');
