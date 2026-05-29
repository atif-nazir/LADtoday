# Implementation Plan - Enforce Required Fields via Gemini JSON Schema

Ensure that all required output fields for Scout, Intelligence, and Trend Forecaster agents are generated directly by the Gemini models rather than relying on code-level fallbacks. This is achieved by defining the `required` array in the JSON schemas passed to `geminiJson`.

## User Review Required

> [!IMPORTANT]
> The JSON schemas sent to the Gemini API (`geminiJson`) currently do not contain the `required` properties list. This allows the model to omit them or output them as empty/null. Adding the `required` validation constraints at the JSON Schema level guarantees that Gemini will output all these fields in the returned JSON, preventing omissions. We will also refine prompt instructions to ensure they are populated with non-empty values.

## Proposed Changes

### 1. Scout Agent

#### [MODIFY] [scout/index.ts](file:///d:/Blogwebidea/blogweb/simple-sign-in/supabase/functions/scout/index.ts)
- Update the schema in `expandQueries` to mark `queries` as required.
- Update the schema in `scoreSources` to:
  - Mark all top-level keys (`sources`, `top_source_domain`, `overall_sentiment`, `content_density`, `recommended_angle`, `pakistan_relevance_score`, `scout_notes`) as required.
  - Mark all properties in each source item (`index`, `full_text`, `author`, `publish_date`, `credibility_score`, `recency_score`, `relevance_score`, `key_facts`, `sentiment`, `credibility_signals`) as required.
- Enhance the prompt inside `scoreSources` to instruct the model to never return empty strings or empty arrays for any properties.

---

### 2. Intelligence Agent

#### [MODIFY] [intelligence/index.ts](file:///d:/Blogwebidea/blogweb/simple-sign-in/supabase/functions/intelligence/index.ts)
- Update the schema in `extractIntelligence` to:
  - Mark all top-level keys (`key_facts`, `contradictions`, `entities`, `best_angle`, `angle_justification`, `learned_angle_type`, `content_brief`, `virality_score`, `virality_factors`, `noise_sources`, `trusted_sources`, `topic_complexity`, `reader_prerequisite`, `missing_perspectives`, `intelligence_confidence`) as required.
  - Mark all keys within `key_facts` items, `contradictions` items, and `entities` items as required.
- Refine the prompt to explicitly state that the model must generate actual, meaningful content for each field (specifically instructing it not to return empty values, empty arrays, or generic placeholders, even when there are 0 external sources).

---

### 3. Trend Forecaster Agent

#### [MODIFY] [trend-forecaster/index.ts](file:///d:/Blogwebidea/blogweb/simple-sign-in/supabase/functions/trend-forecaster/index.ts)
- Update the schema in `analyzeTrend` to:
  - Mark all top-level keys (`trend_momentum`, `trajectory`, `peak_prediction_hours`, `optimal_publish`, `optimal_publish_reason`, `breakout_angles`, `pakistan_relevance`, `pakistan_cities_impacted`, `pakistan_sectors_impacted`, `pakistan_angle`, `twitter_velocity`, `linkedin_interest`, `youtube_trend`, `seasonal_factor`, `recurring_pattern`, `oversaturation_risk`, `first_mover_advantage`, `competitor_coverage_estimate`, `evergreen_potential`, `news_peg`, `trend_rationale`) as required.
  - Mark all properties in the `breakout_angles` item schema (`angle`, `reason`, `urgency`, `search_query`) as required.
- Add explicit instructions in the prompt to ensure the model populates all fields with substantive, Pakistan-specific analysis.

---

## Verification Plan

### Automated / Manual Verification
- We will deploy the edge functions using `supabase functions deploy`.
- We will verify that each edge function builds and executes successfully.
- We will run the pipeline and inspect the output JSON for each of these three agents to verify that all properties are populated by the Gemini model without empty/null values.
