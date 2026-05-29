# LADtoday 50-Agent Pipeline: Workaround Guide (Jugar)

Welcome! This folder contains a flat dump of the files from the **LADtoday 50-Agent Pipeline** project. Because some agent platforms (like Lovable) only accept individual files rather than directory trees, all key files have been renamed and collected here.

---

## Folder Structure Mapping

When you write or modify code in this workspace, map these flat files back to their original paths in the project:

| Flat File Name | Original Project Path |
| :--- | :--- |
| **`Jugar/<agent-key>_index.ts`** | `supabase/functions/<agent-key>/index.ts` |
| **`Jugar/pipeline-orchestrator_index.ts`** | `supabase/functions/pipeline-orchestrator/index.ts` |
| **`Jugar/shared_gemini.ts`** | `supabase/functions/_shared/gemini.ts` |
| **`Jugar/shared_pipeline.ts`** | `supabase/functions/_shared/pipeline.ts` |
| **`Jugar/shared_model-config.ts`** | `supabase/functions/_shared/model-config.ts` |
| **`Jugar/shared_logger.ts`** | `supabase/functions/_shared/logger.ts` |
| **`Jugar/shared_lobstertrap.ts`** | `supabase/functions/_shared/lobstertrap.ts` |
| **`Jugar/ui_AdminPipeline.tsx`** | `src/pages/AdminPipeline.tsx` |
| **`Jugar/ui_<Name>Tab.tsx`** | `src/components/pipeline/<Name>Tab.tsx` |
| **`Jugar/doc_LADtoday_50_AGENTS.md`** | `docs/LADtoday_50_AGENTS.md` |
| **`Jugar/doc_lovable_plan.md`** | `.lovable/plan.md` |
| **`Jugar/doc_implementation_plan.md`** | `implementation_plan.md` (Artifact) |
| **`Jugar/doc_walkthrough.md`** | `walkthrough.md` (Artifact) |
| **`Jugar/doc_task.md`** | `task.md` (Artifact) |

---

## Key Context & Recent Implementation Details

You are building upon a structured 50-agent editorial orchestration pipeline running on Supabase Edge Functions (Deno) and Gemini APIs. Please maintain and respect these recent critical upgrades:

### 1. Robust Model Overrides
*   **Key Normalization:** In `Jugar/shared_model-config.ts`, the `selectModelForAgent` helper maps database registry keys (which use underscores, e.g., `"trend_forecaster"`) to edge function keys (which use hyphens, e.g., `"trend-forecaster"`). **Do not break this normalization**, otherwise model overrides will fall back to defaults for agents with compound keys.
*   **Form State & Toast Notification:** In `Jugar/ui_AdminPipeline.tsx`, the model selector dropdown in the `NewRunForm` updates the `modelOverrides` React state. It also triggers a visual toast message (e.g. `Scout set to gemini-3.1-flash-lite`) to confirm the selection to the user before they hit **"Run pipeline"**.

### 2. Enforcing JSON Schema Required Fields (No Code Fallbacks)
*   **Gemini Schema Validation:** To prevent Gemini from returning empty fields or omitting properties, **JSON Schema validation (`required` arrays)** must be specified in the schema sent to `geminiJson`.
*   **Scout Schema:** In `Jugar/scout_index.ts`, `required` properties have been added for the query expansion schema (`queries`) and the source scoring schema (both top-level metadata and individual source arrays).
*   **Intelligence Schema:** In `Jugar/intelligence_index.ts`, all output keys (like `best_angle`, `content_brief`, `key_facts`, and sub-items) are strictly defined in `required` arrays.
*   **Prompt Constraints:** Prompt instructions have been refined in both Scout and Intelligence to forbid empty strings, nulls, or empty arrays. The models are instructed to generate meaningful topic-aware defaults even when 0 external sources are found.

---

## Instructions for Merging Changes

1.  If you make changes to a file inside the `Jugar` directory, make sure you also update the corresponding original file at its actual project path listed in the mapping table.
2.  Test the edge functions locally or deploy them to verify syntax and runtime stability before committing:
    ```bash
    npx supabase functions deploy <function-name> --project-ref esrqqkjkwomqlxjpcefg
    ```
