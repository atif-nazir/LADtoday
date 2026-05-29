# Gemini Quota Fallback Fix

## Problem
When Gemini API hits its quota (429 error), both the Intelligence and Scout agents would fail with no fallback mechanism, causing the entire pipeline to crash.

## Solution
Implemented proper fallback chain following the hackathon spec:

### 1. **Scout Agent Fallback** (supabase/functions/scout/index.ts)
When Gemini fails to score sources:
```typescript
try {
  return await scoreSourcesWithGemini(topic, enriched, model);
} catch (err) {
  console.warn(`[Scout] Gemini scoring failed, using simple scoring`);
  return scoreSourcesSimple(topic, enriched); // ← Fallback to rule-based scoring
}
```
**Fallback Method**: Rule-based credibility scoring (no AI required)

---

### 2. **Intelligence Agent Fallback** (supabase/functions/intelligence/index.ts)
Two-tier AI approach:

#### Tier 1: AI/ML API (GPT-4o) - Primary
```typescript
if (USE_AIML_API && sourceCount > 0) {
  try {
    const aimlResult = await aimlIntelligenceAnalysis(topic, sources);
    // Convert and use result
  } catch (aimlErr) {
    console.error(`AI/ML API failed, falling back to Gemini`);
    // Fall through to Tier 2
  }
}
```

#### Tier 2: Gemini (Fallback)
```typescript
const intelligence = await extractIntelligence(
  topic, context, sourceCount, brandVoice, language, 
  topicCategory, learning, selectedModel
);
```
Uses `geminiJson()` which:
- Implements exponential backoff for transient errors
- Immediately propagates `quota_exceeded` error (code="quota_exceeded")
- Allows the handler to detect and handle gracefully

---

### 3. **Gemini Error Handling** (supabase/functions/_shared/gemini.ts)
Enhanced error classification:
```typescript
if (status === 429) {
  const isQuotaExhausted = detail.includes("quota") || detail.includes("free_tier");
  
  return new GeminiError(
    `Gemini quota exceeded... Falling back to AI/ML API.`,
    429,
    isQuotaExhausted ? "quota_exceeded" : "rate_limited"
  );
}
```

When `quota_exceeded` is detected:
- The error is thrown immediately (no retry)
- Agents can catch it and trigger fallback
- Proper logging indicates which provider is being used

---

## What This Means
✅ **Scout Agent**: If Gemini quota is hit, still scores sources with rule-based logic  
✅ **Intelligence Agent**: Tries AI/ML API → Falls back to Gemini → Handles quota gracefully  
✅ **No Silent Failures**: Clear logging shows which provider is active  
✅ **No Code Duplication**: Clean separation of concerns  

## Testing
To test fallback:
1. Set `GEMINI_API_KEY=""` to simulate Gemini being unavailable
2. Scout will fall back to `scoreSourcesSimple()` ✓
3. Intelligence will fall back to `aimlIntelligenceAnalysis()` if enabled, otherwise graceful degradation

## Environment Variables
- `USE_AIML_API=true` - Enable AI/ML API tier (requires `AIML_API_KEY`)
- `AIML_API_KEY` - Your AI/ML API key for GPT-4o access
- `GEMINI_API_KEY` - Your Gemini API key (always needed as fallback)
