# LADtoday 50-Agent System - Quick Start Guide

## What You Just Got

A complete **50-agent intelligence swarm** that transforms raw topics into fully optimized, multi-platform, monetized content. All agents work together in a sophisticated DAG (directed acyclic graph) with phase-based parallelism.

## In 5 Minutes

### 1. Setup Environment Variables

Create `/vercel/share/v0-project/backend/.env`:

```env
# Required
GEMINI_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional (for integrations)
WORDPRESS_REST_API_URL=https://yoursite.com/wp-json
FACEBOOK_API_KEY=xxx
GOOGLE_ANALYTICS_VIEW_ID=xxx

# Development
MOCK_MODE=true  # Start with mock mode, no API keys needed
ENVIRONMENT=development
DEBUG=true
```

### 2. Apply Database Migrations

Connect your Supabase instance and run:

```bash
# Run in Supabase SQL Editor
-- First migration (base schema)
psql < supabase/migrations/20260516_create_ai_pipeline_schema.sql

-- Second migration (50-agent expansion)
psql < supabase/migrations/20260516_expand_to_50_agents.sql
```

### 3. Install & Run

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload

# Frontend (in new terminal)
cd ../
npm install
npm run dev
```

### 4. Test the System

```bash
# Execute the 50-agent pipeline
curl -X POST http://localhost:8000/api/pipeline/run-50-agents \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Pakistan fintech boom 2024"
  }'
```

### 5. View Dashboard

Open http://localhost:5173/admin/ai-pipeline

You'll see real-time updates as agents execute across 7 phases.

## What Each Agent Does

### Phase 1: DISCOVER (Gather Raw Intelligence)
- **Scout** (01): Ingest URLs, PDFs, CSVs, images
- **Intelligence** (02): Extract facts and content brief
- **Trend Forecaster** (03): Predict trends 72 hours ahead
- **Competitor Intel** (04): Analyze what competitors missed
- **Audience Listener** (05): Find real audience questions
- **News Wire** (06): Detect breaking news (< 4 hours)
- **Research** (07): Find authoritative sources (World Bank, SBP, IMF)

### Phase 2: ANALYZE (Validate & Structure)
- **Fact Checker** (08): Verify every claim (HIGH/MEDIUM/LOW confidence)
- **Bias Detector** (09): Detect 5 types of bias
- **Story Arc** (10): Design narrative structure
- **Quote Extractor** (11): Find quotable statements
- **Tone Calibrator** (12): Match your writing style
- **Localization** (13): Adapt for Pakistan audience
- **Headline Optimizer** (14): Generate 20 headline variants

### Phase 3: CREATE (Write & Optimize)
- **Rewrite** (15): Generate article (1,500+ words)
- **Vision** (16): Create 3 thumbnail concepts
- **SEO** (17): Optimize for search (with FAQ)
- **Readability** (18): Optimize reading level (Grade 6-8)
- **Internal Linking** (19): Link to your past articles
- **Schema Architect** (20): Add structured data for rich results
- **Excerpt** (21): Generate 8+ text variants (meta, Twitter, WhatsApp, etc.)

### Phase 4: MULTIMEDIA (Adapt to Every Format)
- **Creative** (22): Design thumbnails for each platform
- **Infographic** (23): Create data visualizations
- **Podcast Script** (24): Convert to audio script
- **Video Script** (25): Create YouTube/TikTok script
- **Short Form** (26): Generate 30-second Reels/TikTok scripts
- **Thread** (27): Write Twitter/X threads (8-12 tweets)
- **Carousel** (28): Create Instagram/LinkedIn carousels
- **Newsletter** (29): Format for email (with A/B subject lines)
- **WhatsApp** (30): Format for WhatsApp channels
- **Data Viz** (31): Generate interactive charts

### Phase 5: DISTRIBUTE (Publish & Amplify)
- **Account Manager** (32): Route content to right platforms
- **Publish** (33): Post to 6+ platforms simultaneously
- **Timing Intelligence** (34): Choose optimal publish time (Pakistan-aware)
- **Hashtag Strategy** (35): Platform-specific hashtags
- **Cross-Platform** (36): Platform-native content (different tone per platform)
- **Community** (37): Post to Quora, Reddit, Discord, Facebook Groups
- **Influencer Radar** (38): Identify & create outreach for influencers
- **Performance Predictor** (39): Forecast article performance (with confidence)
- **Syndication** (40): Publish to Medium, LinkedIn Articles, Google News

### Phase 6: MONETIZE (Unlock Revenue)
- **AdSense Optimizer** (41): Identify high-CPM content ($0.05-$3.00)
- **Affiliate Detector** (42): Find natural affiliate opportunities
- **Lead Magnet** (43): Generate email list growth content
- **Content Calendar** (44): Plan 30 days of content
- **Revenue Intelligence** (45): Show which content makes money

### Phase 7: OPERATE (Maintain & Learn)
- **Analytics** (46): Track performance across all platforms
- **Guardian** (47): Ensure security & compliance on all agents
- **Content Refresh** (48): Auto-update articles that are aging
- **Brand Safety** (49): Pre-publish legal review
- **Knowledge Base** (50): Build searchable knowledge about your niche

## Quick Examples

### Example 1: Single Topic to Full Content
```bash
curl -X POST http://localhost:8000/api/pipeline/run-50-agents \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "SBP announces new fintech regulations"
  }'
```

**Output (23-30 seconds later):**
- ✓ Article (1,500+ words, SEO optimized)
- ✓ Podcast script (8 min audio)
- ✓ Video script (YouTube/TikTok)
- ✓ 10 social media posts (Twitter, LinkedIn, Instagram, etc.)
- ✓ Email newsletter (with A/B subject lines)
- ✓ WhatsApp broadcast
- ✓ Performance forecast
- ✓ Monetization recommendations

### Example 2: Check Pipeline Progress
```bash
# Get status of run
curl http://localhost:8000/api/pipeline/{run_id}

# See which agents completed
curl http://localhost:8000/api/pipeline/{run_id}/agents
```

### Example 3: View Dashboard
Visit: http://localhost:5173/admin/ai-pipeline

See:
- Real-time agent execution status (phase by phase)
- Token usage (Flash vs Pro)
- Estimated time remaining
- Results preview

## Token Budget & Cost

### Full Pipeline (All 50 Agents)
- **Flash**: ~45,000 tokens/run
- **Pro**: ~17,000 tokens/run
- **Total**: ~62,000 tokens/run

### Free Tier (Gemini API)
- 50 Pro requests/day
- 14 Pro calls per pipeline = **3-4 full runs/day** max

### How to Get More Runs
1. **Enable Mock Mode** (development):
   ```env
   MOCK_MODE=true
   ```
   Returns instant results (no API calls)

2. **Use Reduced-Cost Mode** (production):
   Swap Phases 4-6 to use Flash instead of Pro
   → Gets you **6-8 runs/day** on free tier

## Security & Compliance

✓ **Lobster Trap Integration**: All Gemini calls routed through security proxy
- PII detection & masking
- Prompt injection prevention
- Policy enforcement
- Full audit trail

✓ **Brand Safety Agent**: Pre-publish legal review
- Defamation detection
- Compliance checking
- Cultural sensitivity review (Pakistan-specific)

✓ **Real-time Monitoring**: Guardian Agent validates all 50 agents

## Deployment

### Option 1: Local Development
```bash
npm run dev  # Starts both frontend and backend
```
Visit: http://localhost:5173

### Option 2: Vercel
```bash
vercel deploy --prod
```

### Option 3: Docker
```bash
docker-compose up
```

## Common Questions

**Q: Do I need all 50 agents?**
A: No. You can run:
- Just Phase 1-3 (Discover → Analyze → Create) for articles only
- Add Phase 4 for multimedia (podcasts, videos, social)
- Add Phase 5-6 for distribution & monetization
- Add Phase 7 for analytics & maintenance

**Q: Can I skip phases?**
A: Yes. Disable specific agents in `orchestrator_50_agents.py`

**Q: What if an agent fails?**
A: System logs the error and continues. Guardian Agent (47) ensures nothing breaks the entire pipeline.

**Q: How do I make Gemini calls more affordable?**
A: 
1. Use Mock Mode for testing
2. Use Flash for Phases 4-6 (less critical analysis)
3. Cache results (Supabase stores all outputs)
4. Run selective phases only

**Q: Can I customize agent behavior?**
A: Yes. Each agent is a Python class in `backend/agents/all_50_agents.py`. Modify the `run()` method.

## Next Steps

1. ✓ Set up environment variables
2. ✓ Apply database migrations
3. ✓ Start with `MOCK_MODE=true`
4. ✓ Run your first pipeline
5. ✓ Configure real Gemini API key
6. ✓ Add WordPress, Facebook, Google Analytics
7. ✓ Enable auto-publishing
8. ✓ Monitor analytics

## Support

- Specification: `LADtoday_50_AGENTS_SPEC.md`
- Implementation: `LADtoday_50_AGENTS_IMPLEMENTATION.md`
- Original Plan: `LADtoday_AI_IMPLEMENTATION.md`

Need help? Check the logs:
```bash
tail -f /var/log/ladtoday.log
```

Or review agent-specific output in Supabase dashboard.

---

**Ready to build?** Start with `npm run dev` and visit `/admin/ai-pipeline` 🚀
