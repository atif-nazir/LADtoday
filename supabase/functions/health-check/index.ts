// ============================================================
// Health Check Edge Function
// Returns real-time pipeline and system health
// Can be called on-demand or via cron
// ============================================================

import { calculatePipelineHealth, calculateSystemHealth, storeHealthData } from "../_shared/health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[HealthCheck] Calculating health metrics...");
    
    // Calculate both pipeline and system health
    const [pipelineHealth, systemHealth] = await Promise.all([
      calculatePipelineHealth(),
      calculateSystemHealth(),
    ]);

    // Store in database for historical tracking
    await storeHealthData(pipelineHealth, systemHealth);

    console.log(`[HealthCheck] ✅ Pipeline: ${pipelineHealth.overall_status}, System: ${systemHealth.overall_status}`);

    return new Response(
      JSON.stringify({
        ok: true,
        pipeline: pipelineHealth,
        system: systemHealth,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[HealthCheck] ❌ Failed:", message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
