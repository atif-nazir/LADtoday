# LADtoday — All 10 Agents: Technical Specification

> Each agent runs as a **Supabase Edge Function** (Deno/TypeScript)
> All web access routes through **Bright Data**
> Inter-agent communication via **Supabase Realtime + PostgreSQL**

---

## AGENT OVERVIEW MAP

```
User Input (topic / URL / image)
         │
         ▼
┌─────────────────────────────────────────┐
│           ORCHESTRATOR AGENT            │  ← coordinates all others
│        supabase/functions/orchestrator  │
└─────────────────────────────────────────┘
         │
    ┌────┴────────────────────────────────────────┐
    │                PHASE 1: DISCOVER            │
    ▼                                             ▼
[AGENT 1]                                   [AGENT 2]
Scout Agent                             Intelligence Agent
- Bright Data SERP API                  - AI/ML API GPT-4o
- Bright Data Web Unlocker              - Contradiction detection
- Bright Data Scraping Browser          - Cognee memory recall
- Bright Data Web Scraper API           - Insight extraction
    │                                        │
    └────────────────┬───────────────────────┘
                     ▼
              [AGENT 3]
           Rewrite Agent
           - Gemini Flash
           - Human-style prose
           - Tone matching
                     │
         ┌───────────┴──────────────┐
         ▼                          ▼
    [AGENT 4]                  [AGENT 5]
    SEO Agent               Vision Agent
    - Keyword research       - Image sourcing
    - Meta generation        - Alt text
    - SERP snippets          - Visual captions
         │                          │
         └───────────┬──────────────┘
                     ▼
              [AGENT 6]
           Creative Agent
           - Headlines A/B
           - Hook generation
           - CTA variants
                     │
         ┌───────────┴──────────────┐
         ▼                          ▼
    [AGENT 7]                  [AGENT 8]
  Publish Agent           Guardian Agent
  - WordPress API          - Plagiarism check
  - Facebook Graph         - Fact verification
  - TriggerWare.ai         - APPROVED/FLAGGED
  - LinkedIn (via BD)      - Audit trail
         │                          │
         └───────────┬──────────────┘
                     ▼
    ┌────────────────┴────────────────┐
    ▼                                 ▼
[AGENT 9]                        [AGENT 10]
Analytics Agent              Account Manager
- Performance tracking       - Social monitoring
- Cognee storage             - Trend detection
- Revenue projection         - Competitive intel
```

---

## AGENT 1: SCOUT AGENT

### Role
The eye of the system. Discovers and extracts content from the live web using all four Bright Data products. This is the agent that "was impossible before Bright Data."

### Inputs
```typescript
interface ScoutInput {
  topic: string;           // "Pakistan interest rates"
  urls?: string[];         // optional specific URLs to scrape
  depth?: number;          // 1-3, how many levels to follow
  geo?: string;            // "pk" for Pakistan, "us" for US results
  mode: "serp" | "direct" | "js" | "structured";
}
```

### Outputs
```typescript
interface ScoutOutput {
  sources: {
    url: string;
    title: string;
    content: string;       // full extracted text
    publishedAt: string;
    sourceCredibility: number; // 0-1
    tool_used: "web_unlocker" | "serp" | "scraping_browser" | "scraper_api";
  }[];
  raw_html?: string;
  metadata: {
    total_sources: number;
    blocked_count: number;  // how many would have been blocked without Bright Data
    scrape_duration_ms: number;
  };
}
```

### Bright Data Tools Used

**1. SERP API** — Topic Discovery
```typescript
// Discover top 10 live URLs for any topic
async function serpDiscover(topic: string, geo = "pk") {
  const response = await fetch(
    `https://api.brightdata.com/serp/google/search?q=${encodeURIComponent(topic)}&gl=${geo}&num=10`,
    { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
  );
  const data = await response.json();
  return data.organic?.map((r: any) => ({
    url: r.link,
    title: r.title,
    snippet: r.snippet
  })) ?? [];
}
```

**2. Web Unlocker** — Scrape Any Site
```typescript
// Bypass bot detection on Reuters, Bloomberg, FT, LinkedIn etc.
async function scrapeWithUnlocker(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "x-brd-superproxy": "brd.superproxy.io:22225",
      "x-brd-product": "unlocker",
      "x-brd-customer": BRIGHTDATA_CUSTOMER_ID,
      "x-brd-zone": "unlocker",
      "Authorization": `Basic ${btoa(`${BRIGHTDATA_USERNAME}:${BRIGHTDATA_PASSWORD}`)}`
    }
  });
  return response.text();
}
```

**3. Scraping Browser** — JavaScript-Rendered Sites
```typescript
// Full browser for React/Angular sites (TechCrunch, The Verge, etc.)
async function scrapeBrowserPage(url: string): Promise<string> {
  const wsEndpoint = `wss://brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-scraping_browser:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;
  // Connect via puppeteer/playwright CDP protocol
  // Returns full rendered HTML after JS execution
}
```

**4. Web Scraper API** — Structured Data (LinkedIn, Amazon)
```typescript
// Pre-built scrapers for 660+ sites — returns clean JSON
async function scrapeLinkedInJobs(company: string) {
  const response = await fetch("https://api.brightdata.com/datasets/v3/trigger", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      dataset_id: "gd_l1viktl72bvl7bjuj0", // LinkedIn Jobs
      data: [{ keyword: company, location: "Pakistan" }]
    })
  });
  return response.json();
}
```

### Supabase Edge Function: Full Code
→ See `supabase/functions/scout-agent/index.ts`

---

## AGENT 2: INTELLIGENCE AGENT

### Role
The brain of the system. Takes raw scraped content from Scout, extracts insights, detects contradictions, and produces a structured intelligence brief. Uses AI/ML API for deep reasoning.

### Inputs
```typescript
interface IntelligenceInput {
  sources: ScoutOutput["sources"];
  topic: string;
  mode: "gtm" | "finance" | "security";
  recall_memory: boolean; // query Cognee for past performance
}
```

### Outputs
```typescript
interface IntelligenceOutput {
  brief: {
    summary: string;          // 3-sentence executive summary
    key_insights: string[];   // 4-6 numbered insights
    contradictions: {
      claim_a: string;
      claim_b: string;
      resolution: string;     // "Source A is 3 days newer, prefer claim A"
    }[];
    sentiment: "positive" | "negative" | "neutral" | "mixed";
    recommended_angle: string;// "Crisis framing will get 3x engagement (Cognee recall)"
    credibility_score: number; // 0-100
  };
  metadata: {
    model_used: string;
    tokens_used: number;
    cognee_memory_hits: number;
  };
}
```

### AI/ML API Integration (GPT-4o)
```typescript
async function analyzeWithAIML(sources: any[], topic: string) {
  const response = await fetch("https://api.aimlapi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${AIML_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: `You are the Intelligence Agent for LADtoday.
Your job: analyze multiple web sources and produce a structured intelligence brief.
Output ONLY valid JSON matching IntelligenceOutput["brief"] schema.
No markdown. No preamble.`
      }, {
        role: "user",
        content: `Topic: ${topic}\n\nSources:\n${JSON.stringify(sources.map(s => ({
          url: s.url,
          title: s.title,
          content: s.content.slice(0, 2000),
          credibility: s.sourceCredibility
        })))}`
      }],
      response_format: { type: "json_object" }
    })
  });
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

### Cognee Memory Integration
```typescript
// Store performance after each article published
async function storePerformanceMemory(article: any, performance: any) {
  const response = await fetch("https://api.cognee.ai/v1/add", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${COGNEE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: `Topic: ${article.topic} | Angle: ${article.angle} | Headline: ${article.headline} | Views: ${performance.views} | Engagement: ${performance.engagement_rate}%`,
      dataset_name: "ladtoday_performance"
    })
  });
}

// Recall successful patterns before generating
async function recallBestAngles(topic: string) {
  const response = await fetch("https://api.cognee.ai/v1/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${COGNEE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `successful content angles for ${topic}`,
      query_type: "INSIGHTS",
      dataset_name: "ladtoday_performance"
    })
  });
  return response.json();
}
```

### Supabase Edge Function: Full Code
→ See `supabase/functions/intelligence-agent/index.ts`

---

## AGENT 3: REWRITE AGENT

### Role
Transforms raw intelligence brief into publish-ready, human-quality prose. No AI-sounding language, no hallucinations (all facts grounded in Scout sources).

### Inputs
```typescript
interface RewriteInput {
  brief: IntelligenceOutput["brief"];
  tone: "professional" | "conversational" | "editorial" | "urgent";
  length: "short" | "medium" | "long"; // 400 / 800 / 1500 words
  target_audience: string;
}
```

### Outputs
```typescript
interface RewriteOutput {
  article: {
    headline: string;
    subheadline: string;
    body: string;           // full markdown article
    word_count: number;
    readability_score: number;
    tone_verified: boolean;
  };
}
```

### System Prompt
```
You are a senior editor at a world-class publication.
Rules:
1. Every factual claim MUST come from the provided brief — no invention
2. Never use: "In today's fast-paced world", "groundbreaking", "revolutionary", "leverage"
3. Write in active voice. Short sentences. Punchy paragraphs.
4. The first sentence must be a fact or a question — never a scene-setter
5. Output ONLY the article body in Markdown. No meta-commentary.
```

---

## AGENT 4: SEO AGENT

### Role
Optimizes content for search. Uses Bright Data SERP API to find real keyword data — not guesses.

### Key Operations
- Query SERP API for target keyword → extract People Also Ask, related searches
- Generate meta title (≤60 chars), meta description (≤160 chars)
- Suggest internal links, header structure
- Calculate estimated SERP position based on content quality

### Bright Data Usage
```typescript
// Find real "People Also Ask" questions for keyword optimization
async function getPeopleAlsoAsk(keyword: string) {
  const response = await fetch(
    `https://api.brightdata.com/serp/google/search?q=${encodeURIComponent(keyword)}&feature=paa`,
    { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
  );
  const data = await response.json();
  return data.people_also_ask ?? [];
}
```

---

## AGENT 5: VISION AGENT

### Role
Finds and processes images for articles. Uses Bright Data to scrape image licensing information.

### Operations
- Suggest image search queries based on article topic
- Verify image licensing status (scrape source page)
- Generate ALT text for accessibility + SEO
- Create image captions from article context

---

## AGENT 6: CREATIVE AGENT

### Role
Generates multiple headline variants, hooks, and CTAs. Runs A/B variants that will be tested via Analytics Agent.

### Outputs
```typescript
interface CreativeOutput {
  headlines: {
    variant: string;
    type: "question" | "number" | "shock" | "how-to" | "contrarian";
    predicted_ctr: number;
  }[];
  hooks: string[];          // first-sentence variants for social
  cta_variants: string[];   // "Read more" alternatives
  social_snippets: {
    twitter: string;
    linkedin: string;
    facebook: string;
  };
}
```

---

## AGENT 7: PUBLISH AGENT

### Role
Distributes finalized content to all connected platforms. Fires TriggerWare.ai events for workflow automation.

### Platform Integrations
```typescript
// WordPress REST API
async function publishToWordPress(article: any) {
  const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WP_JWT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: article.headline,
      content: article.body,
      excerpt: article.meta_description,
      status: "publish"
    })
  });
  return response.json();
}

// TriggerWare.ai — event-driven publish workflow
async function fireTriggerWare(article: any, platforms: string[]) {
  await fetch(TRIGGERWARE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "article_ready",
      article_title: article.headline,
      platforms,
      seo_score: article.seo_score,
      word_count: article.word_count,
      topic: article.topic,
      schedule: "immediate"
    })
  });
}
```

### TriggerWare.ai Workflow
```
Bright Data SERP detects trending topic spike
         ↓
TriggerWare trigger: "trending_detected"
         ↓
Scout Agent activates automatically
         ↓
Full 10-agent pipeline runs
         ↓
Article published to all platforms
         ↓
TriggerWare notify: Slack + email webhook
```

---

## AGENT 8: GUARDIAN AGENT

### Role
The compliance and brand safety layer. Every article MUST pass Guardian before Publish Agent runs. Uses Bright Data to cross-check claims against live sources.

### Decision States
- `APPROVED` — all checks passed, publish immediately
- `FLAGGED` — minor issues found, human review recommended
- `QUARANTINED` — critical issue (plagiarism, false claim, compliance violation)

### Checks Performed
```typescript
interface GuardianChecks {
  plagiarism: {
    score: number;         // 0-100, 0 = original
    matches: string[];     // URLs of similar content
    verdict: "pass" | "fail";
  };
  factual_accuracy: {
    claims_verified: number;
    claims_failed: number;
    failed_claims: string[];
  };
  compliance: {
    unsubstantiated_medical: boolean;
    unsubstantiated_financial: boolean;
    defamatory_content: boolean;
    pii_detected: boolean;
  };
  brand_safety: {
    sentiment: string;
    risk_level: "low" | "medium" | "high";
  };
  final_verdict: "APPROVED" | "FLAGGED" | "QUARANTINED";
  audit_log: string;       // timestamped decision trail
}
```

### Bright Data Plagiarism Check
```typescript
// Use Bright Data to search for copied content
async function checkPlagiarism(article: string): Promise<number> {
  // Take 3 distinctive sentences
  const sentences = extractDistinctiveSentences(article, 3);
  let maxSimilarity = 0;
  
  for (const sentence of sentences) {
    const results = await serpDiscover(`"${sentence.slice(0, 60)}"`, "us");
    if (results.length > 0) {
      maxSimilarity = Math.max(maxSimilarity, 0.8); // high similarity detected
    }
  }
  return maxSimilarity;
}
```

### Lobster Trap DPI Proxy
```typescript
// Intercept all outbound Gemini/AI calls for prompt injection detection
// All agent prompts pass through this before execution
async function lobsterTrapProxy(prompt: string): Promise<{
  safe: boolean;
  injection_detected: boolean;
  sanitized_prompt: string;
}> {
  const injectionPatterns = [
    /ignore previous instructions/i,
    /you are now/i,
    /forget everything/i,
    /act as/i,
    /jailbreak/i,
  ];
  
  const injection_detected = injectionPatterns.some(p => p.test(prompt));
  return {
    safe: !injection_detected,
    injection_detected,
    sanitized_prompt: injection_detected ? "[BLOCKED BY LOBSTER TRAP]" : prompt
  };
}
```

---

## AGENT 9: ANALYTICS AGENT

### Role
Tracks article performance, stores learnings in Cognee, projects revenue.

### Metrics Tracked
```typescript
interface ArticleAnalytics {
  article_id: string;
  views: number;
  unique_visitors: number;
  avg_time_on_page: number;
  bounce_rate: number;
  social_shares: {
    facebook: number;
    twitter: number;
    linkedin: number;
  };
  estimated_ad_revenue_pkr: number;
  engagement_rate: number;
  seo_position?: number;  // current SERP rank
}
```

### Revenue Projection Formula
```typescript
function projectRevenue(views: number): number {
  const RPM_PKR = 150; // PKR per 1000 views (Pakistan rate)
  return (views / 1000) * RPM_PKR;
}
```

---

## AGENT 10: ACCOUNT MANAGER AGENT

### Role
Monitors competitor activity, social mentions, and trending topics. Triggers Scout Agent when opportunities are detected.

### Monitoring Schedule
```
Every 15 minutes: SERP API check for topic velocity changes
Every 1 hour: Competitor blog scraping via Web Unlocker
Every 6 hours: LinkedIn hiring signal check via Web Scraper API
Real-time: TriggerWare.ai webhook listener for external triggers
```

### Competitor Monitoring
```typescript
async function monitorCompetitor(domain: string) {
  // Scrape competitor's sitemap to detect new posts
  const sitemap = await scrapeWithUnlocker(`${domain}/sitemap.xml`);
  const newPosts = parseSitemap(sitemap).filter(isNew);
  
  if (newPosts.length > 0) {
    // Fire TriggerWare event → Scout Agent responds
    await fireTriggerWare({ event: "competitor_posted", posts: newPosts });
  }
}
```

---

## DATABASE SCHEMA (Supabase PostgreSQL)

```sql
-- Articles table
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  headline TEXT,
  body TEXT,
  meta_description TEXT,
  seo_score INTEGER,
  word_count INTEGER,
  status TEXT DEFAULT 'draft', -- draft, approved, published, quarantined
  guardian_verdict TEXT,
  audit_log JSONB,
  bright_data_sources JSONB, -- array of sources with tool used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users
);

-- Agent runs table
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles,
  agent_name TEXT NOT NULL,
  status TEXT DEFAULT 'running', -- running, completed, failed
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  bright_data_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics table
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles,
  views INTEGER DEFAULT 0,
  engagement_rate NUMERIC,
  estimated_revenue_pkr NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bright Data usage tracking
CREATE TABLE bright_data_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool TEXT NOT NULL, -- serp_api, web_unlocker, scraping_browser, scraper_api
  url TEXT,
  success BOOLEAN,
  response_time_ms INTEGER,
  credits_used NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ORCHESTRATOR — THE CONDUCTOR

The Orchestrator is the single entry point. It receives user input, chains agents in sequence, handles failures, and streams progress via Supabase Realtime.

### Pipeline Sequence
```
[User Input]
     ↓
[Orchestrator] ──── creates article_id in DB
     ↓
[Scout Agent] ──── status: "discovering"
     ↓
[Intelligence Agent] ──── status: "analyzing"
     ↓
[Rewrite Agent] ──── status: "writing"
     ↓
[SEO Agent + Vision Agent] ──── parallel ──── status: "optimizing"
     ↓
[Creative Agent] ──── status: "creating variants"
     ↓
[Guardian Agent] ──── status: "compliance check"
     ↓
[Publish Agent] (if APPROVED) ──── status: "publishing"
     ↓
[Analytics Agent] ──── status: "tracking"
     ↓
[DONE] ──── article live, dashboard updated
```

### Estimated Runtime
- Scout (Bright Data): 8–15s
- Intelligence (AI/ML API): 4–8s
- Rewrite (Gemini): 3–5s
- SEO + Vision (parallel): 3–4s
- Creative: 2–3s
- Guardian: 4–6s
- Publish: 2–3s
- **Total: ~30–50 seconds end-to-end**
