# Gemini Quota Fallback Fix — LADtoday Agents

## Problem Statement

When the Gemini API free tier quota was exceeded (status 429), agents (Scout and Intelligence) would fail completely without any fallback mechanism:

```
Error: Gemini quota exceeded. Check Google AI Studio billing/quota for this API key.
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count
```

This caused the entire pipeline to halt with no recovery path, even though alternative AI providers were available.

---

## Solution Implemented

### 1. **Enhanced Gemini Error Detection** (`_shared/gemini.ts`)
- Updated `geminiJson()` to properly detect and propagate quota exceeded errors with code `"quota_exceeded"`
- Modified error normalization to explicitly check for "quota" and "free_tier" in error messages
- When quota is detected, the error is immediately re-thrown so the AI provider fallback system can catch it

```typescript
// Now properly detects and marks quota errors
if (status === 429) {
  const isQuotaExhausted = detail.toLowerCase().includes("quota") || 
                           detail.toLowerCase().includes("free_tier");
  
  return new GeminiError(
    isQuotaExhausted 
      ? `Gemini quota exceeded...` 
      : `Gemini rate limited...`,
    429,
    isQuotaExhausted ? "quota_exceeded" : "rate_limited"
  );
}
```

### 2. **Unified AI Provider System** (`_shared/ai-provider.ts`)
- Already implemented with intelligent fallback logic
- Primary: Gemini (when available)
- Fallback: AI/ML API (GPT-4o) when Gemini quota is exhausted
- Tracks fallback statistics for monitoring

**Flow on Gemini Quota Exceeded:**
```
generateJSON(prompt, schema, { allowFallback: true })
  └─→ Try Gemini first
      └─→ Catch quota_exceeded error
          └─→ If allowFallback=true & AI/ML available
              └─→ fallbackToAIMLJSON()
                  └─→ Success: Return AI/ML response
                  └─→ Failure: Throw error (both failed)
```

### 3. **Scout Agent Updates** (`supabase/functions/scout/index.ts`)

#### Change 1: Import unified provider
```typescript
import { generateJSON } from "../_shared/ai-provider.ts";
```

#### Change 2: Update query expansion
```typescript
const result = await generateJSON<{ queries: string[] }>(prompt, schema, {
  temperature: 0.4,
  max_tokens: 512,
  allowFallback: true,
  onFallback: (reason, provider) => {
    console.log(`[Scout] Query expansion fallback: ${reason} → using ${provider}`);
  }
});
const out = result.data;
```

#### Change 3: Update source scoring
```typescript
const result = await generateJSON(prompt, schema, {
  temperature: 0.3,
  max_tokens: 8192,
  allowFallback: true,
  onFallback: (reason, provider) => {
    console.log(`[Scout] Source scoring fallback: ${reason} → using ${provider}`);
  }
});
const scored = result.data;
```

### 4. **Intelligence Agent** (`supabase/functions/intelligence/index.ts`)
- Already uses `generateJSON()` with `allowFallback: true` at line 467
- Has primary: Gemini, Fallback: AI/ML API (GPT-4o)
- No changes needed — already implemented correctly

---

## How It Works Now

### Before (Broken)
```
Scout/Intelligence Agent
  └─→ Call geminiJson()
      └─→ Gemini returns 429 quota exceeded
      └─→ Throw GeminiError
      └─→ ❌ Pipeline fails, agent marked as failed
```

### After (Fixed)
```
Scout/Intelligence Agent
  └─→ Call generateJSON(..., { allowFallback: true })
      └─→ Try Gemini
          └─→ Gemini returns 429 quota exceeded
          └─→ Catch and detect code="quota_exceeded"
              └─→ Is fallback enabled? Yes
              └─→ Is AI/ML API available? Yes
              └─→ ✅ Call aimlJson() via GPT-4o
                  └─→ Success: Return parsed JSON
                  └─→ Log: "Fallback triggered: Gemini quota exceeded → using aiml"
                  └─→ Agent continues, pipeline succeeds
```

---

## Monitoring & Debugging

### Log Messages
Watch for these messages in Edge Function logs:

**Successful Fallback:**
```
[Scout] Query expansion fallback: Gemini quota exceeded → using aiml
[Intelligence] Source scoring fallback: Gemini quota exceeded → using aiml
[AI Provider] Fallback to AI/ML successful. Reason: Gemini quota exceeded
```

**Both Failed:**
```
[AI Provider] Fallback to AI/ML also failed:
Both providers unavailable or both failed
```

### Check Fallback Statistics
Query the `getFallbackStats()` function (used for monitoring):
```typescript
{
  gemini_quota_exhausted: 42,      // How many times Gemini hit quota
  fallback_to_aiml: 42,            // How many times we fell back successfully
  both_failed: 0,                  // How many times both providers failed
  timestamp: "2026-05-29T16:38:23Z"
}
```

---

## Configuration Requirements

### Environment Variables
Ensure your `.env.project` has:

```bash
GEMINI_API_KEY=your_gemini_key_here        # Primary provider
AIML_API_KEY=your_aiml_api_key_here        # Fallback provider (required for fallback)
```

**Without AI/ML API key:** Fallback will be unavailable, quota errors will fail the agent.

**With both keys:** Agent will automatically switch to AI/ML API when Gemini quota is hit.

---

## Testing the Fix

### Simulate Quota Exceeded (for testing)
Temporarily modify `_shared/gemini.ts` to force quota error:

```typescript
// For testing only — remove after verification
if (Math.random() < 0.5) {
  throw new GeminiError("Simulated quota exceeded", 429, "quota_exceeded");
}
```

### Expected Behavior
1. Agent calls a function that would hit Gemini quota
2. Logs show fallback message
3. Agent continues using AI/ML API
4. Output is successfully written
5. Agent marks as "completed" (not "failed")

---

## What Changed

| Component | Change | Impact |
|-----------|--------|--------|
| `gemini.ts` | Enhanced quota detection | Properly signals fallback system |
| `scout/index.ts` | Switch to `generateJSON` | Scout now has fallback capability |
| `intelligence/index.ts` | ✅ Already correct | No changes needed |
| `ai-provider.ts` | ✅ Already complete | No changes needed |

---

## Rollback Plan

If issues arise:

1. Revert Scout Agent to use `geminiJson()` directly (no fallback)
2. Comment out imports of `generateJSON` 
3. System will behave like before (no fallback, quota errors fail)

---

## Future Enhancements

1. **Provider Selection UI**: Let users choose preferred provider in dashboard
2. **Cost Tracking**: Log token usage per provider for cost optimization
3. **Provider Health Check**: Periodic health checks on both providers
4. **Rate Limit Handling**: Similar fallback system for 429 rate limits (different from quota)
5. **Priority Queue**: Queue requests during peak Gemini usage

---

## Summary

✅ **Gemini quota exceeded errors no longer crash the pipeline**
✅ **Scout Agent now has intelligent fallback to AI/ML API**
✅ **Intelligence Agent already had fallback (verified)**
✅ **Logging makes it clear when fallback is used**
✅ **System degrades gracefully, no silent failures**

The agents will now continue processing when Gemini hits quota, using GPT-4o via AI/ML API until quota resets.
