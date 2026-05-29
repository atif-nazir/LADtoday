// supabase/functions/intelligence/index.ts
// Intelligence — AI/ML API GPT-4o (preferred) with Gemini fallback; Cognee memory optional.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AIML_KEY = Deno.env.get("AIML_API_KEY") || "";
const COGNEE_KEY = Deno.env.get("COGNEE_API_KEY") || "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function recallMemory(topic: string): Promise<{ text: string; source: string }> {
  // Try Cognee first
  if (COGNEE_KEY) {
    try {
      const res = await fetch("https://api.cognee.ai/v1/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${COGNEE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `successful angles for ${topic}`, query_type: "INSIGHTS", dataset_name: "ladtoday_performance" }),
      });
      if (res.ok) {
        const d = await res.json();
        const items = d.items || [];
        if (items.length) return { text: items.slice(0, 3).map((i: any) => i.text).join("\n"), source: "cognee" };
      }
    } catch (e) { console.error("cognee error", e); }
  }
  // Fallback: local agent_memory table
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("topic_category, angle_type, virality_score, share_emotion, recommended_angle:differentiator_used")
      .eq("agent_key", "intelligence")
      .order("created_at", { ascending: false })
      .limit(3);
    if (data && data.length) {
      const text = data.map((d: any) => `Past angle: ${d.angle_type} (virality ${d.virality_score})`).join("\n");
      return { text, source: "local_memory" };
    }
  } catch { /* ignore */ }
  return { text: "No prior performance data.", source: "none" };
}

async function aimlAnalyze(sources: any[], topic: string, mode: string, memory: string) {
  const sourceText = sources.map((s, i) =>
    `[${i + 1}] ${s.title} (cred ${(s.sourceCredibility || 0.5).toFixed(1)})\nURL: ${s.url}\n${(s.content || s.snippet || "").slice(0, 1200)}`
  ).join("\n\n---\n\n");

  const system = `You are LADtoday's Intelligence Agent for the ${mode.toUpperCase()} track.
Past memory: ${memory}

Output ONLY this JSON (no markdown):
{
 "summary": "3-sentence executive summary",
 "key_insights": ["insight 1","insight 2","insight 3","insight 4"],
 "contradictions": [{"claim_a":"","source_a":"","claim_b":"","source_b":"","resolution":""}],
 "sentiment": "positive|negative|neutral|mixed",
 "recommended_angle": "specific framing",
 "key_entities": ["entity1","entity2"],
 "credibility_score": 75,
 "suggested_tone": "professional|conversational|editorial|urgent",
 "draft_hook": "single compelling opening sentence"
}
Rules: every insight traceable to a source; flag genuine contradictions only; no empty arrays/strings.`;

  const res = await fetch("https://api.aimlapi.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${AIML_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `TOPIC: ${topic}\nSOURCES:\n${sourceText}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`aiml ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return { brief: JSON.parse(d.choices[0].message.content), model_used: "aiml-gpt-4o", tokens_used: d.usage?.total_tokens || 0 };
}

async function geminiAnalyze(sources: any[], topic: string, mode: string, memory: string) {
  const sourceText = sources.map((s, i) =>
    `[${i + 1}] ${s.title}\n${(s.content || s.snippet || "").slice(0, 1000)}`
  ).join("\n\n");
  const prompt = `You are LADtoday's Intelligence Agent (${mode} track). Past memory: ${memory}
Sources:
${sourceText}

Topic: ${topic}

Return ONLY JSON:
{"summary":"...","key_insights":["...","...","...","..."],"contradictions":[],"sentiment":"neutral","recommended_angle":"...","key_entities":["..."],"credibility_score":75,"suggested_tone":"professional","draft_hook":"..."}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1500, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const d = await res.json();
  const raw = d.candidates[0].content.parts[0].text;
  return { brief: JSON.parse(raw), model_used: "gemini-2.5-flash", tokens_used: 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { sources = [], topic, mode = "gtm", recall_memory = true } = await req.json();
  if (!sources.length) {
    return new Response(JSON.stringify({ error: "no sources" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const mem = recall_memory ? await recallMemory(topic) : { text: "", source: "skipped" };

  let result;
  try {
    result = AIML_KEY ? await aimlAnalyze(sources, topic, mode, mem.text) : await geminiAnalyze(sources, topic, mode, mem.text);
  } catch (e) {
    console.error("primary analyze failed, falling back to gemini", e);
    result = await geminiAnalyze(sources, topic, mode, mem.text);
  }

  // Store this run in local memory
  try {
    await supabase.from("agent_memory").insert({
      agent_key: "intelligence",
      topic_category: topic.slice(0, 100),
      angle_type: result.brief?.recommended_angle?.slice(0, 100),
      content_brief_style: result.brief?.suggested_tone,
      virality_score: result.brief?.credibility_score / 100,
    });
  } catch { /* ignore */ }

  return new Response(JSON.stringify({
    ...result,
    metadata: {
      sources_analyzed: sources.length,
      memory_source: mem.source,
      memory_hits: mem.source !== "none" ? 1 : 0,
      topic, mode,
      learning_applied: true,
    },
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
