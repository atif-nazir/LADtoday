# LADtoday — 50-Agent Intelligence Swarm
## Complete Architecture, Deep Dive, and Enhancement Plan
### Built on the existing 10-agent foundation

---

> **How to read this document:**
> Agents 01–10 are your existing implementation (described briefly, refined).
> Agents 11–50 are the 40 new agents — each with full workflow, real contribution,
> prompt strategy, dependencies, and token budget.
> The enhancement plan at the end tells you exactly how to integrate all 50 into
> your existing codebase without breaking anything.

---

## The 50-Agent Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           LADtoday 50-Agent Swarm                            │
├──────────────┬───────────────┬────────────────┬──────────────────────────────┤
│ PHASE 1      │ PHASE 2       │ PHASE 3        │ PHASE 4                      │
│ DISCOVER     │ ANALYZE       │ CREATE         │ MULTIMEDIA                   │
│ 7 agents     │ 7 agents      │ 7 agents       │ 10 agents                    │
│ 01–07        │ 08–14         │ 15–21          │ 22–31                        │
├──────────────┴───────────────┴────────────────┴──────────────────────────────┤
│ PHASE 5       │ PHASE 6          │ PHASE 7                                   │
│ DISTRIBUTE    │ MONETIZE         │ OPERATE                                   │
│ 9 agents      │ 5 agents         │ 5 agents                                  │
│ 32–40         │ 41–45            │ 46–50                                     │
└───────────────┴──────────────────┴───────────────────────────────────────────┘
```

### The Dependency DAG (simplified)

```
01 Scout ──────────────────────────────────────┐
02 Intelligence ←── 01 ─────────────────────── │
03 Trend Forecaster (parallel with 01–02) ───── │
04 Competitor Intel (parallel with 01–02) ───── │
05 Audience Listener (parallel with 01–02) ──── │
06 News Wire (parallel with 01–02) ──────────── │
07 Research (parallel with 01–02) ───────────── │
                                                 │
                                                 ▼
08 Fact Checker ←── 01,02 ────────────────────── │
09 Bias Detector ←── 02 ──────────────────────── │
10 Story Arc ←── 02,03,05 ─────────────────────── │
11 Quote Extractor ←── 01,02 ──────────────────── │
12 Tone Calibrator ←── 02 (user samples) ───────── │
13 Localization ←── 02 ────────────────────────── │
14 Headline Optimizer ←── 10,12,13 ─────────────── │
                                                    │
                                                    ▼
15 Rewrite ←── 08,09,10,11,12,13,14 ─────────────────
16 Vision ←── 01 (if image input) ──────────────────
17 SEO ←── 15 ───────────────────────────────────────
18 Readability Optimizer ←── 15 ────────────────────
19 Internal Linking ←── 15 (all past articles) ─────
20 Schema Architect ←── 17 ─────────────────────────
21 Excerpt ←── 15,17,20 ────────────────────────────
                                                    │
                                                    ▼
22 Creative ←── 16,21 ──────────────────────────────
23 Infographic ←── 15 (data paragraphs) ────────────
24 Podcast Script ←── 15 ───────────────────────────
25 Video Script ←── 15,22 ──────────────────────────
26 Short Form ←── 14,21 ────────────────────────────
27 Thread ←── 15,21 ─────────────────────────────────
28 Carousel ←── 15,22 ──────────────────────────────
29 Newsletter ←── 15,21,22 ─────────────────────────
30 WhatsApp Broadcast ←── 21,26 ────────────────────
31 Data Viz ←── 02,23 ──────────────────────────────
                                                    │
                                                    ▼
32 Account Manager ←── 15,21 ───────────────────────
33 Publish ←── 32 ───────────────────────────────────
34 Timing Intelligence ←── 05,32 ───────────────────
35 Hashtag Strategy ←── 17,26,27 ───────────────────
36 Cross-Platform Adapter ←── 15,21 ────────────────
37 Community ←── 15,36 ─────────────────────────────
38 Influencer Radar ←── 03,04 ──────────────────────
39 Performance Predictor ←── 03,05,34 ──────────────
40 Syndication ←── 33 ───────────────────────────────
                                                    │
                                                    ▼
41 AdSense Optimizer ←── 17,33 ─────────────────────
42 Affiliate Detector ←── 15,17 ────────────────────
43 Lead Magnet ←── 15,21 ───────────────────────────
44 Content Calendar ←── 03,04,05,46 ────────────────
45 Revenue Intelligence ←── 41,42,46 ───────────────
                                                    │
                                                    ▼
46 Analytics ←── 33,40 ──────────────────────────────
47 Guardian ←── ALL ─────────────────────────────────
48 Content Refresh ←── 46 ──────────────────────────
49 Brand Safety ←── 15,33 ──────────────────────────
50 Knowledge Base ←── ALL published ────────────────
```

---

## PHASE 1: DISCOVER
### Agents 01–07 — The Intelligence Gathering Wing

---

### Agent 01 — Scout Agent *(existing, refined)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Flash | **Runs:** First, no dependencies

**Core job:** Be the platform's eyes and ears. Ingest anything the user throws at it — a topic keyword, a URL, a PDF, a CSV, an image — and return structured, deduplicated raw content ready for analysis.

**Workflow:**
```
INPUT: topic string / URL / PDF bytes / image bytes / CSV rows
1. Detect input type (regex pattern for URL, MIME type for files, else topic string)
2. Route to ingestor:
   - Topic string → Gemini grounding: web_search("site:reliable + {topic} last 30 days")
   - URL → httpx fetch → extract article body via readability algorithm
   - PDF → PyMuPDF extract text → chunk at 1,000 tokens
   - CSV → pandas parse → find text columns → process each row as source
   - Image → pass to Vision Agent downstream (flag: image_mode=True)
3. For each source: score credibility (domain trust heuristic), recency, relevance
4. Deduplicate: cosine similarity > 0.85 → keep higher-scored source
5. Return: [{title, url, full_text, author, publish_date, credibility_score, recency_score}]
```
**Output:** `scout_results` (3–7 sources, full text, metadata)
**Tokens:** ~800 Flash | **What's new:** Improved deduplication with similarity scoring

---

### Agent 02 — Intelligence Agent *(existing, refined)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Pro | **Depends on:** 01

**Core job:** Turn raw articles into editorial intelligence. Extract facts, detect contradictions, build the content brief that every downstream agent will reference.

**Workflow:**
```
INPUT: scout_results (up to 15,000 tokens of source content)
1. Build combined context: all articles concatenated with [SOURCE N] markers
2. Gemini Pro analyzes with structured output prompt
3. Extracts:
   - key_facts[]: 5–8 specific data-backed facts with source attribution
   - contradictions[]: conflicting claims with resolution recommendation
   - best_angle: most engaging story framing + justification
   - virality_score (1–10): based on emotional trigger, novelty, timeliness
   - noise_sources[]: indices to exclude (too old, spam, low credibility)
   - content_brief: 300-word writing instructions for Rewrite Agent
4. Passes full content_brief to all Phase 2 agents as shared context
```
**Output:** `intelligence_results` (content_brief, insights, contradictions)
**Tokens:** ~4,500 Pro | **What's new:** Explicit virality scoring passed to downstream agents

---

### Agent 03 — Trend Forecaster Agent *(NEW)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Flash | **Runs parallel with:** 01–02

**Why it exists:** Knowing what's trending now is reactive. Knowing what will trend in 72 hours is competitive advantage. This agent gives LADtoday publishers a head start over every competitor.

**Real contribution:** While Scout finds what exists and Intelligence understands it, Trend Forecaster answers a different question: *"Should we even write about this? And if yes — when?"* It transforms LADtoday from a content factory into an editorial strategist.

**Workflow:**
```
INPUT: user topic string
1. Query Gemini Flash with Google Trends grounding for:
   - Current search volume trajectory (rising/falling/stable)
   - Related breakout queries (queries up 5000%+)
   - Geographic interest map (is this topic big in Pakistan specifically?)
   - Seasonal pattern (does this topic spike annually at this time?)
2. Cross-reference with social velocity signals:
   - Estimate Twitter/X engagement velocity for topic
   - Reddit mention frequency heuristic
   - YouTube search trend signal
3. Score: trend_momentum (1–10), peak_prediction_days (est. days to peak),
   optimal_publish_window ("publish now" / "wait 24h" / "wait 48h")
4. Identify 3 related breakout angles:
   - Angle A: the obvious one (already trending)
   - Angle B: the adjacent (will trend next)
   - Angle C: the contrarian (gets attention by going opposite)
5. Return: trend_report with recommendations passed to Story Arc + Content Calendar
```

**Gemini prompt:**
```
You are a trends analyst for digital media in Pakistan.

Topic: "{topic}"
Today: {date}

Using your knowledge of search patterns, social media velocity, and news cycles:

1. Assess the current trending status of this topic
2. Predict whether interest will rise, peak, or decline in the next 72 hours
3. Identify 3 breakout sub-angles not yet widely covered
4. Score trend_momentum (1-10), where 10 = exploding right now
5. Recommend optimal publish timing

Return JSON:
{
  "trend_momentum": int,
  "trajectory": "rising|peaking|declining|stable",
  "peak_prediction_hours": int,
  "optimal_publish": "now|wait_24h|wait_48h",
  "breakout_angles": [
    {"angle": string, "reason": string, "urgency": "high|medium|low"}
  ],
  "pakistan_relevance": int (1-10),
  "seasonal_factor": string,
  "trend_rationale": string
}
```
**Output:** `trend_results` | **Tokens:** ~600 Flash | **Dashboard shows:** Trend momentum gauge, optimal publish window countdown

---

### Agent 04 — Competitor Intelligence Agent *(NEW)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Flash | **Runs parallel with:** 01–02

**Why it exists:** You can't win a content game you're not tracking. Pakistani publishers have 3–5 direct competitors publishing on the same topics. If a competitor published on your topic 2 hours ago, you either need a better angle or a different story.

**Real contribution:** This agent ensures LADtoday never publishes a "me too" article. It either differentiates the approach or flags to the user that the topic is already saturated and suggests a gap.

**Workflow:**
```
INPUT: user topic + user's competitor URLs (stored in Supabase, set in Accounts settings)
1. If competitor URLs configured:
   a. Check each competitor site for recent articles on this topic (last 7 days)
   b. Scrape competitor article titles + first 200 words
   c. Score their SEO strength (estimate based on domain authority heuristic)
   d. Identify what angle they took + what they missed
2. If no competitors configured:
   a. Use Gemini to identify likely top competitors for the niche
   b. Same scraping process
3. Generate differentiation brief:
   - What competitors covered: [list]
   - What they missed: [list of content gaps]
   - Recommended unique angle: string
   - Publish urgency: "first-mover" / "differentiate" / "skip-topic"
4. Pass differentiation_brief to Story Arc Agent + Content Calendar Agent
```

**Gemini prompt:**
```
You are a competitive intelligence analyst for digital media.

Topic: "{topic}"
Competitors recently published: {competitor_titles_and_excerpts}

Analyze what these competitors have covered and return:
{
  "topics_covered": [string],
  "content_gaps": [string],
  "unique_angle": string,
  "differentiation_strategy": string,
  "urgency": "first_mover|differentiate|skip",
  "skip_reason": string (only if urgency=skip)
}
```
**Output:** `competitor_results` | **Tokens:** ~700 Flash | **Dashboard shows:** Competitor coverage map, gap analysis card

---

### Agent 05 — Audience Listener Agent *(NEW)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Flash | **Runs parallel with:** 01–02

**Why it exists:** The best content answers questions real people are already asking. This agent mines the audience's own words — from comments, social posts, Q&A sites — and brings those exact questions, phrases, and pain points into the article.

**Real contribution:** Articles written with Audience Listener's output use the exact language the target audience uses. This improves: SEO (matches search queries), relatability (feels written for them), engagement (answers real questions). Scout Agent finds what publishers say — Audience Listener finds what readers want.

**Workflow:**
```
INPUT: user topic
1. Simulate audience research using Gemini with grounding:
   - "What are people asking about {topic} on Reddit/Quora/Twitter?"
   - "What are the most common complaints about {topic}?"
   - "What misconceptions exist about {topic}?"
   - "What questions about {topic} have no good answers yet?"
2. Extract:
   - audience_questions[]: 8–12 real-sounding questions (verbatim-style)
   - pain_points[]: 3–5 frustrations the audience has
   - vocabulary[]: exact phrases the audience uses (not jargon)
   - content_gaps[]: questions with no satisfying answer online
   - emotional_triggers[]: what makes the audience react (fear, hope, outrage, curiosity)
3. Build audience_profile: age estimate, knowledge level, primary motivation
4. Pass audience_questions to SEO Agent (FAQ section) + Story Arc + Headline Optimizer
```

**Gemini prompt:**
```
You are an audience research specialist for Pakistani digital media.

Topic: "{topic}"

Research the audience for this topic and extract:
{
  "audience_profile": {
    "age_range": string,
    "knowledge_level": "beginner|intermediate|expert",
    "primary_motivation": string
  },
  "top_questions": [string] (8 questions in the audience's own words),
  "pain_points": [string] (3-5 frustrations),
  "vocabulary": [string] (phrases the audience actually uses),
  "emotional_triggers": [string],
  "content_gaps": [string] (unanswered questions online)
}
```
**Output:** `audience_results` | **Tokens:** ~500 Flash | **Dashboard shows:** Audience profile card, top questions list

---

### Agent 06 — News Wire Agent *(NEW)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Flash | **Runs parallel with:** 01–02

**Why it exists:** Breaking news can't wait for a Scout Agent crawl cycle. Some topics need wire-speed monitoring — when something happens (SBP announcement, SECP ruling, stock movement), LADtoday should surface it instantly, not 6 hours later.

**Real contribution:** For Pakistani publishers, being first on a breaking story is the difference between 50,000 views and 500 views. News Wire Agent monitors specific beat categories (fintech, politics, cricket, economy, tech) and injects breaking context into any article on those topics.

**Workflow:**
```
INPUT: topic category tag(s) from user settings (e.g., ["fintech", "economy"])
1. Run Gemini grounding search: "breaking news {topic} last 4 hours"
2. Check for:
   - Official statements (government, SBP, SECP, PMEX, PSX)
   - Agency wire items (Reuters Pakistan, Dawn Breaking)
   - Press releases from relevant companies
3. Score time-sensitivity: breaking (< 4h), fresh (4-24h), context (1-7d)
4. For BREAKING items:
   - Generate urgent alert: "⚡ BREAKING: [summary]"
   - Flag to Publish Agent: "priority publish, skip scheduling queue"
   - Suggest 2-sentence news brief format (publish in 5 min, full article follows)
5. For FRESH/CONTEXT items:
   - Add to Scout results as supplementary source
   - Tag as: "breaking_context" so Rewrite Agent can use as intro hook
6. Send breaking_alert to user dashboard in real-time
```
**Output:** `wire_results` | **Tokens:** ~400 Flash | **Dashboard shows:** Real-time wire ticker on dashboard header

---

### Agent 07 — Research Agent *(NEW)*
**Phase:** DISCOVER | **Model:** Gemini 2.0 Pro | **Runs parallel with, enriches:** 02

**Why it exists:** Blog posts are written. Authoritative articles are cited. Research Agent goes beyond web content to find: government data, academic papers, official statistics, World Bank/IMF reports, and Pakistan Bureau of Statistics releases that give articles citation-worthy depth.

**Real contribution:** It transforms fluffy content into authoritative content. An article about Pakistan fintech with SBP statistics, World Bank rankings, and IMF projections cited properly gets backlinks, shares from professionals, and ranks higher on Google. Scout finds blog posts; Research finds the primary sources those blogs should have cited.

**Workflow:**
```
INPUT: topic + key_facts from Intelligence Agent (specific claims needing sources)
1. For each key_fact that needs official backing:
   a. Identify the most authoritative source type (government, academic, NGO, media)
   b. Search: "{fact}" site:sbp.org.pk OR site:worldbank.org OR site:imf.org
   c. Find stat, report title, publication date, page number
   d. Format as proper citation: (Source, Year, Page/URL)
2. Find 2–3 data points NOT in Scout's articles that strengthen the argument
3. Look for: counter-arguments with official backing (for balance)
4. Compile research_brief:
   - verified_statistics[]: fact + source + citation
   - authority_sources[]: title, org, year, URL
   - recommended_citations[]: formatted references
5. Flag any Scout facts with LOW confidence for Fact Checker Agent
```

**Why Pro here:** Citation matching requires careful reasoning — a Flash model might hallucinate sources. Pro is worth the spend because a wrong citation would damage credibility.

**Output:** `research_results` | **Tokens:** ~2,500 Pro | **Dashboard shows:** Source credibility tree with citation badges

---

## PHASE 2: ANALYZE
### Agents 08–14 — The Editorial Brain

---

### Agent 08 — Fact Checker Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Pro | **Depends on:** 01, 02, 07

**Why it exists:** AI-generated content's biggest liability is stating something confidently that is simply wrong. Judges know this. Enterprise clients know this. Fact Checker Agent is what separates LADtoday from a toy and makes it publishable at scale.

**Real contribution:** Every specific claim (numbers, dates, names, policy details) in the Intelligence Agent's output gets verification-scored before it reaches the writer. High-confidence facts go in as facts. Low-confidence facts become "reportedly" or are held for Research Agent verification. Claims that contradict reliable knowledge are flagged or removed.

**Workflow:**
```
INPUT: key_facts[] from Intelligence Agent + verified_statistics from Research Agent
1. For each fact in key_facts:
   a. Classify fact type: statistic / date / name / policy / event / quote
   b. Cross-reference against Research Agent's verified sources
   c. Score confidence: HIGH (matches authority source) / MEDIUM (multiple sources agree,
      no authority source) / LOW (single source, no corroboration) / DISPUTED
2. For DISPUTED facts:
   a. Try Gemini grounding: search for confirmation
   b. If still unverified: generate "reportedly" framing
   c. If contradicted: FLAG and remove from content_brief
3. For STATISTICS specifically:
   a. Check: is the number plausible? (sanity check via Gemini reasoning)
   b. Check: is the date recent enough? (stats older than 2 years flagged)
   c. Check: is the unit correct? (millions vs billions, PKR vs USD)
4. Generate fact_audit_report:
   - approved_facts[]: high/medium confidence → ready to publish
   - flagged_facts[]: disputed or unverified → needs human review
   - removed_facts[]: contradicted or implausible → do not publish
   - confidence_scores{}: per-fact score
5. Pass fact_audit_report to Rewrite Agent (only approved_facts published)
```
**Output:** `fact_check_results` | **Tokens:** ~2,000 Pro | **Dashboard shows:** Fact confidence breakdown, flagged claims highlighted in red

---

### Agent 09 — Bias Detector Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Pro | **Depends on:** 02

**Why it exists:** Scraped sources have biases. Aggregating biased sources produces biased content. This is a compliance requirement for enterprise media, and a major differentiation for a "trust layer" product. Judges evaluating Lobster Trap / Veea integration will love this.

**Real contribution:** Detects 5 types of bias in source material before writing begins: (1) political framing, (2) source selection bias (all pro or all against), (3) representation bias (only quoting certain demographics), (4) recency bias (only recent positive news), (5) cultural bias (Western-centric framing for Pakistani topic). Produces a balance_directive that the Rewrite Agent follows.

**Workflow:**
```
INPUT: full source texts + content_brief from Intelligence Agent
1. Analyze each source for:
   - Political lean: government-friendly vs opposition-friendly
   - Economic lean: pro-business vs consumer-advocacy
   - Gender representation in quoted sources
   - Urban vs rural framing (Lahore/Karachi vs rest of Pakistan)
   - Foreign vs domestic framing
2. Compute overall_bias_score (0 = neutral, 1 = heavily biased)
3. Generate balance_directive:
   - "Add perspective from: [missing viewpoint]"
   - "Balance the positive claims with: [counterpoint]"
   - "Avoid framing X as the only solution"
   - "Include the impact on [underrepresented group]"
4. For high bias_score (> 0.6):
   - Alert user: "Sources skew [left/right/pro-business]. Auto-balanced."
   - Rewrite Agent instructed to actively balance
5. Pass bias_report + balance_directive to Rewrite Agent
```
**Output:** `bias_results` | **Tokens:** ~1,800 Pro | **Dashboard shows:** Bias meter visualization, balance directive summary

---

### Agent 10 — Story Arc Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Pro | **Depends on:** 02, 03, 05

**Why it exists:** Good facts poorly structured = unread article. Story Arc Agent is the architect who decides: what structure makes this topic most compelling to read? Should it be a problem-solution arc? A surprising journey? An inverted pyramid? A listicle? The answer depends on the topic, audience, and platform — and this agent decides it.

**Real contribution:** Reduces the Rewrite Agent's cognitive burden by pre-computing the narrative blueprint. The Rewrite Agent just fills in a structure rather than inventing one. This improves consistency and article quality significantly.

**Workflow:**
```
INPUT: content_brief, audience_profile, trend_report, competitor_results
1. Evaluate topic type:
   - Explainer (how does X work?) → define, contextualize, example, implication
   - Analysis (why did X happen?) → background, event, factors, consequence, outlook
   - Opinion/commentary → hook, claim, 3 arguments, counterargument, conclusion
   - News report → who/what/when/where → why matters → what next
   - Listicle → intro problem, N solutions, ranked, conclusion with CTA
   - Deep dive → scene-setting, thesis, evidence, counter, synthesis
2. Consider: audience knowledge level (beginner vs expert changes structure)
3. Consider: trend_momentum (breaking news → inverted pyramid, evergreen → deep dive)
4. Consider: what competitor did NOT do (from competitor_results)
5. Output story_blueprint:
   - structure_type: string (e.g., "problem-agitation-solution")
   - sections[]: [{heading, purpose, content_points[], target_words}]
   - hook_type: "stat" / "question" / "scene" / "controversy" / "quote"
   - recommended_tone: "urgent" / "analytical" / "conversational" / "authoritative"
   - word_count_target: int
   - subheading_count: int
```
**Output:** `story_arc` | **Tokens:** ~1,500 Pro | **Dashboard shows:** Story blueprint visual with section cards

---

### Agent 11 — Quote Extractor Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Flash | **Depends on:** 01, 02

**Why it exists:** Direct quotes from real sources are what separate journalism from summarization. Real quotes add credibility, create pull quotes for social sharing, and help AI detection tools score the content as human-authored. This agent mines the raw source material for the most quotable, shareable statements.

**Real contribution:** A 700-word article with 2–3 well-chosen quotes from real experts or officials is fundamentally more credible and more shareable than an article with zero direct attribution. Quote Extractor finds those quotes so the Rewrite Agent can incorporate them naturally.

**Workflow:**
```
INPUT: scout_results (full source texts)
1. Scan all source texts for:
   a. Direct quotes (text in quotation marks + attribution)
   b. Official statements (from government officials, executives, regulators)
   c. Data-backed statements ("According to X, the figure is Y")
   d. Contrarian/surprising statements (disagreements, critiques)
2. Score each quote:
   - authority_score: who said it? (regulator > executive > analyst > blogger)
   - freshness_score: how recent?
   - shareability_score: is it punchy, surprising, or actionable?
   - pullquote_potential: does it work as a standalone visual quote?
3. Select top 3–5 quotes across different authority levels
4. Flag: attribution format for each (full name + title + organization)
5. Generate pullquote_texts[]: formatted for social media overlays (≤ 120 chars)
6. Pass selected_quotes to Rewrite Agent + Carousel Agent
```
**Output:** `quote_results` | **Tokens:** ~600 Flash | **Dashboard shows:** Quote cards with attribution badges

---

### Agent 12 — Tone Calibrator Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Pro | **Depends on:** 02, user samples

**Why it exists:** "Professional voice" and "casual voice" are vague labels. Every publisher's voice is unique. Tone Calibrator learns from the user's existing published articles (if provided) and produces a precise style guide that the Rewrite Agent can follow to match their existing voice exactly.

**Real contribution:** This is what makes LADtoday produce content that sounds like YOU, not like a generic AI. Publishers who use this feature will find their generated articles indistinguishable from their manually written ones — which is the entire value proposition.

**Workflow:**
```
INPUT: user's brand_voice config + 1–3 sample articles (stored in Supabase, optional)
1. If sample_articles provided (up to 3):
   a. Analyze writing style:
      - Average sentence length (words)
      - Paragraph length (sentences)
      - Vocabulary complexity (Flesch grade)
      - Punctuation patterns (em dashes? Oxford commas? Exclamation marks?)
      - Pronoun usage (we/you/they/I)
      - Transition phrase library (what words does this writer use between ideas?)
      - Hook patterns (how do they open articles?)
      - CTA patterns (how do they close articles?)
   b. Produce style_fingerprint (Gemini Pro analysis)
2. If no samples: use brand_voice config to select template fingerprint
3. Generate style_guide:
   - sentence_length_target: "mix short (5–8w) with medium (15–20w)"
   - preferred_transitions: [list of 10 transition phrases to use]
   - avoid_phrases: [list of 10 phrases that clash with their style]
   - opening_pattern: "Start with a question OR a surprising statistic"
   - closing_pattern: "End with a call to action + forward-looking statement"
   - formality_score: int (1–10)
4. Pass style_guide to Rewrite Agent + all content-generating agents
```
**Output:** `tone_profile` | **Tokens:** ~2,000 Pro | **Dashboard shows:** Style fingerprint visualization

---

### Agent 13 — Localization Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Flash | **Depends on:** 02

**Why it exists:** Generic AI content is globally bland. Pakistani audiences respond to content that speaks their context — local companies as examples, Pakistani rupee for currency, Pakistani city names, references to SECP/SBP/FBR for regulatory context, local cultural references that make readers nod. Localization Agent injects this authentically, not as a tokenistic afterthought.

**Real contribution:** Adds cultural and geographic specificity that dramatically improves reader connection and platform SEO (Google Pakistan ranks locally relevant content higher for Pakistani searches). Also handles language switching between English, Roman Urdu, and Urdu.

**Workflow:**
```
INPUT: content_brief + audience_profile + user language setting
1. For ENGLISH articles:
   a. Identify generic global examples → replace with Pakistan-equivalent
      ("like Amazon" → "like Daraz"; "like Uber" → "like Careem")
   b. Identify currency → convert to PKR where relevant
   c. Identify regulatory references → add Pakistani equivalent
      ("the central bank" → "the State Bank of Pakistan (SBP)")
   d. Identify cultural analogies that won't land → replace with local
   e. Find 1–2 Pakistan-specific statistics to add (from Research Agent output)
2. For URDU / ROMAN URDU articles:
   a. Generate full translation brief
   b. Flag: loanwords that stay in English (fintech, startup, app, online)
   c. Flag: culturally sensitive framing (religion, politics)
   d. Select: formal Urdu (newspaper) vs conversational Roman Urdu (social)
3. Generate localization_brief:
   - replacements[]: {global_term → local_equivalent}
   - local_examples[]: Pakistan-specific examples to inject
   - currency_note: how to present money figures
   - regulatory_context: relevant Pakistani regulatory bodies
   - language_instructions: for Urdu/Roman Urdu output
4. Pass to Rewrite Agent
```
**Output:** `localization_brief` | **Tokens:** ~800 Flash | **Dashboard shows:** Localization map (what was replaced/added)

---

### Agent 14 — Headline Optimizer Agent *(NEW)*
**Phase:** ANALYZE | **Model:** Gemini 2.0 Flash | **Depends on:** 10, 12, 13

**Why it exists:** Headlines determine 80% of readership. The best article with a weak headline gets ignored. The Rewrite Agent writes a good headline — but the Headline Optimizer generates 20 variants, scores each, and picks the best one for each platform. It also A/B tests across Account Manager's routing destinations.

**Real contribution:** Every article gets a platform-specific headline. The WordPress blog gets an SEO headline. The Facebook post gets a curiosity-gap headline. The Twitter/X thread gets a bold claim headline. This alone can 2–3x CTR versus a single headline used everywhere.

**Workflow:**
```
INPUT: story_arc, content_brief, trend_results, audience_profile, platform list
1. Generate 20 headline variants using different formulas:
   - SEO formula: [primary keyword] + [benefit/outcome] (for WordPress)
   - Curiosity gap: "The one thing Pakistani [audience] don't know about X" (social)
   - Number-led: "7 reasons X is changing Y in Pakistan" (listicle engagement)
   - Bold claim: "X is dead. Here's what's replacing it." (Twitter)
   - Question hook: "Is Pakistan's fintech boom real or hype?" (engagement bait)
   - Data-led: "[stat]% of [group] are [surprising finding]" (authority)
   - Story lead: "How [person/company] [did something] and changed [field]"
   - Negative angle: "Why X is failing to [deliver on promise]" (controversy)
2. Score each variant:
   - CTR_score (predicted click-through rate)
   - SEO_score (keyword match, length 50–60 chars)
   - shareability_score (would I share this?)
   - platform_fit_score (per platform norms)
3. Select: best headline per platform
4. Tag A/B pairs for Account Manager routing
5. Pass headline_set to Rewrite Agent + Publish Agent
```
**Output:** `headline_set` | **Tokens:** ~700 Flash | **Dashboard shows:** Headline leaderboard with scores

---

## PHASE 3: CREATE
### Agents 15–21 — The Writing Workshop

---

### Agent 15 — Rewrite Agent *(existing, significantly enhanced)*
**Phase:** CREATE | **Model:** Gemini 2.0 Pro | **Depends on:** 08, 09, 10, 11, 12, 13, 14

**Now receives from 7 upstream analysis agents instead of just 2.** The result is dramatically better articles — factually verified, culturally localized, structurally blueprinted, stylistically matched to the user's voice, with pre-selected quotes embedded.

**Enhanced workflow:**
```
INPUT: fact_checked approved_facts + balance_directive + story_blueprint
       + selected_quotes + style_guide + localization_brief + headline_set
1. Follow story_blueprint structure section-by-section
2. Apply style_guide for sentence patterns, transitions, opening/closing
3. Embed verified quotes naturally at narrative high-points
4. Apply localization_brief replacements as writing proceeds
5. Follow balance_directive for counterpoints
6. Target word_count from story_arc
7. Generate: article_html, meta_desc, social_caption, email_version
8. Self-review pass: check balance_directive was followed, all quotes attributed
```
**Output:** `rewrite_results` | **Tokens:** ~5,500 Pro | **Enhancement:** 7x richer context = 7x better article quality

---

### Agent 16 — Vision Agent *(existing, enhanced)*
**Phase:** CREATE | **Model:** Gemini 2.0 Pro (multimodal) | **Depends on:** 01 (if image)

*Now additionally analyzes article content to generate richer thumbnail concepts.*

**Enhancement:** Receives story arc + headline to generate 3 thumbnail concepts (not just 1) — each aligned to a different headline variant. Creative Agent then chooses the best match.

**Tokens:** ~1,800 Pro

---

### Agent 17 — SEO Agent *(existing, now split — core keyword work stays here)*
**Phase:** CREATE | **Model:** Gemini 2.0 Flash | **Depends on:** 15

*Now receives audience_questions from Audience Listener for richer FAQ section.*

**Enhancement:** FAQ section now directly answers the top 5 audience questions identified by Agent 05 — making it both more useful and more likely to win Featured Snippets.

**Tokens:** ~1,200 Flash

---

### Agent 18 — Readability Optimizer Agent *(NEW)*
**Phase:** CREATE | **Model:** Gemini 2.0 Flash | **Depends on:** 15

**Why it exists:** A 700-word article written for a Grade 12 reading level will lose the majority of Pakistan's digital audience. Readability Optimizer ensures the article is readable at the right level for the target audience without dumbing down the substance.

**Real contribution:** Runs a proper Flesch-Kincaid analysis, identifies problematic paragraphs (too long, passive voice overuse, jargon density), and rewrites those specific sections while leaving the rest intact. This is surgical editing, not a full rewrite.

**Workflow:**
```
INPUT: article_html + audience_profile (knowledge level)
TARGET: Grade 6–8 for general audience, Grade 9–11 for professionals
1. Compute Flesch-Kincaid score (Python textstat library or Gemini)
2. Identify problem areas:
   a. Sentences > 30 words → flag for breaking
   b. Paragraphs > 100 words → flag for splitting
   c. Passive voice > 20% → flag sentences
   d. Jargon density > 5 technical terms per paragraph → flag
   e. Transition word frequency < 15% → flag (poor flow)
3. For each flagged section: call Gemini Flash to rewrite just that section
4. Re-score: verify improvement
5. Generate readability_report:
   - before_score: int, after_score: int
   - changes_made[]: list of improvements
   - problem_sections: highlighted in article
6. Return: optimized_article_html + readability_report
```
**Output:** `readability_results` | **Tokens:** ~1,000 Flash | **Dashboard shows:** Readability before/after gauge

---

### Agent 19 — Internal Linking Agent *(NEW)*
**Phase:** CREATE | **Model:** Gemini 2.0 Flash | **Depends on:** 15 + Supabase articles table

**Why it exists:** Internal linking is one of the most undervalued SEO techniques. It keeps readers on the site, distributes page authority, and reduces bounce rate. But finding the right existing articles to link to requires reading your entire content archive — which humans skip. This agent does it automatically.

**Real contribution:** Every new article gets 3–5 contextually relevant internal links to previously published articles. Over time, this builds a content graph that compounds SEO value across the entire publication. No human editor would do this consistently; an agent does it every time.

**Workflow:**
```
INPUT: article_html + all previously published articles (titles + URLs from Supabase)
1. Load article index from Supabase (title, slug, focus_keyword, published_at)
2. For each paragraph in new article:
   a. Extract key entities and topics
   b. Semantic search against article index (Gemini Flash similarity)
   c. If match found (relevance > 0.7): propose internal link
3. Select top 3–5 internal links (spread across article, not clustered)
4. Generate link_insertions[]:
   - {paragraph_index, anchor_text, target_url, relevance_score}
5. Apply insertions to article HTML: wrap anchor text in <a href>
6. Also generate: 2 "You might also like" recommendations for article footer
7. Pass linked_article_html to downstream agents
```
**Output:** `linking_results` | **Tokens:** ~800 Flash | **Value compounds:** Gets more valuable with every new article published

---

### Agent 20 — Schema Architect Agent *(NEW, split from SEO Agent)*
**Phase:** CREATE | **Model:** Gemini 2.0 Flash | **Depends on:** 17, 18, 19

**Why it exists:** The original SEO Agent handles basic Article + FAQ schema. Schema Architect handles the full range of structured data types that Google actually uses for rich results: Recipe, HowTo, Event, ProductReview, BreadcrumbList, VideoObject, PodcastEpisode. Each content type gets its optimal schema.

**Real contribution:** Rich results (star ratings, FAQ dropdowns, HowTo steps in search) have 30–40% higher CTR than plain blue links. Schema Architect identifies which rich result type applies and generates perfect JSON-LD for it.

**Workflow:**
```
INPUT: optimized_article_html + content type classification
1. Determine content type from story_arc:
   - News report → NewsArticle schema
   - How-to guide → HowTo schema + BreadcrumbList
   - Data analysis → Article + Dataset
   - Product mention → ProductReview (if relevant)
   - Event coverage → Event schema
   - Video content → VideoObject
2. Extract structured data elements from article:
   - For HowTo: parse numbered steps into stepArray
   - For Event: extract date, location, organizer
   - For FAQ: extract all Q&A pairs (from SEO Agent's FAQ section)
3. Generate complete JSON-LD block (validated against schema.org spec)
4. Generate OpenGraph meta tags (og:title, og:description, og:image, og:type)
5. Generate Twitter Card meta tags
6. Combine: schema_block (complete <head> injection for WordPress)
```
**Output:** `schema_block` | **Tokens:** ~600 Flash | **Value:** Direct path to Google rich results

---

### Agent 21 — Excerpt Agent *(NEW)*
**Phase:** CREATE | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 17, 20

**Why it exists:** Every article needs 12 different text snippets for 12 different contexts: meta description (155 chars), OG description (200 chars), Twitter summary (240 chars), email preview text (90 chars), WhatsApp link preview (60 chars), Google Business post (1,500 chars), internal CMS excerpt (300 chars), and more. The Rewrite Agent produces one article — Excerpt Agent produces the full distribution text kit.

**Real contribution:** Eliminates the manual work of resizing the same text for every platform. Publishers typically skip this step and use a truncated excerpt everywhere — which hurts CTR on every platform. This agent does it properly, in one pass.

**Workflow:**
```
INPUT: article_html + meta_description + headline_set
1. Generate all excerpt variants:
   - meta_description: 140–155 chars, includes primary keyword, benefit-led
   - og_description: 195–200 chars, more descriptive
   - twitter_summary: 220–240 chars, punchy, with emoji if brand voice allows
   - email_preview: 85–95 chars (appears in inbox before open)
   - whatsapp_preview: 55–65 chars (displays in link preview)
   - cms_excerpt: 280–320 chars (WordPress excerpt field)
   - google_snippet: 290–310 chars (optimized for Featured Snippet)
   - intro_teaser: 60 chars (push notification copy)
2. Generate 3 social share copy variants per platform (Facebook, Twitter, LinkedIn)
3. Generate email subject line (for Newsletter Agent) + pre-header text
4. Return: complete excerpt_kit{} with all variants labeled
```
**Output:** `excerpt_kit` | **Tokens:** ~700 Flash | **Dashboard shows:** Platform preview simulator (shows how article looks shared on each platform)

---

## PHASE 4: MULTIMEDIA
### Agents 22–31 — The Content Studio

---

### Agent 22 — Creative Agent *(existing, enhanced)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 16, 21

*Now receives 3 thumbnail concepts from Vision Agent and selects the best-performing option based on headline variant scoring from Headline Optimizer.*

**Enhancement:** Generates thumbnail in 4 platform dimensions simultaneously, not sequentially.

---

### Agent 23 — Infographic Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Pro | **Depends on:** 15 (data paragraphs)

**Why it exists:** Data-heavy paragraphs in articles are hard to read and easy to skip. The same data as an infographic gets 3x more shares than a text article. Infographic Agent identifies the data spine of the article and produces a detailed spec for a visual designer (or a Canva template).

**Real contribution:** Produces two outputs: (1) a fully-specced infographic layout description that a designer can execute in Canva in 20 minutes, and (2) a simplified HTML/CSS representation for the LADtoday article itself (a basic chart or comparison table that renders in the browser).

**Workflow:**
```
INPUT: article_html, key_facts, research_results
1. Identify data elements in article:
   - Comparative data (before/after, X vs Y, multiple options)
   - Sequential data (steps, timelines, growth over time)
   - Statistical data (percentages, rankings, measurements)
   - Categorical data (types, categories, classifications)
2. Select the single most "infographic-worthy" data set
3. Determine infographic type:
   - Comparative → side-by-side table or bar chart
   - Sequential → timeline or numbered flow
   - Statistical → pie chart or data dashboard
   - Categorical → icon grid or comparison matrix
4. Generate infographic_spec:
   - type: string
   - title: string (headline of infographic)
   - data_points[]: {label, value, unit, color_suggestion}
   - visual_layout: detailed description (for Canva)
   - color_palette: 3 hex codes consistent with brand
5. Generate HTML/CSS chart: simple inline chart for article embed
6. Generate: standalone infographic as shareable asset spec
```
**Output:** `infographic_spec + inline_chart_html` | **Tokens:** ~1,500 Pro | **Dashboard shows:** Inline chart preview

---

### Agent 24 — Podcast Script Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 15

**Why it exists:** Pakistan's podcast audience has grown 4x since 2022. Publishers who produce both text and audio reach a fundamentally different and larger audience. Podcast Script Agent converts any article into a ready-to-record podcast episode script in minutes.

**Real contribution:** Podcast adaptation isn't just reading the article aloud — it requires a conversational opening, narrative transitions ("So here's the interesting part..."), listener-addressed framing ("If you're listening to this, you probably already know..."), ad break markers, and a spoken CTA. This is non-trivial work that most publishers skip because it takes 2 hours. Agent 24 does it in seconds.

**Workflow:**
```
INPUT: article_html, key_facts, selected_quotes, audience_profile
1. Convert article structure to podcast structure:
   - Cold open: 15-second hook (most surprising fact or question)
   - Intro: "Welcome to [show name]. Today we're covering [topic]." (30 sec)
   - Context segment: background for listeners who don't know the topic (90 sec)
   - Main content: article body adapted for ears not eyes (5–8 min)
     → Replace bullet points with verbal enumeration ("first... second... third...")
     → Add transitions: "Now here's where it gets interesting..."
     → Add listener asides: "Think about that for a second..."
   - Quote segment: read selected_quotes with attribution (60 sec)
   - Controversy segment: if contradiction detected, present both sides (60 sec)
   - [AD BREAK MARKER]
   - Conclusion: summary + listener CTA (60 sec)
   - Outro: "Thanks for listening. Find the full article at [URL]."
2. Add stage directions: [PAUSE], [EMPHASIZE], [SLOWER], for TTS or human reader
3. Estimate total runtime: word_count / 130 wpm = minutes
4. Generate show_notes: bullet summary for podcast platform description
5. Generate podcast_title: different from article headline (ear-friendly)
```
**Output:** `podcast_script` | **Tokens:** ~1,200 Flash | **Dashboard shows:** Runtime estimate, downloadable .txt script

---

### Agent 25 — Video Script Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 22

**Why it exists:** YouTube is the second largest search engine. A well-structured video script from every article means the same content multiplies across YouTube and Facebook Video with minimal incremental effort.

**Real contribution:** Not just a script — a full video production brief: hook (first 30 seconds to prevent skip), B-roll suggestions at each major point, on-screen text suggestions, chapter timestamps for YouTube, and a thumbnail concept (coordinated with Creative Agent's output).

**Workflow:**
```
INPUT: article_html, key_facts, thumbnail_url from Creative Agent
1. Structure video script:
   - Hook (0:00–0:30): MOST surprising fact or question. Fast cut energy.
     → "Before I tell you about X, let me show you something that shocked me."
   - Problem setup (0:30–1:30): Why this matters. Build tension.
   - Main content (1:30–6:00): article body adapted for video
     → Every 45-60 seconds: new section, cut, or visual change (viewer retention)
     → B-roll suggestion per section: "[B-ROLL: smartphone showing JazzCash app]"
     → On-screen text: "[TEXT OVERLAY: 17M active wallets]"
   - Resolution (6:00–7:00): answer the hook question, deliver the value
   - CTA (7:00–7:30): subscribe / comment / link in bio / read full article
2. Generate chapter_markers[]: timestamps + chapter titles for YouTube
3. Generate thumbnail_brief: building on Creative Agent's image (add text overlay)
4. Generate description_text: SEO-optimized YouTube/Facebook video description
5. Estimate runtime based on speaking pace (120 wpm standard)
```
**Output:** `video_script` | **Tokens:** ~1,100 Flash | **Dashboard shows:** Script viewer with chapter markers

---

### Agent 26 — Short Form Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 14, 21

**Why it exists:** TikTok, Instagram Reels, and YouTube Shorts are where 18–30 year old Pakistani audiences live. A 30–60 second hook script from every article means LADtoday publishers can feed the short form machine without additional creative work.

**Real contribution:** Short form content has a fundamentally different grammar than long form: hook in 3 seconds (not 30), visual action from frame one, no "welcome to my channel" introductions. This agent understands that grammar and applies it.

**Workflow:**
```
INPUT: headline_set, excerpt_kit, key_facts (top 3 most surprising)
1. Select the most surprising single fact or insight from key_facts
2. Structure 3 script variants:
   VARIANT A — "Reaction hook":
   "I just found out [surprising fact]. Let me explain why that matters."
   → 3 bullet points, each 1 sentence
   → "Follow for more [topic] insights"
   
   VARIANT B — "Question hook":
   "[Question that the audience's answer to is wrong?]"
   → Reveal: "Actually, it's [correct answer]. Here's why."
   
   VARIANT C — "Countdown hook":
   "[N] things about [topic] that nobody tells you. Number [N]..."
   → Rapid fire, punchy, one sentence per item
3. For each variant:
   - Word count: 90–120 words (30-40 sec at 3 words/sec)
   - On-screen text suggestions: [TEXT: key stat] at key moments
   - Sound suggestion: trending audio note (genre, energy level)
   - Hashtag pack: 5 hashtags (from Hashtag Strategy Agent)
4. Select best variant based on trend_results (what format is trending?)
```
**Output:** `shortform_scripts` | **Tokens:** ~600 Flash | **Dashboard shows:** Script cards, each with estimated engagement score

---

### Agent 27 — Thread Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 21

**Why it exists:** Twitter/X threads on good topics go viral. A 10-tweet thread covering the article's insights can reach 10–100x the audience of a single link post. Thread Agent breaks any article into a perfectly structured Twitter/X thread with the right hook, information density, and CTA.

**Real contribution:** Thread writing has specific mechanics: hook tweet must standalone, each tweet must end with a "reason to read next" feeling, numbered for navigation (1/10, 2/10...), final tweet links to full article. This is a skill most content teams lack — the agent has it baked in.

**Workflow:**
```
INPUT: article_html, selected_quotes, key_facts, headline_set
THREAD LENGTH: 8–12 tweets
1. Tweet 1 (Hook): Most surprising claim + "thread 🧵" + "1/N"
   Rule: Must work as a standalone tweet. Must create urgency to read on.
2. Tweets 2–3 (Context): Background. Why does this topic exist?
3. Tweets 4–7 (Meat): Key insights, one per tweet. Each tweet:
   - One clear point
   - Supporting data or quote
   - ≤ 240 characters
4. Tweet 8 (Turning point): The contradiction or controversy
5. Tweets 9–10 (Resolution): What it means, what to watch
6. Tweet 11 (Key quote): Best pull quote from Quote Extractor
7. Tweet 12 (CTA): "Full article at [link]. Follow for daily [topic] insights."
8. Generate: thread as array of tweet objects [{tweet_number, text, char_count}]
9. Validate: each tweet ≤ 280 chars, thread total ≤ 12 tweets
10. Tag tweet with relevant mentions if brand config includes them
```
**Output:** `thread_tweets[]` | **Tokens:** ~800 Flash | **Dashboard shows:** Thread preview with copy buttons per tweet

---

### Agent 28 — Carousel Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 22

**Why it exists:** LinkedIn and Instagram carousels (swipeable slide series) generate 3x more engagement than single-image posts. They work as mini-presentations of the article's key points. Carousel Agent produces the full slide content spec: text per slide, layout direction, image prompt per slide.

**Real contribution:** Without this agent, publishers skip the carousel format entirely because it requires designing 8–10 slides individually. Carousel Agent produces the complete content spec in structured JSON that can feed directly into a Canva API call or a custom slide renderer.

**Workflow:**
```
INPUT: article_html, key_facts, selected_quotes, infographic_spec
CAROUSEL LENGTH: 6–10 slides
1. Slide 1 (Cover): Headline + key visual hook. Make them swipe.
2. Slide 2 (Problem): One sentence. The pain point this article solves.
3. Slides 3–7 (Content): One key insight per slide:
   - Slide title (5 words max)
   - Body text (20–30 words)
   - Supporting data point or quote
   - Background: should be image, solid color, or gradient (specify)
4. Slide 8 (Contrast/Surprise): The contradiction or twist
5. Slide 9 (Takeaway): What the reader should do or think now
6. Slide 10 (CTA): "Follow @[handle] for daily [topic] insights. Link in bio."
7. For each slide: generate image_prompt (for Imagen API or manual creation)
8. Generate: carousel_spec[] — array of slide objects:
   {slide_number, title, body, quote, image_prompt, background_color, text_color}
9. Platform variants: Instagram square (1080×1080) + LinkedIn landscape (1200×628)
```
**Output:** `carousel_spec` | **Tokens:** ~900 Flash | **Dashboard shows:** Carousel preview with swipeable cards

---

### Agent 29 — Newsletter Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 21, 22

**Why it exists:** Email newsletters consistently deliver 5–10x higher engagement than social media posts. Every article should simultaneously fuel the publisher's email list. Newsletter Agent formats the article into a properly structured email newsletter ready for Mailchimp, Beehiiv, Substack, or a custom solution.

**Real contribution:** Email formatting has different rules than web formatting: no wide images, short paragraphs, clear CTA buttons, minimal styling for deliverability. Newsletter Agent knows these rules and applies them. It also handles the email subject line and preview text (Excerpt Agent provides these) for optimal open rates.

**Workflow:**
```
INPUT: article_html, excerpt_kit, thumbnail_url, selected_quotes
1. Format newsletter HTML:
   - Email-safe HTML (no flexbox, no CSS Grid, table-based layout)
   - Preheader text (from excerpt_kit.email_preview)
   - Header: logo + newsletter name
   - Hero image: resized thumbnail (600px wide max)
   - Greeting: "Hello [first_name]," (Mailchimp merge tag)
   - Opening hook: first 2 paragraphs (grab attention before "above fold")
   - [READ MORE BUTTON] → links to full article
   - Key insights section: 3 bullet points (for skim readers)
   - Selected quote: formatted as blockquote
   - Footer: unsubscribe link, address, social icons
2. Generate subject_line variants (3): from Headline Optimizer's headline_set
3. Generate A/B test plan: subject A vs subject B → winner by open rate
4. Format: Mailchimp-ready HTML template + plain text fallback
5. Estimate send time (from Timing Intelligence Agent)
6. Return: newsletter_html + subject_lines[] + send_instructions
```
**Output:** `newsletter_package` | **Tokens:** ~800 Flash | **Dashboard shows:** Email preview with desktop/mobile toggle

---

### Agent 30 — WhatsApp Broadcast Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 21, 26

**Why it exists:** WhatsApp has 60M+ users in Pakistan — more than any social platform. WhatsApp Channels and broadcast lists are the most direct content distribution channel in the country. Yet no content platform supports proper WhatsApp formatting. This is a genuine competitive moat for LADtoday.

**Real contribution:** WhatsApp content has strict constraints: no HTML, emojis as visual separators, asterisks for bold (*bold*), paragraphs of maximum 3 lines, a link at the end. It's a completely different format. Failing to format properly means content gets ignored or looks amateurish in WhatsApp.

**Workflow:**
```
INPUT: excerpt_kit, key_facts (top 3), article_url, headline_set
FORMAT RULES: Plain text only, emojis as visual hierarchy, <4000 chars total
1. Structure broadcast message:
   📌 *{headline}*
   
   {2-sentence hook using most surprising fact}
   
   Here's what you need to know:
   
   📊 {key fact 1} 
   💡 {key fact 2}
   ⚡ {key fact 3}
   
   {1-sentence context + why it matters for Pakistani audience}
   
   🔗 Full story: {article_url}
   
   💬 Share with anyone interested in {topic_tag}

2. Generate 3 variants:
   - Formal (for professional broadcast lists)
   - Casual (for general audience channels)
   - Breaking news (for news-focused channels — urgency framing)
3. Check length: ≤ 900 chars for each (WhatsApp channel best practice)
4. Include WhatsApp status variant (< 700 chars, single-paragraph)
5. Include forwarding-friendly version (reads well even without context)
```
**Output:** `whatsapp_content` | **Tokens:** ~500 Flash | **Dashboard shows:** WhatsApp message preview with copy button

---

### Agent 31 — Data Visualization Agent *(NEW)*
**Phase:** MULTIMEDIA | **Model:** Gemini 2.0 Flash | **Depends on:** 02 (research data), 23

**Why it exists:** If the article contains data (and after Research Agent + Fact Checker, it will), a proper inline chart or data table makes the article visually credible and more shareable. This agent generates the actual HTML/CSS/JS visualization code for embedding in WordPress.

**Real contribution:** Produces working, embeddable HTML charts using Chart.js or pure CSS — no external dependencies. These charts are unique (generated from the article's data), can't be found elsewhere, and give the article original visual content that search engines index as unique.

**Workflow:**
```
INPUT: infographic_spec + key_facts (numeric data points)
1. Select best visualization type for the data:
   - Time series → line chart
   - Comparison → bar chart or grouped bars
   - Parts of a whole → donut chart
   - Single striking number → big number card
   - Table data → responsive HTML table with zebra striping
2. Extract data: labels[], values[], units, source attribution
3. Generate Chart.js embed code:
   - Self-contained: all JS inline
   - Responsive: scales to mobile
   - Accessible: aria labels + table fallback
   - Branded: use user's primary + accent colors
4. Generate: chart_html_embed (paste into WordPress article)
5. Generate: standalone chart image prompt (for Creative Agent to render as PNG)
6. Generate: chart caption text + source attribution line
```
**Output:** `chart_embed_html` | **Tokens:** ~700 Flash | **Dashboard shows:** Live chart preview

---

## PHASE 5: DISTRIBUTE
### Agents 32–40 — The Publishing Machine

---

### Agent 32 — Account Manager Agent *(existing, enhanced)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 21

*Now receives platform-specific content from Multimedia phase (thread, carousel, newsletter, WhatsApp) and routes each to its correct destination.*

**Enhancement:** Routes 8 content formats to their respective platforms simultaneously, not just one article to multiple WordPress sites.

---

### Agent 33 — Publish Agent *(existing, enhanced)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 32

*Now handles 6 publishing destinations: WordPress, Facebook, X/Twitter thread, LinkedIn carousel, email newsletter trigger, WhatsApp broadcast.*

**Enhancement:** Each platform gets its specific optimized content from the Multimedia agents — not a resized copy of the same text.

---

### Agent 34 — Timing Intelligence Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 05, 32

**Why it exists:** Publishing a great article at 3 AM PST when your audience is asleep means 90% of your potential reach is lost. Timing Intelligence analyzes audience activity patterns per platform and per topic to recommend the optimal publish window — and auto-schedules if the current time is suboptimal.

**Real contribution:** For a Pakistani audience: Facebook engagement peaks 8–10 AM and 8–11 PM PKT. LinkedIn peaks Tuesday–Thursday 9 AM–12 PM. WhatsApp channels perform best 7–9 PM. Missing these windows costs 40–60% of potential reach. This agent never misses them.

**Workflow:**
```
INPUT: audience_profile, platform_list, current_time (PKT)
1. Load timing model per platform + Pakistan audience:
   - Facebook: 8–10 AM PKT or 8–11 PM PKT (peak days: Mon–Thu)
   - LinkedIn: Tue–Thu, 9 AM–12 PM PKT
   - Twitter/X: 9 AM–11 AM or 5 PM–7 PM PKT
   - WordPress (SEO): any time (Google crawls continuously)
   - Email: Tue–Thu, 9–10 AM PKT (open rate optimization)
   - WhatsApp: 7–9 PM PKT (evening reading habit)
2. For BREAKING NEWS (from News Wire Agent): override all timing → publish now
3. For evergreen content: find next optimal window per platform
4. Generate scheduling_plan:
   [{platform, publish_time, timezone: "PKT", delay_minutes}]
5. If current time is within 30 min of optimal: publish now
6. Else: add to Supabase scheduled_posts table
7. Return: scheduling_plan + reason per platform
```
**Output:** `scheduling_plan` | **Tokens:** ~400 Flash | **Dashboard shows:** Timeline view of scheduled posts

---

### Agent 35 — Hashtag Strategy Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 17, 26, 27

**Why it exists:** Random hashtags = invisible. Strategic hashtags = discoverability. Hashtag Strategy Agent generates platform-specific, research-backed hashtag sets — not just keyword-hashtags but a mix of niche, medium, and reach tags optimized for each platform's algorithm.

**Real contribution:** Each platform has a different hashtag strategy. Twitter: 1–3 hashtags max, highly relevant. Instagram: 8–15 hashtags, mix of 50K–500K post tags. LinkedIn: 3–5 professional hashtags. TikTok: 3–5 trending + 2 niche. Using the wrong strategy on the wrong platform actively hurts reach.

**Workflow:**
```
INPUT: topic, key_facts, trend_results, platforms list
1. Generate hashtag sets per platform:
   INSTAGRAM (15 tags):
   - 2 mega tags (>1M posts): broad awareness (#pakistan, #business)
   - 5 large tags (100K–1M): category reach (#fintech, #startups)
   - 5 medium tags (10K–100K): niche relevance (#pakistanfintech, #sbp)
   - 3 small tags (<10K): hyper-niche (#easypaisa, #jazzCash)
   
   TWITTER/X (3 tags):
   - 1 trending tag (if topic is trending)
   - 1 evergreen category tag
   - 1 brand/community tag
   
   LINKEDIN (5 tags):
   - Professional/industry tags only
   - Mix of professional community + topic
   
   TIKTOK (6 tags):
   - 2–3 trending tags
   - 2 niche tags
   - 1 challenge/community tag
2. Score each tag: estimated_reach, competition_level, trending_status
3. Flag: tags to AVOID (shadowban risk, off-topic, toxic associations)
4. Return: hashtag_sets{platform: tags[]} with usage instructions
```
**Output:** `hashtag_sets` | **Tokens:** ~500 Flash | **Dashboard shows:** Hashtag packs with estimated reach per tag

---

### Agent 36 — Cross-Platform Adapter Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 21

**Why it exists:** Every platform has norms, not just technical differences. LinkedIn posts should sound professional and provide industry insight. Facebook posts should be emotionally relatable. Twitter should be direct and punchy. Posting the same text everywhere violates platform culture and tanks engagement.

**Real contribution:** Receives the core article and excerpt kit, then generates a platform-native version of the intro text for each platform — same substance, completely different framing, tone, and structure. Users can still override, but the default is platform-perfect.

**Workflow:**
```
INPUT: article_html, excerpt_kit, headline_set, audience_profile
FOR EACH PLATFORM:
  FACEBOOK:
  - Tone: conversational, emotionally relatable, Pakistani cultural references
  - Structure: 2-3 short paragraphs + question to drive comments
  - "What's your take on this?" CTA
  - Include link preview (OG image auto-selected)
  
  LINKEDIN:
  - Tone: professional insight, business value, forward-looking
  - Structure: bold insight → context → 3 bullet takeaways → CTA
  - "What are you seeing in your industry?" CTA
  
  INSTAGRAM CAPTION:
  - Tone: visual-first, curiosity-led, hashtag-heavy
  - Structure: hook (1 line) → 2-3 lines context → "link in bio" CTA
  - Emoji use: moderate, purposeful
  
  MEDIUM / LINKEDIN ARTICLES:
  - Full article reformatted for publication platform
  - Add author bio + publication tags
  
OUTPUT: adapted_content{platform: {headline, body, cta}} for each platform
```
**Output:** `adapted_content` | **Tokens:** ~800 Flash | **Dashboard shows:** Side-by-side platform preview

---

### Agent 37 — Community Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 36

**Why it exists:** Organic distribution through communities (Reddit, Quora, Facebook groups, Discord servers, niche forums) is the highest-trust traffic source. A link from r/Pakistan or a detailed Quora answer linking to your article can drive more qualified traffic than 10x the Facebook ad spend. Community Agent generates authentic participation content for these spaces.

**Real contribution:** Community content must not feel promotional — it must provide genuine value and organically reference the article. Community Agent understands this and writes contributions that sound like helpful community members, not spammers.

**Workflow:**
```
INPUT: article_html, audience_questions, key_facts, target_communities (from user config)
1. For QUORA:
   - Find target questions matching audience_questions (from Audience Listener)
   - Write 200-word answer that genuinely addresses the question
   - Reference article naturally: "I wrote a deeper analysis of this at [link]"
   - Tone: expert but approachable, non-promotional
2. For REDDIT (r/Pakistan, r/pakfinance, r/PakistanTech):
   - Identify if article fits a community's rules (no self-promotion in some subs)
   - Write post as genuine contribution: "Found these stats surprising, thought
     this community would find them useful: [3 bullet points] [link to article]"
   - Generate comments-starter: a question to drive replies
3. For Facebook Groups:
   - Group-appropriate intro: acknowledge the community context
   - Short teaser: 2 sentences + "Full breakdown at [link]"
4. For Industry Forums / Discord:
   - Technical depth: assume higher knowledge level
   - Lead with insight, not with link
5. Return: community_posts{platform: {content, communities, posting_notes}}
```
**Output:** `community_posts` | **Tokens:** ~800 Flash | **Dashboard shows:** Community post drafts with posting checklist

---

### Agent 38 — Influencer Radar Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 03, 04

**Why it exists:** One retweet from a 50,000-follower Pakistani tech influencer is worth more than 10,000 Facebook impressions. Influencer Radar identifies who should see this article, why they would care, and generates a personalized outreach message the publisher can send with one click.

**Real contribution:** Influencer collaboration at scale. Most publishers don't do influencer outreach because it's time-consuming to research, draft, and send individual messages. This agent makes it a 30-second task instead of a 30-minute one.

**Workflow:**
```
INPUT: topic, trend_results, competitor_results
1. Identify influencer categories for this topic:
   - For fintech: Pakistani fintech founders, SBP officials on social, banking journalists
   - For tech: startup community leads, venture capitalists in Pakistan
   - For business: ICAP members, business journalists, MBA community
2. Generate target profile (not specific names, but persona descriptions):
   - "Follows Pakistan fintech news closely, 15K–100K followers,
     tweets about startup ecosystem, based in Lahore or Karachi"
3. For each influencer type: generate personalized outreach template:
   - Subject: personal, specific to their content area
   - Body: mention their recent work (placeholder: [their recent tweet/post])
   - Offer: "I wrote this piece I think your audience would value" + link
   - Ask: "Would love your take" (not "please share") — lower barrier
4. Generate list of suggested places to find these influencers:
   - "Search Twitter for 'Pakistan fintech' accounts with 10K+ followers"
   - "Check PakLaunch.pk community"
5. Return: outreach_templates[] + target_profile_descriptions[] + finder_guide
```
**Output:** `outreach_kit` | **Tokens:** ~600 Flash | **Dashboard shows:** Outreach template cards with one-click email open

---

### Agent 39 — Performance Predictor Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Pro | **Depends on:** 03, 05, 34

**Why it exists:** Publishing without a performance forecast is flying blind. Performance Predictor uses trend momentum, audience profile, SEO score, publish timing, and historical performance patterns to forecast the article's first-week metrics before a single view is recorded. This makes the analytics page valuable from minute zero.

**Real contribution:** The forecast creates accountability and expectation-setting. If the predictor says 8,000 views and the article gets 400, the system can automatically flag it for investigation (wrong timing? weak headline? wrong platform?). If it says 3,000 and the article gets 12,000, the system identifies what worked and replicates it.

**Workflow:**
```
INPUT: trend_results, seo_score, headline_score, timing_plan, audience_profile
       + historical performance data from Supabase (if available)
1. Score each performance driver:
   - Trend momentum (03): 0–10 → multiplier
   - SEO score (17): 0–100 → organic traffic baseline
   - Headline CTR score (14): 0–10 → click-through modifier
   - Timing optimization (34): how well-timed → reach modifier
   - Platform count: more platforms → wider base
2. Compute forecast:
   - Organic (SEO): based on keyword difficulty + domain authority estimate
   - Social: based on trend_momentum × audience size estimate
   - Direct/newsletter: based on subscriber count (from user settings)
3. Generate forecast_report:
   - views_week1: int (range: low–high)
   - views_month1: int
   - estimated_reach: int
   - confidence: "high|medium|low" (based on data availability)
   - key_drivers[]: what will drive performance
   - risks[]: what could reduce performance
   - improvement_suggestions[]: "Improve headline CTR by X for +Y% views"
4. Store forecast in Supabase (compared to actuals later by Analytics Agent)
```
**Output:** `performance_forecast` | **Tokens:** ~1,200 Pro | **Dashboard shows:** Forecast card with confidence interval

---

### Agent 40 — Syndication Agent *(NEW)*
**Phase:** DISTRIBUTE | **Model:** Gemini 2.0 Flash | **Depends on:** 33

**Why it exists:** Syndication multiplies reach without additional content creation. Publishing the same article on Medium, LinkedIn Articles, and Google News (via RSS) can double or triple total readership with no additional writing. But syndication requires platform-specific formatting and canonical URL handling to avoid Google penalizing the original.

**Real contribution:** Handles all the annoying technical and formatting work of syndication: canonical URL injection so Google gives SEO credit to the original, platform-specific title and tag formatting, publication-specific formatting rules, and submission to Google Discover via structured RSS.

**Workflow:**
```
INPUT: article_html, schema_block, article_url (canonical), excerpt_kit
1. MEDIUM:
   - Format as Medium-style post (large hero image, minimal HTML)
   - Add canonical link tag: <link rel="canonical" href="{article_url}">
   - Generate import-ready format (Medium accepts HTML import)
   - Add Medium publication tags: 3 relevant publication names to submit to
2. LINKEDIN ARTICLES:
   - Reformat: professional tone lead paragraph
   - Canonical URL in author note: "Originally published at [URL]"
   - LinkedIn-specific call to action
3. GOOGLE NEWS (via RSS):
   - Generate valid RSS item:
     <item><title>, <description>, <link>, <pubDate>, <author>
   - Ensure article_html is news-eligible (dateline, author, publication name)
4. GOOGLE DISCOVER optimization:
   - Verify: article has featured image > 1200px wide ✓
   - Verify: title is 40–110 chars ✓
   - Verify: published within last 48 hours ✓
5. Return: syndication_packages{medium, linkedin_articles, rss_item, discover_checklist}
```
**Output:** `syndication_packages` | **Tokens:** ~600 Flash | **Dashboard shows:** Syndication status tracker

---

## PHASE 6: MONETIZE
### Agents 41–45 — The Revenue Engine

---

### Agent 41 — AdSense Optimizer Agent *(NEW)*
**Phase:** MONETIZE | **Model:** Gemini 2.0 Flash | **Depends on:** 17, 33

**Why it exists:** Not all content earns equal AdSense revenue. High-CPM content topics (finance, insurance, SaaS, real estate) earn 10–20x more per 1,000 views than low-CPM topics (entertainment, memes). AdSense Optimizer identifies high-revenue content opportunities and subtly adjusts articles to attract higher-paying ads without compromising content quality.

**Real contribution:** Translates content strategy decisions into revenue decisions. If a publisher can write about either "Pakistan memes" (CPM: $0.10) or "Pakistan investment apps" (CPM: $2.50), this agent shows that the second topic will earn 25x more per view and helps optimize toward it.

**Workflow:**
```
INPUT: article_html, topic_category, seo_results
1. Identify ad category for current article (based on topic keywords)
2. Estimate CPM range for this content category (Pakistan geo):
   - Finance/Banking: $1.50–$3.00
   - Tech/SaaS: $1.20–$2.50
   - Education: $0.80–$1.50
   - Entertainment: $0.05–$0.20
3. Identify high-CPM related topics the publisher could also cover
4. Generate content_gap_opportunities[]:
   - "This article mentions JazzCash → related high-CPM topic: 'Best investment
     apps in Pakistan' (est. CPM: $2.40)"
5. Audit article for AdSense policy compliance:
   - No prohibited content (gambling, adult, weapons, etc.)
   - Sufficient text-to-ad ratio (minimum 200 words between ad slots)
   - Suggested ad placement positions in article
6. Return: revenue_report{current_cpm_estimate, high_value_gaps[], ad_placements[]}
```
**Output:** `revenue_report` | **Tokens:** ~500 Flash | **Dashboard shows:** Revenue potential gauge, high-CPM opportunity cards

---

### Agent 42 — Affiliate Detector Agent *(NEW)*
**Phase:** MONETIZE | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 17

**Why it exists:** Articles that mention products, services, or tools are affiliate revenue opportunities most publishers miss. Affiliate Detector identifies every natural affiliate opportunity in the article — places where a relevant product link would genuinely help the reader AND earn the publisher commission.

**Real contribution:** Finds affiliate opportunities that exist in the content as written, rather than forcing affiliate links into content where they don't belong (which damages reader trust). The test: "Would I recommend this even without the commission?" If yes → natural affiliate opportunity.

**Workflow:**
```
INPUT: article_html, key_facts (any product/service mentions)
1. Scan article for product/service/tool mentions:
   - Financial apps: JazzCash, EasyPaisa, Meezan Bank, Alfalah Digital
   - SaaS tools: any software mentioned
   - E-commerce: any product category mentioned
   - Education: courses, certifications mentioned
   - Hosting/tech: any tech service mentioned
2. For each mention:
   a. Check if affiliate program exists (lookup against known programs list)
   b. Score natural_fit: how naturally does this fit the article? (0–10)
   c. Estimate commission rate if program exists
3. Generate affiliate_opportunities[]:
   {product_name, mention_context, affiliate_program, commission_estimate,
    natural_fit_score, link_insertion_point}
4. Flag: ONLY recommend insertions where natural_fit_score > 7
   (never force affiliate links — damages trust and reader experience)
5. Generate disclosure_text: "This article contains affiliate links..."
6. Return: affiliate_map + disclosure_text
```
**Output:** `affiliate_map` | **Tokens:** ~400 Flash | **Dashboard shows:** Affiliate opportunity cards with estimated earnings

---

### Agent 43 — Lead Magnet Agent *(NEW)*
**Phase:** MONETIZE | **Model:** Gemini 2.0 Flash | **Depends on:** 15, 21

**Why it exists:** Email subscribers are worth 10–50x more to a publisher than social followers. Lead Magnet Agent converts every article into an opportunity to grow the email list by identifying what bonus content (checklist, template, guide, calculator) would be so valuable to the article's reader that they'd trade their email for it.

**Real contribution:** Building an email list is the highest-ROI activity in content publishing. But creating lead magnets is time-consuming. This agent generates the full lead magnet content — not just a description but the actual checklist text, template structure, or guide outline — ready to upload to ConvertKit or Mailchimp.

**Workflow:**
```
INPUT: article_html, audience_profile, key_facts
1. Identify the article's core actionable insight:
   "What would a reader DO after reading this?"
2. Select lead magnet type:
   - Checklist: if article is a process or guide
   - Template: if article describes something the reader needs to create
   - Calculator: if article involves numbers/decisions
   - Resource list: if article surveys a landscape
   - Mini-guide: if article's topic warrants deeper treatment
3. Generate full lead magnet content:
   - Title: "[X]-Step Checklist: [Benefit]" (specific, actionable)
   - Content: actual checklist items / template sections / guide outline
   - Design notes: what visual format works
4. Generate opt-in copy for the article:
   - Inline CTA (after paragraph 3): "Get the free checklist →"
   - Exit-intent popup copy
   - Thank-you page message
5. Generate ConvertKit / Mailchimp form embed instructions
6. Return: lead_magnet_content + opt_in_copy + integration_instructions
```
**Output:** `lead_magnet_package` | **Tokens:** ~800 Flash | **Dashboard shows:** Lead magnet preview + CTA copy

---

### Agent 44 — Content Calendar Agent *(NEW)*
**Phase:** MONETIZE | **Model:** Gemini 2.0 Pro | **Depends on:** 03, 04, 05, 46

**Why it exists:** Consistent publishing beats sporadic brilliance. Publishers who publish on a reliable schedule get more subscribers, better SEO (Google favors active sites), and better brand recall. But planning a 30-day editorial calendar is a 4-hour task most publishers never do. Content Calendar Agent does it in 30 seconds.

**Real contribution:** Generates a 30-day editorial calendar based on: upcoming trends (from Trend Forecaster), competitor coverage gaps (from Competitor Intel), seasonal patterns, audience questions (from Audience Listener), and the publisher's best-performing past content (from Analytics). Every article in the calendar is pre-planned with angle, format, target keyword, and priority score.

**Workflow:**
```
INPUT: trend_results, competitor_results, audience_results, analytics_history
        + publishing_frequency (from user settings: daily/3x week/weekly)
1. Seed calendar with high-priority topics:
   - Breaking news follow-ups (from wire results)
   - Trend peaks predicted in next 7–14 days (from Trend Forecaster)
   - Unanswered audience questions (from Audience Listener)
   - Competitor gaps: topics they haven't covered (from Competitor Intel)
2. Fill remaining slots with:
   - Seasonal content (Eid, Ramadan, financial year end, cricket season)
   - Evergreen pillar content (builds SEO authority over time)
   - Content refreshes (articles flagged by Analytics/Refresh agents)
3. For each calendar entry:
   - date, topic, angle, format (article/listicle/analysis), target_keyword,
     priority_score (1–10), suggested_researching_time (days before publish)
4. Identify "content clusters": 3–5 related articles that link to each other
   → brief Rewrite Agent: these articles need internal links between them
5. Return: calendar_json + visual_calendar_html (for dashboard display)
```
**Output:** `content_calendar` | **Tokens:** ~2,000 Pro | **Dashboard shows:** Full calendar view with color-coded priority slots

---

### Agent 45 — Revenue Intelligence Agent *(NEW)*
**Phase:** MONETIZE | **Model:** Gemini 2.0 Flash | **Depends on:** 41, 42, 46

**Why it exists:** Understanding which content makes money — and why — is the difference between growing a media business and growing a hobby. Revenue Intelligence synthesizes data from AdSense Optimizer, Affiliate Detector, and Analytics to identify the specific topics, formats, and distribution strategies that generate the highest revenue per hour of effort.

**Real contribution:** Turns the platform from a "publish more" machine into a "publish smarter" machine. A publisher who learns that their finance articles earn 20x more per view than their entertainment content — and that newsletters convert readers to buyers at 5x the rate of Facebook traffic — will completely rethink their editorial strategy.

**Workflow:**
```
INPUT: analytics_history, revenue_report from AdSense Optimizer, affiliate conversions
1. Build revenue_by_topic table:
   - Per content category: avg views, avg CPM, avg affiliate clicks, avg email signups
   - Compute: revenue_per_1000_views by category
2. Build revenue_by_format table:
   - Blog post vs listicle vs analysis vs news brief
   - Which formats earn more per unit of effort?
3. Build revenue_by_source table:
   - SEO vs social vs newsletter vs community
   - Which traffic source converts best?
4. Generate weekly revenue_intelligence_report (Gemini Flash, plain English):
   "Your top revenue category this month was fintech (avg $2.30 RPM).
    Your newsletter subscribers earn 8x more per reader than Facebook traffic.
    Recommendation: shift 30% of content effort to fintech + grow email list."
5. Generate: top 5 high-revenue content recommendations for next month
6. Pass recommendations to Content Calendar Agent for planning
```
**Output:** `revenue_intelligence_report` | **Tokens:** ~600 Flash | **Dashboard shows:** Revenue breakdown dashboard, opportunity matrix

---

## PHASE 7: OPERATE
### Agents 46–50 — The Mission Control

---

### Agent 46 — Analytics Agent *(existing, significantly enhanced)*
**Phase:** OPERATE | **Model:** Gemini 2.0 Flash | **Depends on:** 33, 40

*Now tracks performance for all 40 content formats generated by Multimedia agents, not just the primary article. Thread engagement, newsletter open rates, WhatsApp forward counts, carousel saves — all unified.*

**Enhancement:** Compares actual performance to Performance Predictor's forecast (Agent 39). Calculates prediction accuracy and improves the forecast model over time.

---

### Agent 47 — Guardian Agent *(existing, significantly enhanced)*
**Phase:** OPERATE | **Model:** Gemini 2.0 Flash | **Depends on:** ALL

*Now monitors 50 agents instead of 10. Routes ALL agent prompts through Lobster Trap. The security surface area has grown — so has the audit trail value for judges.*

**Enhancement:** Tracks inter-agent prompt injection — content generated by one agent used as input to another can carry injected instructions. Guardian now validates agent outputs before they're used as inputs.

---

### Agent 48 — Content Refresh Agent *(NEW)*
**Phase:** OPERATE | **Model:** Gemini 2.0 Pro | **Depends on:** 46

**Why it exists:** An article published 6 months ago about Pakistan fintech is probably outdated — new players, new regulations, new statistics. Content decay costs 40–60% of an article's long-term SEO value. Content Refresh Agent detects decaying articles and automatically rewrites the outdated sections.

**Real contribution:** Evergreen content that stays current continues to rank. Most publishers let their content die — LADtoday's articles stay alive. This creates compounding SEO value over time rather than a constant need for fresh content.

**Workflow:**
```
INPUT: analytics_history (declining traffic articles), all published articles
1. Identify articles needing refresh:
   - Traffic declined > 30% vs 30-day peak AND article > 90 days old
   - Primary keyword ranking dropped (inferred from traffic pattern)
   - Article contains stats with explicit dates > 12 months ago
   - New major development in topic has occurred (from News Wire Agent check)
2. For each flagged article:
   a. Identify outdated sections: stats, quotes, named entities, policy references
   b. Run Scout Agent (mini-version) on the topic with date filter: last 90 days
   c. Compare old facts vs new facts
   d. Generate refresh_brief: what changed, what needs updating, what can stay
3. Execute targeted rewrite (not full rewrite — only stale sections):
   - Update statistics with current figures
   - Add a "Update [date]: X" section for major developments
   - Refresh internal links (new relevant articles may have been published)
4. Update article in WordPress (via Publish Agent) with "Updated: [date]" marker
5. Log: refresh_log{article_id, date, sections_changed, reason}
```
**Output:** `refresh_log` | **Tokens:** ~3,000 Pro (per article refreshed) | **Dashboard shows:** Decay alerts + refresh queue

---

### Agent 49 — Brand Safety Agent *(NEW)*
**Phase:** OPERATE | **Model:** Gemini 2.0 Pro | **Depends on:** 15, 33

**Why it exists:** A single badly-worded article can damage a brand's reputation irreversibly. Brand Safety Agent is the final pre-publish review that checks for: accidental defamation, false implications, cultural insensitivity, political landmines, and legal risk language — before the article is published.

**Real contribution:** In Pakistan's media environment, publishing content that accidentally defames a named individual or makes an unsubstantiated claim about a company can result in legal action. This agent is the last line of defense. It's also the reason enterprise clients will pay for LADtoday over a cheaper tool.

**Workflow:**
```
INPUT: article_html, fact_check_results, publishing platforms
1. Defamation check:
   - Identify all named individuals + companies in article
   - For each: does the article make a claim that could be defamatory?
   - Is the claim supported by a verified source? (cross-ref Fact Checker)
   - Flag: unsupported negative claims about named parties → require sourcing
2. Legal language check:
   - Identify financial advice language: "X stock will rise" → flag + soften
   - Identify medical claims → require disclaimer
   - Identify absolute statements about unverified events → flag
3. Cultural sensitivity check (Pakistan-specific):
   - Religious references handled respectfully
   - Political claims that could be seen as partisan → balance check
   - Gender language appropriate to audience
4. Brand association check:
   - Does any adjacent content / ad category association create brand risk?
5. Generate risk_report:
   - risk_level: "green|yellow|red"
   - risk_items[]: {type, text_excerpt, recommendation}
   - auto_fixes_applied[]: items automatically softened by agent
   - requires_human_review: boolean
6. Pass verdict to Guardian Agent for final APPROVE/HOLD/REJECT decision
```
**Output:** `brand_safety_report` | **Tokens:** ~1,500 Pro | **Dashboard shows:** Risk scorecard with flagged passages highlighted

---

### Agent 50 — Knowledge Base Agent *(NEW)*
**Phase:** OPERATE | **Model:** Gemini 2.0 Pro | **Depends on:** ALL published articles

**Why it exists:** Every article a publisher creates contains knowledge about their niche. After 100 articles, a publisher has built an enormous knowledge base about their topic — but it's locked in individual articles, not searchable, not synthesized, not useful as a strategic resource. Knowledge Base Agent extracts this knowledge and builds a searchable, queryable intelligence layer.

**Real contribution:** This creates the platform's long-term defensible value. A publisher who has used LADtoday for 6 months has an AI knowledge base about their niche that their competitors don't have. It enables: "What have I already written about fintech regulation?" and "What gaps exist in my fintech content coverage?" and "What does my content say about X vs what experts say?"

**Workflow:**
```
INPUT: all published articles (from Supabase articles table)
       + research_results from all pipeline runs
1. Extract knowledge graph:
   - Entities: people, companies, organizations, regulations, places mentioned
   - Facts: statistics and data points with source + publication date
   - Topics: content categories and subcategories covered
   - Relationships: "X leads Y", "X regulates Y", "X competed with Y"
2. Build searchable index (stored in Supabase):
   - knowledge_entities table
   - knowledge_facts table
   - content_coverage_map (what topics have been covered, how deeply)
3. Generate coverage_gap_report:
   - Topics in niche NOT yet covered → pass to Content Calendar Agent
   - Topics covered but shallowly → flag for deep-dive treatment
4. Answer queries: publisher can search "What do my articles say about SECP?"
   → Gemini Pro synthesizes answer from the knowledge base
5. Generate weekly knowledge_digest:
   "This week LADtoday added 7 articles to your fintech knowledge base.
    New entities tracked: 3. New facts recorded: 14.
    Coverage gap identified: digital lending regulations (no articles yet)."
6. Enable: "Did I already cover this?" check before new pipeline runs
   → prevents duplicate content
```
**Output:** `knowledge_base_update + coverage_report` | **Tokens:** ~2,500 Pro | **Dashboard shows:** Knowledge graph visualization, coverage map heatmap

---

## Token Budget: All 50 Agents

| Phase | Agents | Model Mix | Tokens/Run |
|-------|--------|-----------|------------|
| DISCOVER (01–07) | 7 | 2× Pro, 5× Flash | ~9,000 |
| ANALYZE (08–14) | 7 | 4× Pro, 3× Flash | ~11,000 |
| CREATE (15–21) | 7 | 2× Pro, 5× Flash | ~11,000 |
| MULTIMEDIA (22–31) | 10 | 1× Pro, 9× Flash | ~9,500 |
| DISTRIBUTE (32–40) | 9 | 1× Pro, 8× Flash | ~7,000 |
| MONETIZE (41–45) | 5 | 1× Pro, 4× Flash | ~5,500 |
| OPERATE (46–50) | 5 | 3× Pro, 2× Flash | ~9,000 |
| **TOTAL** | **50** | **14× Pro, 36× Flash** | **~62,000** |

**Critical note on free tier:** 62,000 tokens × Pro calls is the bottleneck.
With Pro at 50 req/day free, and 14 Pro calls per pipeline run → max **3–4 full live runs/day**.
→ Solution: run Discover+Analyze agents with Pro, everything else Flash.
→ Reduced-cost mode: swap all Phase 4–6 agents to Flash (save 8 Pro calls per run).
→ This gets you to 6–8 live runs/day on free tier.

---

## Enhancement Plan: How to Add 40 Agents to Your Existing Codebase

### Step 1 — Refactor the Orchestrator (Day 1 of enhancement)

Your existing `pipeline.py` runs 10 agents sequentially. With 50 agents, you need:

```python
# orchestrator/pipeline.py — enhanced version

import asyncio
from typing import Dict, List
from dataclasses import dataclass

@dataclass
class AgentTask:
    agent_id: int
    agent_name: str
    dependencies: List[int]  # agent_ids that must complete first
    phase: int
    priority: int  # within-phase execution order

# Full 50-agent dependency graph
AGENT_TASKS = [
    AgentTask(1, "scout", [], 1, 1),
    AgentTask(2, "intelligence", [1], 1, 2),
    AgentTask(3, "trend_forecaster", [], 1, 1),  # parallel with 1-2
    AgentTask(4, "competitor_intel", [], 1, 1),  # parallel with 1-2
    AgentTask(5, "audience_listener", [], 1, 1),  # parallel with 1-2
    AgentTask(6, "news_wire", [], 1, 1),           # parallel with 1-2
    AgentTask(7, "research", [1, 2], 1, 3),
    AgentTask(8, "fact_checker", [1, 2, 7], 2, 1),
    AgentTask(9, "bias_detector", [2], 2, 1),      # parallel with 8
    AgentTask(10, "story_arc", [2, 3, 5], 2, 2),
    AgentTask(11, "quote_extractor", [1, 2], 2, 1),# parallel with 8,9
    AgentTask(12, "tone_calibrator", [2], 2, 1),   # parallel with 8,9,11
    AgentTask(13, "localization", [2], 2, 1),       # parallel with 8,9,11,12
    AgentTask(14, "headline_optimizer", [10, 12, 13], 2, 3),
    # ... (continues for all 50)
]

class PipelineOrchestrator:
    def __init__(self, run_id: str, supabase_client):
        self.run_id = run_id
        self.db = supabase_client
        self.results: Dict[int, any] = {}
        self.completed: set = set()
        
    async def run_phase(self, phase: int):
        """Run all agents in a phase, respecting dependencies, with parallelism"""
        phase_tasks = [t for t in AGENT_TASKS if t.phase == phase]
        
        while len([t for t in phase_tasks if t.agent_id in self.completed]) < len(phase_tasks):
            # Find tasks whose dependencies are all complete
            ready = [
                t for t in phase_tasks 
                if t.agent_id not in self.completed
                and all(dep in self.completed for dep in t.dependencies)
            ]
            if not ready:
                await asyncio.sleep(0.1)
                continue
            
            # Run all ready tasks in parallel
            await asyncio.gather(*[self.run_agent(task) for task in ready])
    
    async def run_agent(self, task: AgentTask):
        """Run a single agent, update Supabase, log trace"""
        # Update status to running
        await self.db.table("pipeline_runs").update({
            f"{task.agent_name}_status": "running"
        }).eq("id", self.run_id).execute()
        
        # Get agent inputs from completed upstream results
        inputs = {dep: self.results[dep] for dep in task.dependencies if dep in self.results}
        
        # Run agent
        agent = get_agent(task.agent_name)
        result = await agent.run(inputs, self.run_id)
        
        # Store result
        self.results[task.agent_id] = result
        self.completed.add(task.agent_id)
        
        # Update Supabase
        await self.db.table("pipeline_runs").update({
            f"{task.agent_name}_status": "done",
            f"{task.agent_name}_results": result
        }).eq("id", self.run_id).execute()
    
    async def run_full_pipeline(self, input_data: dict):
        for phase in range(1, 8):  # 7 phases
            await self.run_phase(phase)
        return self.results
```

### Step 2 — New Supabase Columns (add to existing table)

```sql
-- Add new agent status columns
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS trend_forecaster_status TEXT DEFAULT 'pending';
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS competitor_intel_status TEXT DEFAULT 'pending';
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS audience_listener_status TEXT DEFAULT 'pending';
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS news_wire_status TEXT DEFAULT 'pending';
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS research_status TEXT DEFAULT 'pending';
-- (continue for all 40 new agents)

-- New results columns
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS trend_results JSONB;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS competitor_results JSONB;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS audience_results JSONB;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS news_wire_results JSONB;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS research_results JSONB;
-- (continue for all 40 new agents)

-- New tables for enhanced features
CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  scheduled_date DATE NOT NULL,
  topic TEXT NOT NULL,
  angle TEXT,
  format TEXT,
  target_keyword TEXT,
  priority_score INT,
  status TEXT DEFAULT 'planned',  -- planned|in_progress|published|skipped
  pipeline_run_id UUID REFERENCES pipeline_runs(id)
);

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  entity_name TEXT NOT NULL,
  entity_type TEXT,  -- person|company|regulation|place|concept
  first_mentioned TIMESTAMPTZ,
  mention_count INT DEFAULT 1,
  article_ids UUID[]
);

CREATE TABLE IF NOT EXISTS performance_forecasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_run_id UUID REFERENCES pipeline_runs(id),
  views_week1_low INT,
  views_week1_high INT,
  views_month1 INT,
  confidence TEXT,
  key_drivers JSONB,
  actual_views_week1 INT,  -- filled in by Analytics Agent later
  forecast_accuracy DECIMAL
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_run_id UUID REFERENCES pipeline_runs(id),
  platform TEXT,
  content_type TEXT,  -- article|thread|carousel|newsletter|whatsapp
  scheduled_time TIMESTAMPTZ,
  content_json JSONB,
  status TEXT DEFAULT 'scheduled'  -- scheduled|published|failed
);
```

### Step 3 — Base Agent Class (all 40 new agents inherit this)

```python
# agents/base_agent.py

import time
import json
from abc import ABC, abstractmethod
from services.gemini_client import call_gemini_via_lobstertrap
from services.supabase_client import supabase

class BaseAgent(ABC):
    def __init__(self, name: str, model: str):
        self.name = name
        self.model = model
        self.trace_steps = []
    
    @abstractmethod
    async def build_prompt(self, inputs: dict) -> str:
        """Build the Gemini prompt from upstream inputs"""
        pass
    
    @abstractmethod
    def parse_output(self, raw_response: str) -> dict:
        """Parse Gemini's response into structured output"""
        pass
    
    async def run(self, inputs: dict, run_id: str) -> dict:
        start_time = time.time()
        
        # Build prompt
        prompt = await self.build_prompt(inputs)
        
        # Log observation to trace
        self.log_trace("observation", f"Running {self.name} with {len(inputs)} upstream inputs")
        self.log_trace("reasoning", f"Building prompt for {self.model}")
        
        # Call Gemini (via Lobster Trap)
        raw_response = await call_gemini_via_lobstertrap(
            prompt=prompt,
            model=self.model,
            agent_name=self.name,
            pipeline_run_id=run_id
        )
        
        self.log_trace("tool_call", f"Gemini {self.model} called")
        
        # Parse output
        result = self.parse_output(raw_response)
        self.log_trace("decision", f"Output: {str(result)[:200]}...")
        
        # Append trace to pipeline_runs
        latency_ms = int((time.time() - start_time) * 1000)
        trace_entry = {
            "step": self.name,
            "agent": self.name,
            "latency_ms": latency_ms,
            "model": self.model,
            "steps": self.trace_steps
        }
        
        await supabase.rpc("append_trace", {
            "run_id": run_id,
            "trace_entry": json.dumps(trace_entry)
        }).execute()
        
        return result
    
    def log_trace(self, step_type: str, content: str):
        self.trace_steps.append({"type": step_type, "content": content})
```

### Step 4 — Phased Build Rollout (priority order for hackathon)

Not all 40 new agents need to be fully built for the demo. Build in this order:

**MUST BUILD (for judges to see — directly visible in demo):**
```
Priority 1 — Visible in Pipeline UI:
[ ] Agent 03: Trend Forecaster (shows trend momentum gauge)
[ ] Agent 10: Story Arc (shows blueprint before article is written)
[ ] Agent 14: Headline Optimizer (shows headline leaderboard)
[ ] Agent 29: Newsletter Agent (shows email preview)
[ ] Agent 34: Timing Intelligence (shows scheduling timeline)
[ ] Agent 44: Content Calendar (shows calendar view)
[ ] Agent 39: Performance Predictor (shows forecast before publish)
```

**SHOULD BUILD (adds depth when judges dig in):**
```
Priority 2 — Adds value to trace/audit:
[ ] Agent 08: Fact Checker (security + quality story)
[ ] Agent 09: Bias Detector (editorial integrity story)
[ ] Agent 04: Competitor Intel (business intelligence story)
[ ] Agent 27: Thread Agent (X/Twitter output visible)
[ ] Agent 48: Content Refresh (shows long-term value)
[ ] Agent 50: Knowledge Base (shows compound value over time)
```

**CAN STUB (skeleton code, shows in UI, no live Gemini call):**
```
Priority 3 — Stubbed with mock output (all other agents):
[ ] Agents 05, 06, 07, 11, 12, 13, 15–26, 28, 30–33, 35–38, 40–43, 45, 46, 47, 49
→ Return realistic mock_data JSON
→ Show in pipeline UI as "Done ✓" with mock results
→ Reduces Gemini API calls while showing 50 agents in UI
```

### Step 5 — Updated Folder Structure

```
ladtoday-ai/
├── backend/
│   ├── agents/
│   │   ├── base_agent.py              ← BaseAgent class
│   │   │
│   │   ├── phase1_discover/
│   │   │   ├── scout_agent.py         (existing)
│   │   │   ├── intelligence_agent.py  (existing)
│   │   │   ├── trend_forecaster.py    (NEW - Priority 1)
│   │   │   ├── competitor_intel.py    (NEW - Priority 2)
│   │   │   ├── audience_listener.py   (NEW - stub ok)
│   │   │   ├── news_wire.py           (NEW - stub ok)
│   │   │   └── research_agent.py      (NEW - stub ok)
│   │   │
│   │   ├── phase2_analyze/
│   │   │   ├── fact_checker.py        (NEW - Priority 2)
│   │   │   ├── bias_detector.py       (NEW - Priority 2)
│   │   │   ├── story_arc.py           (NEW - Priority 1)
│   │   │   ├── quote_extractor.py     (NEW - stub ok)
│   │   │   ├── tone_calibrator.py     (NEW - stub ok)
│   │   │   ├── localization.py        (NEW - stub ok)
│   │   │   └── headline_optimizer.py  (NEW - Priority 1)
│   │   │
│   │   ├── phase3_create/
│   │   │   ├── rewrite_agent.py       (existing - enhanced)
│   │   │   ├── vision_agent.py        (existing - enhanced)
│   │   │   ├── seo_agent.py           (existing - enhanced)
│   │   │   ├── readability_optimizer.py (NEW - stub ok)
│   │   │   ├── internal_linking.py    (NEW - stub ok)
│   │   │   ├── schema_architect.py    (NEW - stub ok)
│   │   │   └── excerpt_agent.py       (NEW - stub ok)
│   │   │
│   │   ├── phase4_multimedia/
│   │   │   ├── creative_agent.py      (existing - enhanced)
│   │   │   ├── infographic_agent.py   (NEW - stub ok)
│   │   │   ├── podcast_script.py      (NEW - stub ok)
│   │   │   ├── video_script.py        (NEW - stub ok)
│   │   │   ├── short_form.py          (NEW - stub ok)
│   │   │   ├── thread_agent.py        (NEW - Priority 2)
│   │   │   ├── carousel_agent.py      (NEW - stub ok)
│   │   │   ├── newsletter_agent.py    (NEW - Priority 1)
│   │   │   ├── whatsapp_broadcast.py  (NEW - stub ok)
│   │   │   ├── data_viz.py            (NEW - stub ok)
│   │   │   └── creative_agent.py      (existing)
│   │   │
│   │   ├── phase5_distribute/
│   │   │   ├── account_manager.py     (existing - enhanced)
│   │   │   ├── publish_agent.py       (existing - enhanced)
│   │   │   ├── timing_intelligence.py (NEW - Priority 1)
│   │   │   ├── hashtag_strategy.py    (NEW - stub ok)
│   │   │   ├── cross_platform.py      (NEW - stub ok)
│   │   │   ├── community_agent.py     (NEW - stub ok)
│   │   │   ├── influencer_radar.py    (NEW - stub ok)
│   │   │   ├── performance_predictor.py (NEW - Priority 1)
│   │   │   └── syndication_agent.py   (NEW - stub ok)
│   │   │
│   │   ├── phase6_monetize/
│   │   │   ├── adsense_optimizer.py   (NEW - stub ok)
│   │   │   ├── affiliate_detector.py  (NEW - stub ok)
│   │   │   ├── lead_magnet.py         (NEW - stub ok)
│   │   │   ├── content_calendar.py    (NEW - Priority 1)
│   │   │   └── revenue_intelligence.py (NEW - stub ok)
│   │   │
│   │   └── phase7_operate/
│   │       ├── analytics_agent.py     (existing - enhanced)
│   │       ├── guardian_agent.py      (existing - enhanced)
│   │       ├── content_refresh.py     (NEW - Priority 2)
│   │       ├── brand_safety.py        (NEW - stub ok)
│   │       └── knowledge_base.py      (NEW - Priority 2)
│   │
│   └── orchestrator/
│       └── pipeline.py               ← async DAG orchestrator
```

### Step 6 — UI Updates for Lovable

Add this prompt to your Lovable project after the initial build:

```
PROMPT: "Update the pipeline view to show 50 agents organized in 7 phases:
DISCOVER (7), ANALYZE (7), CREATE (7), MULTIMEDIA (10), DISTRIBUTE (9),
MONETIZE (5), OPERATE (5).

Each phase has a color:
- DISCOVER: blue
- ANALYZE: purple
- CREATE: green
- MULTIMEDIA: orange
- DISTRIBUTE: teal
- MONETIZE: yellow/gold
- OPERATE: red/crimson

Agents that can run in parallel (same dependency level) are shown side by side.
Agents that must run sequentially are shown in a vertical chain.

Add a phase completion progress bar above each phase group.
Add a total progress indicator at the top: '28/50 agents complete'.
Show token usage counter: 'Tokens used: 14,200 / ~62,000 estimated'."
```

---

## The 50-Agent Value Proposition for Judges

When judges see 50 agents, they need to immediately understand why 50 and not 10. Here's your answer for the demo/pitch:

> "Most AI content tools are single-step: input topic → output article. LADtoday's 50 agents mirror what a full editorial team actually does. You have researchers, fact-checkers, editors, SEO specialists, graphic designers, social media managers, distribution coordinators, monetization analysts, and compliance officers. We've automated every role in that team. The 50-agent architecture isn't complexity for its own sake — it's completeness. A single-agent approach produces content. A 50-agent approach produces a media operation."

**Number that matters for judges:** 50 agents × 7 phases × real dependency graph = the most comprehensive AI content workflow in this hackathon.

---

*LADtoday v2.0 — 50-Agent Intelligence Swarm*
*Built for LabLab.ai × Google AI Studio × Veea Lobster Trap*
*Pakistan 🇵🇰 | May 2026 | Team: Atif + Aqsa*
