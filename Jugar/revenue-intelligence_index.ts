// ============================================================
// Agent 45 - Revenue Intelligence Agent
// Phase: MONETIZE | Model: gemini-2.5-flash | Depends on: adsense-optimizer,affiliate-detector
// ============================================================
// Aggregates monetization data and produces revenue recommendations
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson } from "../_shared/gemini.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState } from "../_shared/pipeline.ts";
import { insertLog } from "../_shared/logger.ts";

const AGENT_KEY = "revenue-intelligence";
const AGENT_NAME = "Revenue Intelligence Agent";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const start = Date.now();
  let runId: string | null = null;
  try {
    let body: any = {}; try { body = await req.json(); } catch {}
    runId = body.run_id || null;
    if (runId) await patchAgentState(runId, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const upstream: Record<string, any> = {};
    if (runId) {
      for (const dep of ["adsense-optimizer","affiliate-detector"]) {
        try { upstream[dep] = await readAgentOutput(runId, dep); } catch {}
      }
    }

    const topic = body.topic || upstream["rewrite"]?.ai_title || upstream["scout"]?.topic || upstream["intelligence"]?.best_angle || "Pakistan digital media";
    const articleContent = upstream["rewrite"]?.article_html || upstream["rewrite"]?.content || "";

    const prompt = `You are a specialized AI agent (Revenue Intelligence Agent) for Pakistani digital media platform LADtoday.
Topic: "${topic}"
Article (first 3000 chars): ${articleContent.slice(0, 3000)}
Upstream context: ${JSON.stringify(Object.fromEntries(Object.entries(upstream).map(([k,v]) => [k, JSON.stringify(v).slice(0, 300)])), null, 0).slice(0, 1500)}

Produce revenue intelligence report. Aggregate: AdSense optimization signals, affiliate opportunities, lead magnet potential. Estimate revenue per article (PKR and USD). Identify top-performing content categories for Pakistani market. Provide 5 actionable revenue optimization recommendations.`;

    const schema = { type: "object", properties: {} as Record<string, any> };
    const result = await geminiJson(prompt, schema, { temperature: 0.7, maxOutputTokens: 4096 });

    if (runId) {
      await writeAgentOutput(runId, AGENT_KEY, result);
      await patchAgentState(runId, AGENT_KEY, { status: "completed", finished_at: new Date().toISOString(), duration_ms: Date.now() - start });
      await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, `run_id=${runId}`);
    }
    return new Response(JSON.stringify({ ok: true, agent: AGENT_KEY, result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    if (runId) await patchAgentState(runId, AGENT_KEY, { status: "failed", error: String(err), finished_at: new Date().toISOString() }).catch(() => {});
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
