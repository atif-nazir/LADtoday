# Walkthrough - Enforce Required Fields & Model Override UX Fixes

I have completed:
1. Enforcing required fields inside the Scout and Intelligence agents via JSON Schema and prompt refinement.
2. Adding instant visual feedback (toast notifications) when you change the model of a single agent in the Admin Pipeline page.
3. Fixing a key-mismatch bug in `selectModelForAgent` so that agents with hyphens or underscores (like `trend-forecaster`) can correctly resolve their overrides.

## Changes Made

### 1. Database & Shared Utilities
- Modified [model-config.ts](file:///d:/Blogwebidea/blogweb/simple-sign-in/supabase/functions/_shared/model-config.ts):
  - Updated `selectModelForAgent` to robustly match agent keys. It now normalized hyphens to underscores (`agentKey.replace(/-/g, "_")`) so that keys like `"trend-forecaster"` (used in functions) match `"trend_forecaster"` (stored in the database registry and passed in the UI payload).

### 2. Admin UI (Pipeline page)
- Modified [AdminPipeline.tsx](file:///d:/Blogwebidea/blogweb/simple-sign-in/src/pages/AdminPipeline.tsx):
  - Added a `toast` trigger inside `NewRunForm`'s agent model dropdown select event:
    ```typescript
    toast({ title: `${agent.name} set to ${newModel}` });
    ```
    This provides instant visual confirmation when you select any model from the dropdown.

### 3. Scout Agent
- Modified [scout/index.ts](file:///d:/Blogwebidea/blogweb/simple-sign-in/supabase/functions/scout/index.ts):
  - Added JSON Schema `required` lists to both `expandQueries` and `scoreSources` schemas.
  - Updated prompt to explicitly request the model to populate all properties with non-empty values.

### 4. Intelligence Agent
- Modified [intelligence/index.ts](file:///d:/Blogwebidea/blogweb/simple-sign-in/supabase/functions/intelligence/index.ts):
  - Restored prompt text formatting.
  - Added JSON Schema `required` lists at the top-level and item-level of all nested structures.
  - Explicitly instructed the model to populate all properties with meaningful, non-empty, and topic-aware values.

---

## Deployment Steps

1. **Deploy Scout**:
   ```bash
   npx supabase functions deploy scout --project-ref esrqqkjkwomqlxjpcefg
   ```

2. **Deploy Intelligence**:
   ```bash
   npx supabase functions deploy intelligence --project-ref esrqqkjkwomqlxjpcefg
   ```

3. **Verify UI**:
   - Open `/admin/pipeline` in your browser.
   - Expand the **"Customize Agent Models"** panel.
   - Click any agent dropdown (e.g. Scout) and change its model. You will see a toast notification confirming the change (e.g., `Scout set to gemini-3.1-flash-lite`).
   - Run the pipeline and verify that both Scout and Intelligence execute successfully using your selected model.
