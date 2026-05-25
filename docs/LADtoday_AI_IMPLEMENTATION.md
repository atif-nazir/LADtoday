# LADtoday AI Pipeline Implementation

Complete AI-powered article processing system with 10 specialized agents, security layer, and multi-platform distribution.

## Architecture Overview

### Backend Stack
- **Framework**: FastAPI with Python
- **AI Models**: Google Gemini 2.0 Flash & Pro
- **Database**: Supabase PostgreSQL
- **Security**: Lobster Trap PII/Injection detection
- **Integrations**: WordPress REST API, Facebook Graph API, Google Analytics

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **UI Components**: shadcn/ui with Tailwind CSS
- **Real-time Updates**: Supabase subscriptions
- **State Management**: React Query + Hooks

## 10 AI Agents Pipeline

### Core Processing Pipeline

1. **Scout Agent** 🔍
   - Analyzes source credibility
   - Evaluates publication metadata
   - Determines article category
   - Output: credibility_score, source_reliability, publication_date

2. **Intelligence Agent** 🧠
   - Extracts key points and entities
   - Identifies sentiment and topics
   - Fact-checking coordination
   - Output: key_points, entities, sentiment, topics

3. **Rewrite Agent** ✏️
   - Optimizes content clarity
   - Improves readability
   - Maintains tone consistency
   - Output: rewritten_content, clarity_score, readability_improvements

4. **SEO Agent** 🔗
   - Creates SEO-optimized titles (60 chars)
   - Generates meta descriptions (160 chars)
   - Identifies 5-8 keywords
   - Produces schema.org structured data
   - Output: seo_title, seo_description, seo_keywords

5. **Vision Agent** 👁️
   - Analyzes featured images
   - Generates alt text for accessibility
   - Suggests image captions
   - Evaluates visual quality
   - Output: image_analysis, alt_text, caption, quality_score

6. **Creative Agent** ✨
   - Generates short summaries (<50 words)
   - Creates medium summaries (<150 words)
   - Produces platform-specific content:
     - Twitter threads (3-5 tweets)
     - Instagram captions
     - LinkedIn posts
   - Output: short_summary, medium_summary, social_variants

7. **Account Manager Agent** 👤
   - Applies account-specific logic
   - Assigns categories and tags
   - Sets publish priority (0-10)
   - Recommends optimal schedule
   - Output: account_tags, category_id, publish_priority

8. **Publish Agent** 📤
   - Formats for WordPress
   - Prepares Facebook posts
   - Validates compliance
   - Generates distribution status
   - Output: publish_ready, platform_data, scheduled_time

9. **Analytics Agent** 📊
   - Predicts engagement (0-100)
   - Estimates reach
   - Recommends optimal publish time
   - Identifies performance factors
   - Output: predicted_engagement, predicted_reach, optimal_time

10. **Guardian Agent** 🛡️
    - Final compliance verification
    - Brand safety checks
    - Policy violation detection
    - Safety scoring
    - Output: safety_score, compliance_issues, final_approved

## DAG Execution Flow

```
Scout (independent start)
  ├─> Intelligence → Rewrite → SEO ┐
  ├─> Intelligence → Rewrite → Creative
  ├─> Intelligence → Account Manager ─→ Publish
  ├─> Vision (parallel with above)      Analytics
  └─> [Final] Guardian ← All above
```

## Security Layer: Lobster Trap Integration

All Gemini API requests are routed through Lobster Trap for:

- **PII Detection**: Identifies and masks personal information
  - Emails, phone numbers, SSNs, credit cards
  - Locations, names in sensitive contexts
  
- **Prompt Injection Prevention**: Detects malicious prompts
  - Template injection attempts
  - Code injection patterns
  - Jailbreak attempts

- **Policy Enforcement**: Validates against policies
  - Brand safety rules
  - Content compliance
  - Audit logging

## Database Schema

### Core Tables

**pipeline_runs**
- Tracks each article's processing journey
- Status tracking: pending → running → success/failed
- DAG state and agent results storage
- Real-time subscriptions enabled

**agent_executions**
- Detailed logs for each agent run
- Input/output data for debugging
- Execution time tracking
- Dependency resolution for DAG

**articles**
- Final processed articles
- SEO metadata
- Publishing status
- View counts and analytics

**lobstertrap_audit**
- Security event logging
- PII detection records
- Injection attempt logs
- Policy violation tracking

**connected_accounts**
- WordPress, Facebook, Google Analytics credentials
- Auto-publish configuration
- Integration status and health

**analytics_events**
- Page views, shares, clicks
- Referrer tracking
- User engagement metrics

## API Endpoints

### Pipeline Execution

```
POST /api/pipeline/execute
Request:
{
  "source_url": "https://example.com/article",
  "article_title": "Article Title",
  "article_content": "Full article content...",
  "featured_image_url": "https://example.com/image.jpg",
  "mock_mode": false
}

Response: PipelineRun with all agent results
```

### Monitoring

```
GET /api/pipeline/{run_id}
GET /api/pipeline/{run_id}/agents
```

### WordPress Integration

```
POST /api/integrations/wordpress/publish
POST /api/integrations/wordpress/categories
```

### Facebook Integration

```
POST /api/integrations/facebook/post
POST /api/integrations/facebook/schedule
GET /api/integrations/facebook/insights/{page_id}
```

### Google Analytics

```
GET /api/integrations/analytics/top-pages
GET /api/integrations/analytics/traffic-sources
```

## Setup Instructions

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys:
# - SUPABASE_URL and SUPABASE_KEY
# - GEMINI_API_KEY
# - LOBSTER_TRAP_API_KEY (optional, uses mock if not provided)
# - WORDPRESS_URL and WORDPRESS_API_KEY (optional)
# - FACEBOOK_API_KEY and API_SECRET (optional)
# - GOOGLE_ANALYTICS_KEY (optional)

# Run server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
# Install dependencies (already done in this repo)
npm install
# or
yarn install
# or
bun install

# Run development server
npm run dev

# Build for production
npm run build
```

### Database Setup

```bash
# Apply migrations (using Supabase CLI)
supabase db push

# Or manually run migrations in Supabase dashboard
# Copy SQL from: supabase/migrations/20260516_create_ai_pipeline_schema.sql
```

## Frontend Pages

### `/admin/ai-pipeline`
- Execute new pipelines
- Monitor pipeline runs
- View agent results in real-time
- 10 agent cards showing status

### `/admin/analytics`
- Pipeline success rate metrics
- Agent performance analytics
- Execution time trends
- Status distribution charts

### Real-time Updates
- Uses Supabase subscriptions
- Updates pipeline status live
- Agent execution logs stream
- No polling required

## Configuration & Environment Variables

### Required
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Supabase anonymous key
- `GEMINI_API_KEY`: Google Gemini API key

### Optional (with mock fallbacks)
- `LOBSTER_TRAP_API_KEY`: Lobster Trap security API
- `WORDPRESS_URL`: WordPress site URL
- `WORDPRESS_API_KEY`: WordPress REST API key
- `FACEBOOK_API_KEY`: Facebook Graph API key
- `FACEBOOK_API_SECRET`: Facebook API secret
- `GOOGLE_ANALYTICS_KEY`: Google Analytics API key

### Flags
- `MOCK_MODE`: Set to "True" for testing without APIs
- `DEBUG`: Set to "True" for verbose logging
- `ENVIRONMENT`: "production" or "development"

## Mock Data System

For development without real API credentials:

```python
# backend/.env
MOCK_MODE=True

# All services return realistic mock data:
# - Agents return valid JSON responses
# - Integration services return sample data
# - No external API calls made
```

## Development Tips

### Enable Mock Mode
```bash
# backend/.env
MOCK_MODE=True
ENVIRONMENT=development
```

### Test Pipeline Execution
```python
# Use the /admin/ai-pipeline page in React
# Or call API directly:
curl -X POST http://localhost:8000/api/pipeline/execute \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://example.com",
    "article_title": "Test Article",
    "article_content": "Test content...",
    "mock_mode": true
  }'
```

### Monitor in Real-time
- Open `/admin/ai-pipeline` page
- Execute a pipeline
- Watch agent cards update in real-time
- View detailed results in pipeline details modal

### Check Analytics
- Go to `/admin/analytics`
- View agent success rates
- Monitor execution times
- See pipeline status distribution

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy frontend (automatic)
5. Deploy backend separately to serverless function or external host

### Backend Deployment Options

- **Railway/Render**: Supports Python FastAPI natively
- **AWS Lambda**: Use Mangum ASGI adapter
- **DigitalOcean**: Docker deployment
- **Heroku**: Python Buildpack support

## Error Handling & Debugging

### Check Logs
```bash
# Frontend
- Browser DevTools Console
- Network tab for API calls

# Backend
- FastAPI auto-docs: http://localhost:8000/docs
- Terminal output for debug logs
```

### Common Issues

1. **"Backend not found"** → Ensure FastAPI server running on port 8000
2. **"Supabase connection failed"** → Check SUPABASE_URL and SUPABASE_KEY
3. **"Gemini API error"** → Verify GEMINI_API_KEY is valid
4. **"Real-time updates not working"** → Check Supabase realtime is enabled for tables

## Testing & Validation

### Unit Testing (Coming Soon)
```bash
cd backend
pytest tests/
```

### Integration Testing
- Use `/admin/ai-pipeline` to test full pipeline
- Monitor agent execution times
- Verify database records created
- Check real-time updates work

## Performance Considerations

### Optimization Tips

1. **Caching**: Implement caching for frequently accessed data
2. **Batch Processing**: Process multiple articles in queue
3. **Agent Parallelization**: Run independent agents concurrently
4. **Database Indexing**: Ensure indexes on frequently queried fields

### Monitoring

- Average execution time per agent
- Success rate by agent type
- Pipeline queue depth
- Database query performance

## Future Enhancements

1. **Scheduled Processing**: Queue articles for batch processing
2. **Custom Prompts**: Allow account-specific agent instructions
3. **A/B Testing**: Compare different AI model outputs
4. **Multi-language**: Support content in multiple languages
5. **Advanced Analytics**: Dashboard with detailed insights
6. **Webhook Support**: Send results to external systems

## Support & Documentation

### API Documentation
- Auto-generated Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Code Structure
```
backend/
  ├── agents/          # 10 AI agents
  ├── services/        # External integrations
  ├── config/          # Settings & configuration
  ├── models/          # Data schemas
  ├── main.py         # FastAPI application
  └── requirements.txt

src/
  ├── pages/           # React pages
  ├── components/      # Reusable components
  ├── hooks/           # React hooks (including pipeline)
  └── utils/           # Utility functions
```

## License & Credits

LADtoday AI Pipeline - Comprehensive article processing system powered by Google Gemini and Lobster Trap security.

Built with:
- Google Gemini 2.0
- Supabase
- Lobster Trap Security
- FastAPI
- React & Tailwind CSS
