// ============================================================
// Preview Writer (test agent, NOT in DAG)
// Generates a draft article from whatever agent_outputs exist
// for a given run. Lets you compare quality at each step.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson } from "../_shared/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  // Verify Supabase JWT
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data } = await userClient.auth.getUser();
    if (!data?.user) return false;
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    return !!role;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!await verifyServiceOrAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { run_id, model = "gemini-2.5-flash" } = await req.json().catch(() => ({}));
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: run } = await supabase.from("pipeline_runs").select("*").eq("id", run_id).maybeSingle();
    if (!run) {
      return new Response(JSON.stringify({ error: "run not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: outputs } = await supabase
      .from("agent_outputs")
      .select("agent_key, output, status")
      .eq("run_id", run_id)
      .eq("status", "completed");

    const usedAgents: string[] = (outputs || []).map(o => o.agent_key);
    if (usedAgents.length === 0) {
      return new Response(JSON.stringify({
        error: "No completed agent outputs yet — run at least Scout first.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build a compact context block, one section per agent
    const contextBlock = (outputs || []).map(o => {
      const trimmed = JSON.stringify(o.output).slice(0, 3500);
      return `### AGENT: ${o.agent_key}\n${trimmed}`;
    }).join("\n\n");

    const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        html: { type: "string" },
        word_count: { type: "number" },
        quality_notes: { type: "string" },
      },
      required: ["title", "subtitle", "html", "word_count", "quality_notes"],
    };

    const prompt = `You are LADtoday's senior editor. Write a Pakistani-context article DRAFT using ONLY the agent outputs below — do NOT invent facts, do NOT add sources not present.

TOPIC: "${run.topic}"
BRAND VOICE: ${run.brand_voice}
LANGUAGE: ${run.language}

AGENTS THAT HAVE PRODUCED OUTPUTS SO FAR (${usedAgents.length}): ${usedAgents.join(", ")}

${contextBlock}

INSTRUCTIONS:
- If Scout sources are present, cite at least 2 of them inline as <a href="...">domain</a>.
- If Audience Listener vocabulary/pain points are present, use that exact vocabulary naturally.
- If Headline Optimizer is present, use its top headline as the title.
- If only Scout is present, write a tight 350-500 word brief based on its sources.
- If 3+ agents are present, write 700-1000 words with proper structure.
- HTML must use <h2>, <p>, <ul>, <a> tags only. No <html>, <head>, <body>, no inline styles.
- quality_notes: 2 sentences telling the editor what's missing from this draft because of agents that haven't run yet (be specific: name them).

Return JSON: { "title", "subtitle", "html", "word_count", "quality_notes" }`;

    const result = await geminiJson<{
      title: string; subtitle: string; html: string; word_count: number; quality_notes: string;
    }>(prompt, schema, { model, temperature: 0.6, maxOutputTokens: 6144 });

    return new Response(JSON.stringify({
      ok: true,
      run_id,
      used_agents: usedAgents,
      ...result,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[preview-writer]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
